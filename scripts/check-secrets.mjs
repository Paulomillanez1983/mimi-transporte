#!/usr/bin/env node
/**
 * check-secrets.mjs — guardia contra secretos commiteados.
 *
 * Uso:  node scripts/check-secrets.mjs [ruta-del-repo]
 * Sale con código 1 si encuentra un secreto real (bloquea el CI).
 * La anon key de Supabase es PÚBLICA por diseño y NO se marca.
 * La apiKey web de Firebase es pública pero se avisa (hay que restringirla por dominio).
 *
 * Por qué no alcanza un grep: un JWT lleva su payload en base64, así que
 * `"role":"service_role"` nunca aparece en texto plano; y una clave PEM es
 * multilínea, así que grep (que trabaja línea por línea) no la ve completa.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname, relative } from "node:path";

const ROOT = process.argv[2] || process.cwd();
const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build", "coverage",
  "playwright-report", "test-results", ".vercel", ".temp",
]);
const TEXT_EXT = new Set([
  ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".html", ".htm", ".json", ".jsonc",
  ".toml", ".yml", ".yaml", ".sql", ".md", ".txt", ".env", ".cfg", ".ini",
]);
const MAX_BYTES = 2_000_000;

// ---------------------------------------------------------------- detecciones
const JWT_RE = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{5,}/g;

function jwtRoles(text) {
  const roles = [];
  for (const token of text.match(JWT_RE) || []) {
    try {
      const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString("utf8"));
      if (payload && typeof payload.role === "string") roles.push(payload.role);
    } catch {
      /* no es un JWT válido: se ignora */
    }
  }
  return roles;
}

const FAILS = [
  {
    id: "JWT con rol service_role",
    test: (t) => jwtRoles(t).includes("service_role"),
    hint: "Es la clave maestra del proyecto: permite saltarse RLS. Debe ir solo en secrets de Supabase/GitHub.",
  },
  {
    id: "Clave privada PEM",
    re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]*?(?:[A-Za-z0-9+/=]{40,}\s*){3,}/,
    hint: "Clave privada completa (Firebase, SSH, TLS). Rotála y sacala del repo.",
  },
  {
    id: "Access token de MercadoPago",
    re: /APP_USR-[0-9]{10,}/,
    hint: "Token de producción de MP. Debe vivir en secrets de Edge Functions.",
  },
  {
    id: "Secret key de Stripe",
    re: /sk_(?:live|test)_[0-9A-Za-z]{20,}/,
    hint: "Clave secreta de Stripe.",
  },
  {
    id: "AWS secret access key",
    re: /aws_secret_access_key\s*[:=]\s*["'][0-9A-Za-z/+]{40}["']/i,
    hint: "Credencial de AWS.",
  },
];

const WARNS = [
  {
    id: "apiKey web de Firebase",
    re: /AIza[0-9A-Za-z_-]{35}/,
    hint: "Es pública por diseño (config web de FCM), pero restringila por dominio/HTTP referrer en Google Cloud Console.",
  },
];

// ------------------------------------------------------------------- recorrido
function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith(".") && e.name !== ".env") continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      yield* walk(full);
    } else if (e.isFile()) {
      if (!TEXT_EXT.has(extname(e.name).toLowerCase())) continue;
      try {
        if (statSync(full).size > MAX_BYTES) continue;
      } catch {
        continue;
      }
      yield full;
    }
  }
}

const failures = [];
const warnings = [];
let scanned = 0;

for (const file of walk(ROOT)) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  if (text.includes("\u0000")) continue; // binario disfrazado
  scanned++;

  const rel = relative(ROOT, file);
  for (const rule of FAILS) {
    if (rule.test ? rule.test(text) : rule.re.test(text)) {
      failures.push({ file: rel, id: rule.id, hint: rule.hint });
    }
  }
  for (const rule of WARNS) {
    if (rule.re.test(text)) warnings.push({ file: rel, id: rule.id, hint: rule.hint });
  }
}

// ---------------------------------------------------------------------- salida
console.log(`Archivos escaneados: ${scanned}`);

if (warnings.length) {
  console.log(`\n⚠️  ${warnings.length} aviso(s) — no bloquean:`);
  for (const w of warnings) console.log(`   · ${w.file} → ${w.id}\n     ${w.hint}`);
}

if (failures.length) {
  console.error(`\n❌ ${failures.length} secreto(s) detectado(s) — esto BLOQUEA:`);
  for (const f of failures) console.error(`   · ${f.file} → ${f.id}\n     ${f.hint}`);
  console.error("\nRotá la credencial expuesta y movela a secrets. No basta con borrarla: queda en el historial de git.");
  process.exit(1);
}

console.log("\n✅ Sin secretos reales detectados.");
