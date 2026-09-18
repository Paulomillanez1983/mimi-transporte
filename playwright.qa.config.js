// Configuración de pruebas agregada por el asistente (18-sep-2026).
// No reemplaza playwright.config.js: usa el Google Chrome YA instalado en la máquina
// (channel: "chrome"), así no hay que descargar los navegadores de Playwright.
//
// Uso:
//   npx playwright test -c playwright.qa.config.js
//   npx playwright test -c playwright.qa.config.js --project=chrome-mobile

const { defineConfig, devices } = require("@playwright/test");

const PORT = Number(process.env.MIMI_E2E_PORT || 8791);
const BASE_URL = process.env.MIMI_E2E_BASE_URL || `http://127.0.0.1:${PORT}`;

module.exports = defineConfig({
  testDir: ".",
  testMatch: ["qa-playwright/**/*.spec.js", "qa/service-pin-flow.e2e.spec.js"],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 0,
  workers: 1,
  fullyParallel: false,
  outputDir: "test-results/qa-run",
  reporter: [["list"], ["json", { outputFile: "test-results/qa-run/results.json" }]],
  use: {
    baseURL: BASE_URL,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    screenshot: "off",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chrome-mobile", use: { ...devices["Pixel 7"], channel: "chrome" } },
    { name: "chrome-desktop", use: { ...devices["Desktop Chrome"], channel: "chrome" } },
  ],
});
