/**
 * Renderiza el prototipo de cotización pantalla por pantalla, saca una captura de cada una
 * y extrae el texto visible. Sirve para inspeccionar la UI/UX sin teléfono.
 *
 * Uso: node qa-playwright/prototipo-shots.mjs
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HTML = join(__dirname, "..", "..", "mimi-servicios-flujo", "prototipo-cotizacion.html");
const OUT = join(__dirname, "..", "test-results", "prototipo");
mkdirSync(OUT, { recursive: true });

const PANTALLAS = [
  { id: "c1", nombre: "1-cliente-pide-presupuesto" },
  { id: "c2", nombre: "2-cliente-recibe-precios" },
  { id: "c3", nombre: "3-aceptar-y-pagar" },
  { id: "p1", nombre: "4-prestador-cotiza" },
  { id: "p2", nombre: "5-prestador-espera" },
];

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

const errores = [];
page.on("pageerror", (e) => errores.push(String(e.message || e)));
page.on("console", (m) => { if (m.type() === "error") errores.push(`consola: ${m.text().slice(0, 200)}`); });

await page.goto(`file://${HTML}`, { waitUntil: "load" });
await page.waitForTimeout(400);

const informe = [];
for (const p of PANTALLAS) {
  await page.click(`button[data-s="${p.id}"]`);
  await page.waitForTimeout(250);
  const visible = await page.locator(`#${p.id}`).isVisible();
  const texto = (await page.locator(`#${p.id}`).innerText()).replace(/\s+/g, " ").trim();
  const cta = await page.locator(`#${p.id} .btn, #${p.id} .p-btn`).allInnerTexts();
  const scroll = await page.locator(`#${p.id}`).evaluate((el) => ({ alto: el.scrollHeight, visible: el.clientHeight }));
  await page.locator(`#${p.id}`).screenshot({ path: join(OUT, `${p.nombre}.jpg`), type: "jpeg", quality: 62 });
  informe.push({ pantalla: p.nombre, visible, altoReal: scroll.alto, altoVisible: scroll.visible, cta, caracteres: texto.length, texto });
}

writeFileSync(join(OUT, "informe.json"), JSON.stringify({ errores, informe }, null, 2), "utf8");

console.log(`Errores de JS: ${errores.length ? errores.join(" | ") : "ninguno ✅"}\n`);
for (const r of informe) {
  console.log(`── ${r.pantalla}`);
  console.log(`   visible=${r.visible}  contenido=${r.altoReal}px  ventana=${r.altoVisible}px  ${r.altoReal > r.altoVisible ? "(requiere scroll)" : ""}`);
  console.log(`   botones: ${r.cta.map((t) => `"${t.replace(/\s+/g, " ").slice(0, 42)}"`).join(" · ")}`);
}

await browser.close();
