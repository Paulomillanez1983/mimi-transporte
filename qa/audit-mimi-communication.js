const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

const checks = [];
const warnings = [];

function check(name, ok, detail = "") {
  checks.push({ name, ok: Boolean(ok), detail });
}

function warn(name, detail = "") {
  warnings.push({ name, detail });
}

function includes(rel, needle) {
  return read(rel).includes(needle);
}

const schema = read("supabase/migrations/20260504135848_remote_schema.sql");
const tripChat = read("js/trip-chat.js");
const driverSupport = read("js/driver-support.js");
const clientSupport = read("js/cliente-transporte-v2/state-notifications-support.js");
const serviceApi = read("mimi-servicios/src/services/service-api.js");
const realtime = read("mimi-servicios/src/services/realtime.js");
const ensureConversation = read("supabase/functions/communication-ensure-conversation/index.ts");

check("svc_conversations table exists", schema.includes('create table "public"."svc_conversations"'));
check("svc_messages table exists", schema.includes('create table "public"."svc_messages"'));
check("svc_notifications table exists", schema.includes('create table "public"."svc_notifications"'));
check("svc_conversations RLS enabled", schema.includes('alter table "public"."svc_conversations" enable row level security'));
check("svc_messages RLS enabled", schema.includes('alter table "public"."svc_messages" enable row level security'));
check("participant conversation policy exists", schema.includes('create policy "svc_conversations_participant_rw"'));
check("participant message policy exists", schema.includes('create policy "svc_messages_participant_rw"'));

check("svc-send-message function source exists", exists("supabase/functions/svc-send-message/index.ts"));
check("communication-ensure-conversation source exists", exists("supabase/functions/communication-ensure-conversation/index.ts"));
check("communication-mark-read source exists", exists("supabase/functions/communication-mark-read/index.ts"));
check("admin support list source versioned", exists("mimi-servicios/supabase/functions/admin-list-support-conversations/index.ts"));
check("admin support send source versioned", exists("mimi-servicios/supabase/functions/admin-send-support-message/index.ts"));
check("admin support status source versioned", exists("mimi-servicios/supabase/functions/admin-update-support-status/index.ts"));

check("trip chat no longer reads legacy support tickets", !tripChat.includes("soporte_tickets"));
check("trip chat no longer reads legacy support messages", !tripChat.includes("soporte_mensajes"));
check("trip chat creates context through Edge Function", tripChat.includes("communication-ensure-conversation"));
check("trip chat sends through svc-send-message", tripChat.includes('"svc-send-message"'));
check("trip chat marks read through Edge Function", tripChat.includes("communication-mark-read"));
check("trip chat subscribes to svc_messages", tripChat.includes('table: "svc_messages"'));
check("trip chat does not select unsupported legacy trip columns", !tripChat.includes("pasajero_nombre") && !tripChat.includes("cliente_nombre"));
check("trip conversation Edge Function does not select unsupported legacy trip columns", !ensureConversation.includes("pasajero_nombre") && !ensureConversation.includes("cliente_nombre"));

check("driver support no longer reads legacy support tickets", !driverSupport.includes("soporte_tickets"));
check("driver support no longer reads legacy support messages", !driverSupport.includes("soporte_mensajes"));
check("driver support sends through svc-send-message", driverSupport.includes('"svc-send-message"'));
check("driver support subscribes to svc_messages", driverSupport.includes('table: "svc_messages"'));

check("client support sends through svc-send-message", clientSupport.includes('"svc-send-message"'));
check("services API sends messages through configured Edge Function", serviceApi.includes("appConfig.functions.sendMessage"));
check("services realtime subscribes to svc_messages", realtime.includes('table: "svc_messages"'));
check("services realtime subscribes to svc_notifications", realtime.includes('table: "svc_notifications"'));

if (clientSupport.includes('window.supabaseInsert(\n  "svc_conversations"')) {
  warn(
    "client support conversation creation still uses direct RLS insert",
    "Allowed only for the user's own support conversation today; next hardening phase can move this to communication-create-support-ticket."
  );
}

const failed = checks.filter((item) => !item.ok);

console.log(JSON.stringify({
  ok: failed.length === 0,
  checks,
  warnings,
  failed
}, null, 2));

if (failed.length) {
  process.exitCode = 1;
}
