/**
 * QA del cuadro tarifario: donde se monta y quien responde al toque.
 *
 * QUE PROTEGE
 *   La tarjeta de un servicio lleva data-offering-id en la tarjeta Y en sus botones
 *   ("Editar servicio", "Ver como cliente"). Si el cuadro tarifario se monta en cualquiera de
 *   esos botones, queda adentro de un boton y TODO toque suyo sube hasta el:
 *     - tocar "Precio de partida" o "Quitar" abria el editor del servicio (y el navegador
 *       saltaba al titulo, porque abrir el editor hace scrollIntoView + focus en ese campo);
 *     - tocar "Agregar al cuadro tarifario" tampoco hacia lo suyo.
 *   Ademas el cuadro se montaba DOS veces, asi que se veia duplicado.
 *
 * COMO
 *   Monta el autoMountPriceBookEditor REAL sobre la estructura de tarjeta REAL, en un navegador,
 *   y mira donde quedo y que pasa al tocar. Lo unico simulado es la base de datos.
 *
 * NECESITA el navegador de Playwright:  npx playwright install chromium
 */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const root = path.resolve(__dirname, "..");

let chromium;
try {
  ({ chromium } = require("@playwright/test"));
} catch (_) {
  console.log("OMITIDO: falta @playwright/test");
  process.exit(0);
}

const fuente = fs.readFileSync(path.join(root, "mimi-servicios/src/services/price-book.js"), "utf8");

let passes = 0;
let failures = 0;
function check(nombre, ok, detalle = "") {
  if (ok) {
    passes += 1;
    console.log(`PASS ${nombre}`);
    return;
  }
  failures += 1;
  console.error(`FAIL ${nombre}${detalle ? ` - ${detalle}` : ""}`);
}

// Solo se reemplaza el acceso a la base. El resto del archivo es el que se despliega.
const importSupabase = fuente.match(/import \{[^}]*\} from "\.\/supabase\.js[^"]*";/);
if (!importSupabase) {
  console.error("FAIL no ubico el import de supabase en price-book.js");
  process.exit(1);
}
const baseSimulada = `
const PARAMS = [{ id: "p1", attribute_code: "cantidad", kind: "BASE", condition_json: {},
  adjustment_json: { type: "absolute", value: 12000 }, note: "", sort_order: 0, active: true }];

// Cadena generica: el codigo real pide select/eq/maybeSingle/order/insert/delete y no vale la
// pena ir copiando cada combinacion. Cualquier metodo devuelve la misma cadena, y esperarla
// resuelve los parametros. Los dos que importan para el test se cuentan.
function cadena() {
  return new Proxy(function () {}, {
    get(_, prop) {
      if (prop === "then") return (listo) => Promise.resolve({ data: PARAMS, error: null }).then(listo);
      // "Quitar" no borra: desactiva el parametro con un update.
      if (prop === "update") window.__borrados = (window.__borrados || 0) + 1;
      if (prop === "insert") window.__agregados = (window.__agregados || 0) + 1;
      return cadena();
    },
    apply() { return cadena(); }
  });
}
const getSupabaseClient = () => ({ from: () => cadena() });`;

const conBaseSimulada = fuente.replace(importSupabase[0], baseSimulada, 1);

// La tarjeta real: el atributo esta en el <article> y tambien en el boton de adentro.
const PAGINA = `<!doctype html><html lang="es"><head><meta charset="utf-8"></head><body class="provider-authenticated" data-provider-tab="pricing">
<main id="providerBusinessPanel">
  <div class="provider-services-home">
    <article class="provider-service-list-card provider-offering-summary-card" data-offering-id="ID-1">
      <button class="provider-service-list-main" type="button" data-provider-business-action="edit-offering" data-offering-id="ID-1">
        <span class="provider-service-list-copy"><strong>Destapacion de caño</strong></span>
      </button>
    </article>
  </div>
</main>
<script type="module">
  import { autoMountPriceBookEditor } from "./price-book.js";
  window.__agregados = 0;
  window.__borrados = 0;
  window.__editar = 0;
  document.addEventListener("click", (e) => {
    if (e.target.closest('[data-provider-business-action="edit-offering"]')) window.__editar += 1;
  });
  window.__montar = autoMountPriceBookEditor;
</script></body></html>`;

(async () => {
  let navegador;
  try {
    navegador = await chromium.launch();
  } catch (error) {
    console.log(`OMITIDO: no hay navegador de Playwright (${String(error).split("\n")[0]})`);
    process.exit(0);
  }

  const pagina = await navegador.newPage({ viewport: { width: 390, height: 844 } });
  const errores = [];
  pagina.on("pageerror", (e) => errores.push(String(e.message).slice(0, 120)));

  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "mimi-tarifario-"));
  fs.writeFileSync(path.join(carpeta, "price-book.js"), conBaseSimulada, "utf8");
  fs.writeFileSync(path.join(carpeta, "index.html"), PAGINA, "utf8");

  // Los modulos no cargan por file://, hace falta servirlos.
  const servidor = require("node:http").createServer((req, res) => {
    const archivo = path.join(carpeta, decodeURIComponent(req.url.split("?")[0]).replace(/^\//, "") || "index.html");
    if (!archivo.startsWith(carpeta) || !fs.existsSync(archivo)) {
      res.writeHead(404).end("no");
      return;
    }
    res.writeHead(200, { "Content-Type": archivo.endsWith(".js") ? "text/javascript" : "text/html" });
    res.end(fs.readFileSync(archivo));
  });
  await new Promise((listo) => servidor.listen(0, "127.0.0.1", listo));
  const puerto = servidor.address().port;

  await pagina.goto(`http://127.0.0.1:${puerto}/index.html`);
  await pagina.waitForFunction(() => typeof window.__montar === "function");
  await pagina.evaluate(() => window.__montar("2026.09.19.4"));
  await pagina.waitForTimeout(800);

  check("el editor se monto sin errores", errores.length === 0, errores.join(" | "));

  const montajes = await pagina.evaluate(() =>
    [...document.querySelectorAll("[data-offering-id]")].map((el) => ({
      etiqueta: el.tagName.toLowerCase(),
      editor: Boolean(el.querySelector(":scope > div")),
      dentroDeBoton: Boolean(el.querySelector(":scope > div")?.closest("button"))
    }))
  );
  const total = montajes.filter((m) => m.editor).length;
  check("el cuadro tarifario se monta una sola vez", total === 1, `se monto ${total} veces`);
  check(
    "y no queda adentro de un boton de la tarjeta",
    montajes.every((m) => !m.dentroDeBoton),
    JSON.stringify(montajes)
  );

  const tocar = async (texto) => {
    await pagina.evaluate(() => { window.__editar = 0; });
    await pagina.evaluate((t) => {
      const nodo = [...document.querySelectorAll("#providerBusinessPanel *")].find(
        (n) => (n.textContent || "").trim() === t && n.children.length === 0
      );
      nodo?.click();
    }, texto);
    await pagina.waitForTimeout(250);
    return pagina.evaluate(() => window.__editar);
  };

  check("tocar 'Precio de partida' no abre el editor del servicio", (await tocar("Precio de partida")) === 0);
  check("tocar 'Agregar al cuadro tarifario' no abre el editor del servicio", (await tocar("Agregar al cuadro tarifario")) === 0);

  await pagina.evaluate(() => { window.__borrados = 0; });
  await tocar("Quitar");
  const borrados = await pagina.evaluate(() => window.__borrados);
  check("'Quitar' borra el parametro de verdad", borrados > 0, `llamadas al borrado: ${borrados}`);

  pagina.on("pageerror", () => {});
  await navegador.close();
  servidor.close();
  fs.rmSync(carpeta, { recursive: true, force: true });

  console.log("");
  console.log(`Resultado: ${passes} OK, ${failures} fallos`);
  process.exit(failures ? 1 : 0);
})().catch((error) => {
  console.error("FAIL el QA del cuadro tarifario no pudo ejecutarse:", error.message);
  process.exit(1);
});
