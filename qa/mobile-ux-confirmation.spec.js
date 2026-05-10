const { test, expect } = require("@playwright/test");

const BASE_URL = "http://127.0.0.1:8765/mimi-servicios/cliente.html";

async function openClient(page, width) {
  await page.setViewportSize({ width, height: 844 });
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
}

for (const width of [360, 390, 430]) {
  test(`confirm request sheet stays compact and readable on ${width}px`, async ({ page }) => {
    await openClient(page, width);
    await page.evaluate(() => {
      const overlay = document.getElementById("requestConfirmOverlay");
      const actions = document.querySelector(".confirm-actions");
      overlay.hidden = false;
      document.getElementById("confirmProviderName").textContent = "Paulo Pintura Profesional";
      document.getElementById("confirmTotalPrice").textContent = "$ 125.000";
      document.getElementById("confirmCategoryName").textContent = "Pintura";
      document.getElementById("confirmServiceMode").textContent = "Presencial";
      document.getElementById("confirmSessionDuration").textContent = "A coordinar";
      document.getElementById("confirmAddress").textContent = "9841 Laques, Villa Cornu (X5022)";
      const quantity = document.createElement("div");
      quantity.className = "confirm-quantity-field";
      quantity.innerHTML = `
        <span>Cantidad estimada</span>
        <div><input value="25" aria-label="Cantidad"><b>m2</b></div>
        <small>Precio publicado: $ 5.000 / m2. Total calculado: $ 125.000.</small>
      `;
      actions.before(quantity);
    });

    const metrics = await page.evaluate(() => {
      const sheet = document.querySelector(".request-confirm-sheet").getBoundingClientRect();
      const title = document.getElementById("requestConfirmTitle").getBoundingClientRect();
      const actions = document.querySelector(".confirm-actions").getBoundingClientRect();
      const viewport = { width: innerWidth, height: innerHeight };
      return {
        sheetTop: sheet.top,
        sheetBottom: sheet.bottom,
        titleTop: title.top,
        titleHeight: title.height,
        actionsBottom: actions.bottom,
        viewport
      };
    });

    expect(metrics.sheetTop).toBeGreaterThanOrEqual(8);
    expect(metrics.titleTop).toBeGreaterThan(metrics.sheetTop);
    expect(metrics.titleHeight).toBeGreaterThan(12);
    expect(metrics.sheetBottom).toBeLessThanOrEqual(metrics.viewport.height);
    expect(metrics.actionsBottom).toBeLessThanOrEqual(metrics.viewport.height);
    await page.screenshot({ path: `C:/tmp/mimi-confirm-${width}.png`, fullPage: false });
  });
}

test("activity details present current service before history", async ({ page }) => {
  await openClient(page, 390);
  const titles = await page.evaluate(() =>
    [...document.querySelectorAll(".details-grid > article")]
      .map((node) => node.querySelector("h2")?.textContent?.trim() || "")
      .map((title) => title.normalize("NFD").replace(/[\u0300-\u036f]/g, ""))
  );
  expect(titles).toEqual([
    "Novedades de este servicio",
    "Prestador elegido",
    "Detalle de pago",
    "Busqueda de prestador",
    "Servicios anteriores"
  ]);
});
