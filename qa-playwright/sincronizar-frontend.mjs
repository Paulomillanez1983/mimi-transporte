#!/usr/bin/env node
/**
 * sincronizar-frontend.mjs — trae al repositorio el frontend que está REALMENTE
 * desplegado en producción, para que el repo vuelva a ser la fuente de verdad.
 *
 * Por qué hace falta: se desplegó desde la computadora y no desde git, así que
 * producción quedó adelante del repo (main-client.js +54 KB, íconos nuevos, etc.).
 * Cualquier deploy desde el repo tal como está ahora haría RETROCEDER la app.
 *
 * Uso:
 *   node qa-playwright/sincronizar-frontend.mjs            # DRY-RUN: solo informa
 *   node qa-playwright/sincronizar-frontend.mjs --apply    # escribe los archivos
 *
 * No toca: node_modules, .git, docs ni nada fuera de las rutas del frontend.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");
const BASE = process.env.MIMI_PROD_URL || "https://mimigo.com.ar";
const APPLY = process.argv.includes("--apply");

// Qué se sincroniza (lo que corre en la web)
const RUTAS = ["mimi-servicios", "admin"];
const RAIZ_EXTRA = [
  "landing.html", "index.html", "landing.css", "manifest.json", "manifest-partners.json",
  "sw-partner.js", "app-version.json", "privacidad.html", "terminos.html", "delete-account.html",
  "robots.txt", "sitemap.xml", "vercel.json",
];
const SALTAR = new Set(["node_modules", ".git", "test-results", ".temp"]);
const TEXTO = new Set([".js", ".mjs", ".html", ".css", ".json", ".webmanifest", ".txt", ".xml", ".md", ".svg"]);
const BINARIO = new Set([".png", ".jpg", ".jpeg", ".webp", ".ico", ".gif", ".woff", ".woff2", ".ttf", ".mp3", ".mp4"]);

function* walk(dir) {
  let e;
  try { e = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const x of e) {
    if (SALTAR.has(x.name)) continue;
    const p = join(dir, x.name);
    if (x.isDirectory()) yield* walk(p);
    else if (x.isFile()) yield p;
  }
}

const ext = (p) => { const i = p.lastIndexOf("."); return i === -1 ? "" : p.slice(i).toLowerCase(); };
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function traer(ruta) {
  const url = `${BASE}${ruta}`;
  for (let intento = 1; intento <= 3; intento++) {
    try {
      const r = await fetch(url, { redirect: "follow" });
      if (r.status === 404) return { estado: 404 };
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      return { estado: r.status, buf, tipo: r.headers.get("content-type") || "" };
    } catch (err) {
      if (intento === 3) return { estado: 0, error: String(err.message || err) };
      await esperar(400 * intento);
    }
  }
}

const iguales = (a, b) => a.length === b.length && a.equals(b);

async function main() {
  console.log(`Producción: ${BASE}`);
  console.log(APPLY ? "Modo: ESCRITURA (voy a modificar el repo)\n" : "Modo: DRY-RUN (no escribo nada)\n");

  // 1) inventario de archivos del repositorio en las rutas del frontend
  const locales = [];
  for (const r of RUTAS) {
    const p = join(REPO, r);
    if (existsSync(p)) for (const f of walk(p)) locales.push(relative(REPO, f));
  }
  for (const r of RAIZ_EXTRA) if (existsSync(join(REPO, r))) locales.push(r);

  console.log(`Archivos del repo a comparar: ${locales.length}`);

  const nuevos = [], cambiados = [], igual = [], faltanEnProd = [];
  const referencias = new Set();

  for (const rel of locales) {
    const local = readFileSync(join(REPO, rel));
    const { estado, buf } = await traer(`/${rel}`);
    if (estado === 404) { faltanEnProd.push(rel); continue; }
    if (estado !== 200 || !buf) { console.log(`   ⚠️  ${rel}: no se pudo traer (${estado})`); continue; }
    if (iguales(local, buf)) { igual.push(rel); }
    else {
      cambiados.push({ rel, bytesLocal: local.length, bytesProd: buf.length });
      if (APPLY) { mkdirSync(dirname(join(REPO, rel)), { recursive: true }); writeFileSync(join(REPO, rel), buf); }
    }
    // junta referencias para descubrir archivos NUEVOS que el repo no tiene
    if (TEXTO.has(ext(rel))) {
      const t = buf.toString("utf8");
      for (const m of t.matchAll(/["'(](\.{1,2}\/|\/)?((?:assets|styles|src|icons)[^"'()\s]+\.(?:png|jpg|jpeg|webp|svg|ico|css|js|woff2?))/g)) {
        referencias.add(m[2]);
      }
    }
  }

  console.log(`   ✅ iguales:           ${igual.length}`);
  console.log(`   🔄 a actualizar:      ${cambiados.length}`);
  console.log(`   📄 solo en el repo:   ${faltanEnProd.length} (producción no los sirve)`);

  // 2) archivos nuevos: referenciados por producción pero que el repo no tiene
  const candidatos = new Set();
  for (const ref of referencias) {
    const limpio = ref.replace(/^\.\//, "");
    for (const base of ["mimi-servicios/", ""]) {
      const rel = `${base}${limpio}`;
      if (!existsSync(join(REPO, rel))) candidatos.add(rel);
    }
  }
  console.log(`\nReferencias a archivos que el repo NO tiene: ${candidatos.size}`);
  for (const rel of candidatos) {
    const { estado, buf } = await traer(`/${rel}`);
    if (estado === 200 && buf) {
      nuevos.push({ rel, bytes: buf.length });
      if (APPLY) { mkdirSync(dirname(join(REPO, rel)), { recursive: true }); writeFileSync(join(REPO, rel), buf); }
    }
  }
  for (const n of nuevos.slice(0, 20)) console.log(`   + ${n.rel} (${n.bytes} B)`);
  if (nuevos.length > 20) console.log(`   … y ${nuevos.length - 20} más`);

  // 3) resumen de lo que cambia
  console.log(`\n${"═".repeat(70)}`);
  const totalNuevo = cambiados.reduce((a, c) => a + Math.max(0, c.bytesProd - c.bytesLocal), 0);
  console.log(`RESUMEN: ${cambiados.length} archivos a actualizar · ${nuevos.length} nuevos · ${totalNuevo} B de código que solo estaba en producción`);
  console.log("Los 10 cambios más grandes:");
  for (const c of cambiados.sort((a, b) => (b.bytesProd - b.bytesLocal) - (a.bytesProd - a.bytesLocal)).slice(0, 10)) {
    const d = c.bytesProd - c.bytesLocal;
    console.log(`   ${(d > 0 ? "+" : "") + d}`.padStart(9), c.rel);
  }

  if (!APPLY) console.log("\nDRY-RUN: revalidá y volvé a correrlo con --apply para escribir.");
}

main().catch((e) => { console.error(`❌ ${e.message}`); process.exit(1); });
