import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  auditPhoneEvent,
  maskPhone,
  normalizeCountryCode,
  normalizeE164,
  normalizeOtp,
  phoneLog,
  requestFingerprint,
  sha256Hex,
  twilioVerifyRequest,
} from "./client-phone.ts";

type SupabaseAdmin = ReturnType<typeof createClient>;

export type ActorRole = "client" | "provider";
export type OtpPurpose =
  | "signup"
  | "login_new_device"
  | "phone_change"
  | "account_recovery"
  | "high_risk_action"
  | "first_real_service"
  | "suspicious_activity"
  | "phone_verification";

export type DeviceContext = {
  deviceId: string | null;
  fingerprintHash: string | null;
  platform: string | null;
  appVersion: string | null;
  userAgent: string;
};

export type ActorContext = {
  actorRole: ActorRole;
  user: any;
  providerId: string | null;
  profile: Record<string, any> | null;
  provider: Record<string, any> | null;
};

const TRUST_DAYS_CLIENT = Number(Deno.env.get("MIMI_CLIENT_TRUSTED_DEVICE_DAYS") || 30);
const TRUST_DAYS_PROVIDER = Number(Deno.env.get("MIMI_PROVIDER_TRUSTED_DEVICE_DAYS") || 30);
const PROVIDER_STALE_DAYS = Number(Deno.env.get("MIMI_PROVIDER_STALE_LOGIN_DAYS") || 14);

const PHONE_HOUR_LIMIT = 3;
const PHONE_DAY_LIMIT = 5;
const IP_DAY_LIMIT = 10;
const DEVICE_DAY_LIMIT = 5;
const COOLDOWN_SECONDS = 60;

export function actorRoleFromBody(body: Record<string, unknown>): ActorRole {
  return String(body.actor_role || body.actorRole || "client").toLowerCase() === "provider"
    ? "provider"
    : "client";
}

export function purposeFromBody(body: Record<string, unknown>): OtpPurpose {
  const value = String(body.purpose || "phone_verification");
  const allowed = new Set([
    "signup",
    "login_new_device",
    "phone_change",
    "account_recovery",
    "high_risk_action",
    "first_real_service",
    "suspicious_activity",
    "phone_verification",
  ]);
  return allowed.has(value) ? value as OtpPurpose : "phone_verification";
}

export async function deviceContextFromBody(req: Request, body: Record<string, unknown>, userId: string): Promise<DeviceContext> {
  const rawDeviceId = String(body.device_id || body.deviceId || "").trim();
  const deviceId = rawDeviceId && rawDeviceId.length >= 12 && rawDeviceId.length <= 180
    ? rawDeviceId
    : null;
  const platform = cleanText(body.platform, 80) || null;
  const appVersion = cleanText(body.app_version || body.appVersion, 80) || null;
  const userAgent = req.headers.get("user-agent") || "";
  const secret = Deno.env.get("PHONE_VERIFICATION_AUDIT_SECRET") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const fingerprintHash = deviceId
    ? await sha256Hex(`${userId}:${deviceId}:${platform || ""}:${appVersion || ""}:${userAgent}:${secret}`)
    : null;

  return { deviceId, fingerprintHash, platform, appVersion, userAgent };
}

export async function resolveActorContext(admin: SupabaseAdmin, user: any, actorRole: ActorRole): Promise<ActorContext> {
  if (actorRole === "provider") {
    const { data: provider, error: providerError } = await admin
      .from("svc_providers")
      .select("id,user_id,full_name,email,phone,avatar_url,status,approved,blocked,last_seen_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (providerError) throw providerError;
    if (!provider?.id) throw new Error("provider_profile_not_found");

    const { data: existingProfile, error: existingError } = await admin
      .from("svc_provider_profiles")
      .select("*")
      .eq("provider_id", provider.id)
      .maybeSingle();
    if (existingError) throw existingError;

    let profile = existingProfile;
    if (!profile) {
      const { data: createdProfile, error: createError } = await admin
        .from("svc_provider_profiles")
        .insert({
          provider_id: provider.id,
          phone_number: normalizeOptionalPhone(provider.phone),
        })
        .select("*")
        .single();
      if (createError) throw createError;
      profile = createdProfile;
    }

    profile = await inheritVerifiedClientPhoneForProvider(admin, user.id, provider.id, profile);

    return { actorRole, user, providerId: provider.id, provider, profile };
  }

  const { data: profile, error } = await admin
    .from("svc_client_profiles")
    .upsert({
      user_id: user.id,
      full_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email || null,
      email: user.email || null,
      avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
      metadata_json: {
        source: "auth_otp_actor_context",
        last_status_sync_at: new Date().toISOString(),
      },
    }, { onConflict: "user_id", ignoreDuplicates: false })
    .select("*")
    .single();
  if (error) throw error;
  return { actorRole, user, providerId: null, provider: null, profile };
}

async function inheritVerifiedClientPhoneForProvider(
  admin: SupabaseAdmin,
  userId: string,
  providerId: string,
  providerProfile: Record<string, any> | null,
) {
  if (providerProfile?.phone_verified === true) return providerProfile;

  const { data: clientProfile, error: clientError } = await admin
    .from("svc_client_profiles")
    .select("phone_number,country_code,phone_verified,phone_verified_at,phone_updated_at,phone_last_change_at,trusted_device,trusted_until,last_verified_device_id,auth_risk_level,metadata_json")
    .eq("user_id", userId)
    .eq("phone_verified", true)
    .maybeSingle();
  if (clientError) throw clientError;
  if (!clientProfile?.phone_number) return providerProfile;

  const nowIso = new Date().toISOString();
  const { data: updatedProfile, error: updateError } = await admin
    .from("svc_provider_profiles")
    .update({
      phone_number: clientProfile.phone_number,
      phone_country_code: clientProfile.country_code,
      phone_verified: true,
      phone_verified_at: clientProfile.phone_verified_at || nowIso,
      phone_updated_at: clientProfile.phone_updated_at || nowIso,
      phone_last_change_at: clientProfile.phone_last_change_at || clientProfile.phone_verified_at || nowIso,
      trusted_device: clientProfile.trusted_device === true,
      trusted_until: clientProfile.trusted_until,
      last_verified_device_id: clientProfile.last_verified_device_id,
      auth_risk_level: clientProfile.auth_risk_level || "low",
      metadata_json: {
        ...(providerProfile?.metadata_json || {}),
        source: "client_phone_verification_inherited",
        inherited_from_client_profile: true,
        inherited_at: nowIso,
      },
    })
    .eq("provider_id", providerId)
    .select("*")
    .single();
  if (updateError) throw updateError;
  return updatedProfile;
}

export async function getDeviceTrust(
  admin: SupabaseAdmin,
  context: ActorContext,
  device: DeviceContext,
) {
  if (!device.deviceId || !device.fingerprintHash) return null;
  const { data, error } = await admin
    .from("auth_device_trust")
    .select("*")
    .eq("user_id", context.user.id)
    .eq("device_id", device.deviceId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function touchDeviceTrust(
  admin: SupabaseAdmin,
  context: ActorContext,
  device: DeviceContext,
  riskLevel = "low",
) {
  if (!device.deviceId || !device.fingerprintHash) return null;
  const payload = {
    user_id: context.user.id,
    device_id: device.deviceId,
    fingerprint_hash: device.fingerprintHash,
    actor_role: context.actorRole,
    platform: device.platform,
    app_version: device.appVersion,
    risk_level: riskLevel,
    last_seen_at: new Date().toISOString(),
    metadata_json: {
      provider_id: context.providerId,
      source: "auth_device_touch",
    },
  };

  const { data, error } = await admin
    .from("auth_device_trust")
    .upsert(payload, { onConflict: "user_id,device_id", ignoreDuplicates: false })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function evaluateAuthRisk(
  admin: SupabaseAdmin,
  context: ActorContext,
  device: DeviceContext,
  purpose: OtpPurpose,
) {
  const now = Date.now();
  const profile = context.profile ?? {};
  const phoneVerified = profile.phone_verified === true;
  const criticalPurpose = ["phone_change", "account_recovery", "high_risk_action", "first_real_service", "suspicious_activity"].includes(purpose);
  let riskScore = context.actorRole === "provider" ? 25 : 10;
  const reasons: string[] = [];

  let trust = null;
  if (device.deviceId && device.fingerprintHash) {
    trust = await getDeviceTrust(admin, context, device);
  } else {
    riskScore += 20;
    reasons.push("missing_device_id");
  }

  const trustedUntil = trust?.trusted_until ? Date.parse(trust.trusted_until) : 0;
  const trustedDevice = Boolean(trust?.trusted) && !trust?.revoked_at && trustedUntil > now;
  const lastSeenAt = trust?.last_seen_at ? Date.parse(trust.last_seen_at) : 0;
  const providerStale = context.actorRole === "provider" && lastSeenAt > 0 && now - lastSeenAt > PROVIDER_STALE_DAYS * 24 * 60 * 60 * 1000;

  if (!phoneVerified) {
    riskScore += context.actorRole === "provider" ? 35 : 25;
    reasons.push("phone_not_verified");
  }
  if (!trustedDevice) {
    riskScore += context.actorRole === "provider" ? 35 : 25;
    reasons.push(trust ? "device_not_trusted_or_expired" : "new_device");
  }
  if (providerStale) {
    riskScore += 25;
    reasons.push("provider_stale_login");
  }
  if (criticalPurpose) {
    riskScore += context.actorRole === "provider" ? 35 : 25;
    reasons.push(`critical_${purpose}`);
  }

  if (device.fingerprintHash) {
    const { count } = await admin
      .from("auth_device_trust")
      .select("user_id", { count: "exact", head: true })
      .eq("fingerprint_hash", device.fingerprintHash);
    if ((count || 0) >= 4) {
      riskScore += 40;
      reasons.push("multi_account_device_pattern");
    }
  }

  const riskLevel =
    riskScore >= 85 ? "blocked" :
    riskScore >= 55 ? "high" :
    riskScore >= 30 ? "medium" :
    "low";

  if (device.deviceId && device.fingerprintHash) {
    trust = await touchDeviceTrust(admin, context, device, riskLevel);
  }

  const requiresOtp = !phoneVerified || !trustedDevice || criticalPurpose || providerStale || riskLevel === "high" || riskLevel === "blocked";

  return {
    phone_verified: phoneVerified,
    trusted_device: trustedDevice,
    trusted_until: trust?.trusted_until ?? null,
    risk_score: riskScore,
    risk_level: riskLevel,
    requires_otp: requiresOtp,
    reasons,
    device_trust: trust,
  };
}

export async function enforceOtpRateLimits(
  admin: SupabaseAdmin,
  input: {
    userId: string;
    phoneNumber: string;
    device: DeviceContext;
    req: Request;
  },
) {
  const now = Date.now();
  const hourAgo = new Date(now - 60 * 60 * 1000).toISOString();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const fingerprint = await requestFingerprint(input.req);
  const latest = await latestAttempt(admin, input.userId, input.phoneNumber);

  if (latest?.blocked_until && Date.parse(latest.blocked_until) > now) {
    return rateLimited("otp_blocked", Math.ceil((Date.parse(latest.blocked_until) - now) / 1000));
  }

  if (latest?.created_at && Date.parse(latest.created_at) > now - COOLDOWN_SECONDS * 1000) {
    return rateLimited("otp_recently_sent", COOLDOWN_SECONDS);
  }

  const [phoneHour, phoneDay, ipDay, deviceDay] = await Promise.all([
    countAttempts(admin, (query) => query.eq("phone_number", input.phoneNumber).gte("created_at", hourAgo)),
    countAttempts(admin, (query) => query.eq("phone_number", input.phoneNumber).gte("created_at", dayAgo)),
    fingerprint.ip_hash
      ? countAttempts(admin, (query) => query.eq("ip_hash", fingerprint.ip_hash).gte("created_at", dayAgo))
      : Promise.resolve(0),
    input.device.deviceId
      ? countAttempts(admin, (query) => query.eq("device_id", input.device.deviceId).gte("created_at", dayAgo))
      : Promise.resolve(0),
  ]);

  if (phoneHour >= PHONE_HOUR_LIMIT) return rateLimited("otp_phone_hour_limited", 15 * 60);
  if (phoneDay >= PHONE_DAY_LIMIT) return rateLimited("otp_phone_day_limited", 60 * 60);
  if (ipDay >= IP_DAY_LIMIT) return rateLimited("otp_ip_day_limited", 60 * 60);
  if (deviceDay >= DEVICE_DAY_LIMIT) return rateLimited("otp_device_day_limited", 60 * 60);

  return { ok: true, fingerprint };
}

export async function findReusableAttempt(
  admin: SupabaseAdmin,
  input: {
    userId: string;
    phoneNumber: string;
    actorRole: ActorRole;
    purpose: OtpPurpose;
  },
) {
  const { data, error } = await admin
    .from("svc_phone_verification_attempts")
    .select("id,created_at,expires_at,status,channel")
    .eq("user_id", input.userId)
    .eq("phone_number", input.phoneNumber)
    .eq("actor_role", input.actorRole)
    .eq("purpose", input.purpose)
    .in("status", ["pending", "sent"])
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function createOtpAttemptAndSend(
  admin: SupabaseAdmin,
  input: {
    context: ActorContext;
    device: DeviceContext;
    req: Request;
    phoneNumber: string;
    countryCode: string;
    countryIso: string | null;
    purpose: OtpPurpose;
    risk: Awaited<ReturnType<typeof evaluateAuthRisk>>;
    preferredChannel?: string | null;
  },
) {
  const duplicate = await findDuplicateVerifiedPhone(admin, input.context, input.phoneNumber);
  if (duplicate) {
    return { ok: false, error: "phone_already_used", status: 409 };
  }

  const reusable = await findReusableAttempt(admin, {
    userId: input.context.user.id,
    phoneNumber: input.phoneNumber,
    actorRole: input.context.actorRole,
    purpose: input.purpose,
  });
  if (reusable) {
    return {
      ok: true,
      reused: true,
      attempt_id: reusable.id,
      masked_phone: maskPhone(input.phoneNumber),
      expires_at: reusable.expires_at,
      channel: reusable.channel,
    };
  }

  const rate = await enforceOtpRateLimits(admin, {
    userId: input.context.user.id,
    phoneNumber: input.phoneNumber,
    device: input.device,
    req: input.req,
  });
  if (!rate.ok) {
    return { ok: false, error: rate.error, retry_after_seconds: rate.retry_after_seconds, status: 429 };
  }

  const nowIso = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  const cooldownUntil = new Date(Date.now() + COOLDOWN_SECONDS * 1000).toISOString();
  const requestedChannel = chooseOtpChannel(input.preferredChannel);

  const { data: attempt, error: insertError } = await admin
    .from("svc_phone_verification_attempts")
    .insert({
      user_id: input.context.user.id,
      phone_number: input.phoneNumber,
      country_code: input.countryCode,
      channel: requestedChannel,
      provider: "twilio_verify",
      status: "pending",
      expires_at: expiresAt,
      actor_role: input.context.actorRole,
      provider_id: input.context.providerId,
      purpose: input.purpose,
      device_id: input.device.deviceId,
      fingerprint_hash: input.device.fingerprintHash,
      risk_level: input.risk.risk_level,
      risk_score: input.risk.risk_score,
      country_iso: input.countryIso,
      cooldown_until: cooldownUntil,
      ...rate.fingerprint,
      metadata_json: {
        risk_reasons: input.risk.reasons,
        app_version: input.device.appVersion,
        platform: input.device.platform,
      },
    })
    .select("id")
    .single();
  if (insertError) throw insertError;

  let finalChannel = requestedChannel;
  let verificationSid: string | null = null;

  try {
    const verification = await sendTwilioOtp(input.phoneNumber, requestedChannel);
    verificationSid = String(verification.sid || "");
  } catch (sendError) {
    if (requestedChannel === "whatsapp" && smsFallbackEnabled()) {
      const verification = await sendTwilioOtp(input.phoneNumber, "sms");
      finalChannel = "sms";
      verificationSid = String(verification.sid || "");
    } else {
      const reason = sendError instanceof Error ? sendError.message : "sms_provider_error";
      await admin
        .from("svc_phone_verification_attempts")
        .update({ status: "failed", reason })
        .eq("id", attempt.id);
      throw sendError;
    }
  }

  const { error: updateError } = await admin
    .from("svc_phone_verification_attempts")
    .update({
      status: "sent",
      channel: finalChannel,
      provider_verification_sid: verificationSid,
      sent_at: nowIso,
    })
    .eq("id", attempt.id);
  if (updateError) throw updateError;

  await markProfileOtpSent(admin, input.context, {
    channel: finalChannel,
    ipHash: rate.fingerprint?.ip_hash ?? null,
    riskLevel: input.risk.risk_level,
  });

  return {
    ok: true,
    attempt_id: attempt.id,
    masked_phone: maskPhone(input.phoneNumber),
    expires_at: expiresAt,
    channel: finalChannel,
  };
}

export async function verifyOtpAndTrustDevice(
  admin: SupabaseAdmin,
  input: {
    context: ActorContext;
    device: DeviceContext;
    req: Request;
    attemptId: string;
    phoneNumber: string;
    code: string;
  },
) {
  const code = normalizeOtp(input.code);
  const { data: attempts, error: attemptError } = await admin
    .from("svc_phone_verification_attempts")
    .select("*")
    .eq("id", input.attemptId)
    .eq("user_id", input.context.user.id)
    .eq("phone_number", input.phoneNumber)
    .in("status", ["pending", "sent"])
    .gt("expires_at", new Date().toISOString())
    .limit(1);
  if (attemptError) throw attemptError;
  const attempt = attempts?.[0] ?? null;
  if (!attempt) return { ok: false, error: "otp_not_found_or_expired", status: 404 };

  const nextAttempts = Number(attempt.attempts || 0) + 1;
  if (nextAttempts > Number(attempt.max_attempts || 5)) {
    await admin.from("svc_phone_verification_attempts")
      .update({ status: "failed", reason: "max_attempts_exceeded", attempts: nextAttempts })
      .eq("id", attempt.id);
    return { ok: false, error: "otp_attempts_exceeded", status: 429 };
  }

  const verification = await twilioVerifyRequest("/VerificationCheck", {
    To: input.phoneNumber,
    Code: code,
  });
  const approved = String(verification.status || "").toLowerCase() === "approved";

  if (!approved) {
    await admin.from("svc_phone_verification_attempts")
      .update({
        attempts: nextAttempts,
        status: nextAttempts >= Number(attempt.max_attempts || 5) ? "failed" : "sent",
        reason: nextAttempts >= Number(attempt.max_attempts || 5) ? "max_attempts_exceeded" : "code_invalid",
      })
      .eq("id", attempt.id);
    return {
      ok: false,
      error: nextAttempts >= Number(attempt.max_attempts || 5) ? "otp_attempts_exceeded" : "otp_invalid",
      attempts: nextAttempts,
      remaining_attempts: Math.max(0, Number(attempt.max_attempts || 5) - nextAttempts),
      status: nextAttempts >= Number(attempt.max_attempts || 5) ? 429 : 400,
    };
  }

  const nowIso = new Date().toISOString();
  await admin.from("svc_phone_verification_attempts")
    .update({ status: "approved", attempts: nextAttempts, verified_at: nowIso, reason: null })
    .eq("id", attempt.id);

  const profile = await markProfilePhoneVerified(admin, input.context, {
    phoneNumber: input.phoneNumber,
    countryCode: attempt.country_code,
    attemptId: attempt.id,
    countryIso: attempt.country_iso,
  });
  const trust = await trustDevice(admin, input.context, input.device, {
    purpose: attempt.purpose,
    riskLevel: attempt.risk_level,
  });

  await auditPhoneEvent(admin, {
    userId: input.context.user.id,
    eventType: `${input.context.actorRole}_phone_verified`,
    entityId: profile?.id ?? input.context.user.id,
    req: input.req,
    metadata: {
      attempt_id: attempt.id,
      actor_role: input.context.actorRole,
      purpose: attempt.purpose,
      device_id: input.device.deviceId,
      provider_id: input.context.providerId,
    },
  });

  return {
    ok: true,
    profile,
    device_trust: trust,
    masked_phone: maskPhone(input.phoneNumber),
  };
}

export async function markProfileOtpSent(
  admin: SupabaseAdmin,
  context: ActorContext,
  input: { channel: string; ipHash: string | null; riskLevel: string },
) {
  const payload = {
    last_otp_sent_at: new Date().toISOString(),
    otp_last_ip: input.ipHash,
    otp_last_channel: input.channel,
    auth_risk_level: input.riskLevel,
  };

  if (context.actorRole === "provider") {
    const { error } = await admin
      .from("svc_provider_profiles")
      .update({
        ...payload,
        otp_send_count: Number(context.profile?.otp_send_count || 0) + 1,
      })
      .eq("provider_id", context.providerId);
    if (error) throw error;
    return;
  }

  const { error } = await admin
    .from("svc_client_profiles")
    .update({
      ...payload,
      otp_send_count: Number(context.profile?.otp_send_count || 0) + 1,
    })
    .eq("user_id", context.user.id);
  if (error) throw error;
}

export async function markProfilePhoneVerified(
  admin: SupabaseAdmin,
  context: ActorContext,
  input: { phoneNumber: string; countryCode: string; attemptId: string; countryIso?: string | null },
) {
  const nowIso = new Date().toISOString();
  const commonPayload = {
    phone_number: input.phoneNumber,
    phone_verified: true,
    phone_verified_at: nowIso,
    phone_updated_at: nowIso,
    phone_last_change_at: nowIso,
    last_verified_device_id: null as string | null,
    auth_risk_level: "low",
    metadata_json: {
      source: "enterprise_otp_verified",
      last_phone_attempt_id: input.attemptId,
      country_iso: input.countryIso || null,
    },
  };

  if (context.actorRole === "provider") {
    const { data, error } = await admin
      .from("svc_provider_profiles")
      .update({
        ...commonPayload,
        phone_country_code: input.countryCode,
      })
      .eq("provider_id", context.providerId)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await admin
    .from("svc_client_profiles")
    .update({
      ...commonPayload,
      country_code: input.countryCode,
    })
    .eq("user_id", context.user.id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function trustDevice(
  admin: SupabaseAdmin,
  context: ActorContext,
  device: DeviceContext,
  input: { purpose: string; riskLevel: string },
) {
  if (!device.deviceId || !device.fingerprintHash) return null;
  const trustDays = context.actorRole === "provider" ? TRUST_DAYS_PROVIDER : TRUST_DAYS_CLIENT;
  const trustedUntil = new Date(Date.now() + trustDays * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from("auth_device_trust")
    .upsert({
      user_id: context.user.id,
      device_id: device.deviceId,
      fingerprint_hash: device.fingerprintHash,
      actor_role: context.actorRole,
      trusted: true,
      trusted_until: trustedUntil,
      revoked_at: null,
      platform: device.platform,
      app_version: device.appVersion,
      risk_level: input.riskLevel,
      trust_reason: input.purpose,
      last_seen_at: new Date().toISOString(),
      metadata_json: {
        provider_id: context.providerId,
        source: "otp_verified",
      },
    }, { onConflict: "user_id,device_id", ignoreDuplicates: false })
    .select("*")
    .single();
  if (error) throw error;

  const profilePayload = {
    trusted_device: true,
    trusted_until: trustedUntil,
    last_verified_device_id: device.deviceId,
    auth_risk_level: input.riskLevel === "blocked" ? "high" : "low",
  };
  if (context.actorRole === "provider") {
    const { error } = await admin.from("svc_provider_profiles").update(profilePayload).eq("provider_id", context.providerId);
    if (error) throw error;
  } else {
    const { error } = await admin.from("svc_client_profiles").update(profilePayload).eq("user_id", context.user.id);
    if (error) throw error;
  }
  return data;
}

export function phoneForContext(context: ActorContext, fallback?: unknown) {
  const raw = fallback || context.profile?.phone_number || context.provider?.phone || "";
  return normalizeE164(raw);
}

export function countryForPhone(value: unknown, phoneNumber: string) {
  return normalizeCountryCode(value, phoneNumber);
}

export function smsConfigured() {
  return Boolean(
    Deno.env.get("TWILIO_ACCOUNT_SID") &&
    Deno.env.get("TWILIO_AUTH_TOKEN") &&
    Deno.env.get("TWILIO_VERIFY_SERVICE_SID")
  );
}

function chooseOtpChannel(preferred?: string | null) {
  const whatsappEnabled = String(Deno.env.get("MIMI_OTP_WHATSAPP_ENABLED") || "").toLowerCase() === "true";
  if (whatsappEnabled && String(preferred || "").toLowerCase() === "whatsapp") return "whatsapp";
  if (whatsappEnabled && String(Deno.env.get("MIMI_OTP_WHATSAPP_FIRST") || "").toLowerCase() === "true") return "whatsapp";
  return "sms";
}

function smsFallbackEnabled() {
  return String(Deno.env.get("MIMI_OTP_SMS_FALLBACK") || "true").toLowerCase() !== "false";
}

async function sendTwilioOtp(phoneNumber: string, channel: string) {
  return twilioVerifyRequest("/Verifications", {
    To: phoneNumber,
    Channel: channel,
    Locale: "es",
  });
}

async function countAttempts(admin: SupabaseAdmin, build: (query: any) => any) {
  const { count, error } = await build(
    admin.from("svc_phone_verification_attempts").select("id", { count: "exact", head: true }),
  );
  if (error) throw error;
  return count || 0;
}

async function latestAttempt(admin: SupabaseAdmin, userId: string, phoneNumber: string) {
  const { data, error } = await admin
    .from("svc_phone_verification_attempts")
    .select("id,created_at,blocked_until,status")
    .eq("user_id", userId)
    .eq("phone_number", phoneNumber)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}

async function findDuplicateVerifiedPhone(admin: SupabaseAdmin, context: ActorContext, phoneNumber: string) {
  const { data: clientRows, error: clientError } = await admin
    .from("svc_client_profiles")
    .select("user_id")
    .eq("phone_number", phoneNumber)
    .eq("phone_verified", true)
    .neq("user_id", context.user.id)
    .limit(1);
  if (clientError) throw clientError;
  if ((clientRows || []).length > 0) return { role: "client" };

  let providerQuery = admin
    .from("svc_provider_profiles")
    .select("provider_id")
    .eq("phone_number", phoneNumber)
    .eq("phone_verified", true);

  if (context.providerId) {
    providerQuery = providerQuery.neq("provider_id", context.providerId);
  }

  const { data: providerRows, error: providerError } = await providerQuery.limit(20);
  if (providerError) throw providerError;
  const providerIds = (providerRows || [])
    .map((row) => row.provider_id)
    .filter(Boolean);

  if (!providerIds.length) return null;

  const { data: providers, error: ownersError } = await admin
    .from("svc_providers")
    .select("id,user_id")
    .in("id", providerIds);
  if (ownersError) throw ownersError;

  const duplicate = (providers || []).find((provider) => provider.user_id !== context.user.id);
  return duplicate ? { role: "provider", provider_id: duplicate.id } : null;
}

function rateLimited(error: string, retryAfter: number) {
  return { ok: false, error, retry_after_seconds: retryAfter };
}

function cleanText(value: unknown, max = 160) {
  return String(value || "").trim().slice(0, max);
}

function normalizeOptionalPhone(value: unknown) {
  try {
    return value ? normalizeE164(value) : null;
  } catch {
    return null;
  }
}
