// Arranque y salud de las 3 superficies de MIMIGO Servicios.
// Verifica lo que se puede verificar SIN sesión: que la app cargue, que no haya
// excepciones no capturadas, y deja una captura de cada pantalla para inspección.
//
// Corre con: npx playwright test -c playwright.qa.config.js --project=chrome-mobile

const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("@playwright/test");

// Fuera de outputDir ("test-results/qa-run"): Playwright limpia outputDir en cada corrida.
const SHOTS = path.join(__dirname, "..", "test-results", "shots");

const SUPERFICIES = [
  { nombre: "cliente", ruta: "/mimi-servicios/cliente.html", marca: /MIMI/i },
  { nombre: "prestador", ruta: "/mimi-servicios/prestador.html", marca: /MIMI/i },
  { nombre: "admin-login", ruta: "/admin/admin-login.html", marca: /MIMI|Admin|Acceso/i },
];

test.describe("arranque de las superficies de Servicios", () => {
  for (const sup of SUPERFICIES) {
    test(`${sup.nombre} carga sin excepciones`, async ({ page }) => {
      fs.mkdirSync(SHOTS, { recursive: true });

      const excepciones = [];
      const erroresConsola = [];
      const fallosDeRed = [];

      page.on("pageerror", (e) => excepciones.push(String(e.message || e)));
      page.on("console", (m) => {
        if (m.type() === "error") erroresConsola.push(m.text().slice(0, 300));
      });
      page.on("requestfailed", (r) => {
        fallosDeRed.push(`${r.method()} ${r.url().slice(0, 160)} — ${r.failure()?.errorText || "?"}`);
      });

      await page.goto(sup.ruta, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(6000); // dar tiempo a que arranque el SPA

      // JPEG comprimido: más liviano para adjuntar y revisar.
      await page.screenshot({
        path: path.join(SHOTS, `${sup.nombre}.jpg`),
        type: "jpeg",
        quality: 60,
        fullPage: false,
      });

      const texto = (await page.locator("body").innerText().catch(() => "")) || "";
      const titulo = await page.title();

      console.log(`\n───── ${sup.nombre} (${sup.ruta})`);
      console.log(`  título: ${titulo}`);
      console.log(`  texto visible: ${texto.replace(/\s+/g, " ").slice(0, 400)}`);
      if (excepciones.length) console.log(`  ❌ excepciones (${excepciones.length}): ${excepciones.join(" | ").slice(0, 600)}`);
      if (erroresConsola.length) console.log(`  ⚠️  consola error (${erroresConsola.length}): ${erroresConsola.slice(0, 4).join(" | ").slice(0, 700)}`);
      if (fallosDeRed.length) console.log(`  ⚠️  red fallida (${fallosDeRed.length}): ${fallosDeRed.slice(0, 4).join(" | ").slice(0, 700)}`);

      // Contratos mínimos
      expect(texto.trim().length, `${sup.nombre}: la página quedó vacía`).toBeGreaterThan(20);
      expect(titulo).toMatch(sup.marca);
      expect(excepciones, `${sup.nombre}: excepciones de JS no capturadas`).toEqual([]);
    });
  }
});
