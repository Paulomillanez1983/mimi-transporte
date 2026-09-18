/**
 * Política de cancelación — una sola fuente de verdad para la app.
 *
 * Lee `cancellation_rules` (el rol anon tiene SELECT sobre esa tabla) en lugar de
 * tener los porcentajes hardcodeados. Cambiar el 25% por un 30% en el panel de admin
 * se refleja acá sin desplegar nada, y no hay dos versiones de la verdad que se
 * desincronicen.
 *
 * Reglas de negocio (decididas 18-sep-2026):
 *   · El cliente cancela gratis hasta que el prestador sale.
 *   · 25% con el prestador en camino, 40% cuando ya llegó (con mínimos).
 *   · Con el PIN validado el servicio arrancó: NO se cancela, se reclama.
 *
 * El número que muestra este módulo es informativo y viene de la misma tabla que usa
 * el servidor, así que coinciden. Aun así, el cargo definitivo lo calcula la RPC al
 * momento de cancelar: acá nunca se decide plata, solo se avisa.
 */

import { getSupabaseClient } from "./supabase.js?v=2026.05.17.2";

export const CLIENT_CANCELLABLE_STATUSES = [
  "PENDING_PROVIDER_RESPONSE",
  "ACCEPTED",
  "PROVIDER_EN_ROUTE",
  "PROVIDER_ARRIVED"
];

const CLOSED_STATUSES = ["COMPLETED", "CANCELLED", "EXPIRED"];

const CLIENT_ACCENT = "#1a56db";

/** Por qué no se puede cancelar, o null si sí se puede. */
export function cancellationBlockedReason(status) {
  const value = String(status || "").toUpperCase();
  if (value === "IN_PROGRESS") {
    return "El servicio ya arrancó con el PIN. No se puede cancelar: se completa o se reclama.";
  }
  if (CLOSED_STATUSES.includes(value)) {
    return "Esta solicitud ya está cerrada.";
  }
  if (!CLIENT_CANCELLABLE_STATUSES.includes(value)) {
    return "Esta solicitud no se puede cancelar en este momento.";
  }
  return null;
}

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function formatArs(value) {
  return "$" + round2(value).toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

let rulesCache = null;

/** Reglas del cliente para SERVICE_REQUEST, cacheadas por sesión de pantalla. */
async function loadClientRules() {
  if (rulesCache) return rulesCache;
  try {
    const supabase = getSupabaseClient?.();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("cancellation_rules")
      .select("status,cancelled_by,fee_percentage,fixed_fee,provider_share_percentage,platform_share_percentage,active")
      .eq("context_type", "SERVICE_REQUEST")
      .eq("cancelled_by", "CLIENT")
      .eq("active", true);
    if (error || !Array.isArray(data)) return [];
    rulesCache = data;
    return data;
  } catch {
    return [];
  }
}

function pickRule(rules, status) {
  const value = String(status || "").toUpperCase();
  return (
    rules.find((rule) => String(rule.status || "").toUpperCase() === value) ||
    rules.find((rule) => String(rule.status || "").toUpperCase() === "DEFAULT") ||
    null
  );
}

/**
 * Calcula el cargo para un estado y un total pagado.
 * Devuelve `known: false` si no pudimos leer las reglas — en ese caso la app NO debe
 * inventar un número: avisa que el cargo lo calcula el servidor.
 */
export async function getCancellationPreview({ status, totalPaid }) {
  const base = round2(totalPaid);
  const rules = await loadClientRules();
  const rule = pickRule(rules, status);

  if (!rule || base <= 0) {
    return {
      known: false,
      base,
      status,
      fee: 0,
      refundDue: base,
      providerShare: 0,
      platformShare: 0,
      hasFee: false
    };
  }

  const byPercentage = round2((base * Number(rule.fee_percentage || 0)) / 100);
  const withMinimum = Math.max(byPercentage, round2(rule.fixed_fee));
  const fee = Math.min(withMinimum, base);
  const providerShare = round2((fee * Number(rule.provider_share_percentage || 0)) / 100);

  return {
    known: true,
    base,
    status,
    fee,
    refundDue: round2(base - fee),
    providerShare,
    platformShare: round2(fee - providerShare),
    feePercentage: Number(rule.fee_percentage || 0),
    hasFee: fee > 0
  };
}

function buildDialogHtml({ policy, providerName }) {
  const who = providerName ? providerName : "El prestador";
  const rows = policy.hasFee
    ? `
      <div style="display:flex;justify-content:space-between;padding:6px 0;">
        <span style="opacity:.75;">Pagaste</span>
        <strong>${formatArs(policy.base)}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;padding:6px 0;">
        <span style="opacity:.75;">Cargo por cancelación (${policy.feePercentage}%)</span>
        <strong style="color:#b42318;">−${formatArs(policy.fee)}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-top:1px solid rgba(0,0,0,.12);margin-top:4px;">
        <span style="opacity:.75;">Se te devuelve</span>
        <strong style="color:#067647;">${formatArs(policy.refundDue)}</strong>
      </div>
      <p style="margin:10px 0 0;font-size:13px;opacity:.75;">
        ${who} recibe ${formatArs(policy.providerShare)} por el viaje.
      </p>
    `
    : `
      <div style="display:flex;justify-content:space-between;padding:6px 0;">
        <span style="opacity:.75;">Pagaste</span>
        <strong>${formatArs(policy.base)}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;padding:6px 0;">
        <span style="opacity:.75;">Cargo por cancelación</span>
        <strong style="color:#067647;">Sin cargo</strong>
      </div>
      <p style="margin:10px 0 0;font-size:13px;opacity:.75;">
        Se te devuelve el total. ${who} todavía no se movió.
      </p>
    `;

  const unknownNote = policy.known
    ? ""
    : `<p style="margin:10px 0 0;font-size:13px;opacity:.75;">
         No pudimos leer la política de cancelación en este momento. El monto exacto
         se calcula al confirmar y lo vas a ver en el comprobante.
       </p>`;

  return `
    <div style="display:flex;flex-direction:column;gap:4px;font-size:15px;">
      ${rows}
      ${unknownNote}
      <p style="margin:12px 0 0;font-size:12px;opacity:.6;">
        El reembolso no es instantáneo: Mercado Pago puede tardar algunos días en acreditarlo.
      </p>
    </div>
  `;
}

/**
 * Cartel de confirmación. Resuelve a { confirmed }.
 * El botón destructivo dice el monto, nunca un "Cancelar" pelado: el cliente tiene que
 * leer el número antes de aceptar. Es lo que evita el reclamo después.
 */
export function confirmCancellation({ policy, providerName }) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:9999;background:rgba(12,16,24,.55);" +
      "display:flex;align-items:flex-end;justify-content:center;padding:0;";

    const sheet = document.createElement("div");
    sheet.style.cssText =
      "background:#fff;color:#101828;width:100%;max-width:520px;border-radius:18px 18px 0 0;" +
      "padding:20px 18px calc(20px + env(safe-area-inset-bottom));box-shadow:0 -8px 30px rgba(0,0,0,.2);" +
      "font-family:inherit;";

    const title = providerName
      ? `${providerName} ya está en camino`
      : "Confirmá la cancelación";

    sheet.innerHTML = `
      <h2 style="margin:0 0 12px;font-size:18px;font-weight:600;">${title}</h2>
      ${buildDialogHtml({ policy, providerName })}
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:18px;">
        <button type="button" data-cancel-dialog="back"
          style="width:100%;padding:14px;border-radius:12px;border:1px solid rgba(0,0,0,.15);background:#fff;
                 font-size:16px;font-weight:600;color:#101828;cursor:pointer;">
          Volver, sigo con el servicio
        </button>
        <button type="button" data-cancel-dialog="confirm"
          style="width:100%;padding:14px;border-radius:12px;border:0;background:${CLIENT_ACCENT};color:#fff;
                 font-size:16px;font-weight:600;cursor:pointer;">
          ${policy.known && policy.hasFee
            ? `Cancelar y recibir ${formatArs(policy.refundDue)}`
            : "Cancelar sin cargo"}
        </button>
      </div>
    `;

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);

    const close = (confirmed) => {
      overlay.remove();
      document.removeEventListener("keydown", onKey);
      resolve({ confirmed, policy });
    };
    const onKey = (event) => {
      if (event.key === "Escape") close(false);
    };

    sheet.querySelector('[data-cancel-dialog="back"]').addEventListener("click", () => close(false));
    sheet.querySelector('[data-cancel-dialog="confirm"]').addEventListener("click", () => close(true));
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close(false);
    });
    document.addEventListener("keydown", onKey);
  });
}

/** Atajo: junta el preview y el cartel, y devuelve si el usuario confirmó. */
export async function requestCancellationConfirmation({ status, totalPaid, providerName }) {
  const policy = await getCancellationPreview({ status, totalPaid });
  const { confirmed } = await confirmCancellation({ policy, providerName });
  return { confirmed, policy };
}

/**
 * Versión sincrónica para las pantallas que se renderizan sin await (el panel del
 * prestador). Usa el cache si ya está cargado; si todavía no, devuelve null y la
 * pantalla simplemente no muestra el monto — nunca inventa un número.
 *
 * Se usa del lado del prestador con `base` = lo que paga el cliente, para decirle
 * cuánto se le reconoce si el cliente cancela en camino.
 */
export function estimateClientCancellationSync({ status, totalPaid }) {
  if (!rulesCache) return null;
  const base = round2(totalPaid);
  const rule = pickRule(rulesCache, status);
  if (!rule || base <= 0) return null;

  const byPercentage = round2((base * Number(rule.fee_percentage || 0)) / 100);
  const fee = Math.min(Math.max(byPercentage, round2(rule.fixed_fee)), base);
  if (fee <= 0) return { fee: 0, providerShare: 0, feePercentage: 0 };

  const providerShare = round2((fee * Number(rule.provider_share_percentage || 0)) / 100);
  return { fee, providerShare, feePercentage: Number(rule.fee_percentage || 0) };
}

/** Precarga las reglas para que `estimateClientCancellationSync` pueda responder. */
export async function primeCancellationRules() {
  await loadClientRules();
  return rulesCache !== null;
}

/** Invalida el cache: se llama después de cancelar para no mostrar montos viejos. */
export function invalidateCancellationRulesCache() {
  rulesCache = null;
}
