const { defineConfig, devices } = require("@playwright/test");

const PORT = Number(process.env.MIMI_E2E_PORT || 8765);
const BASE_URL = process.env.MIMI_E2E_BASE_URL || `http://127.0.0.1:${PORT}`;
const RUN_ID = process.env.MIMI_E2E_RUN_ID || new Date().toISOString().replace(/[:.]/g, "-");
const DEFAULT_OUTPUT_DIR = process.env.CI ? "test-results" : `test-results/${RUN_ID}`;
const DEFAULT_REPORT_DIR = process.env.CI ? "playwright-report" : `playwright-report/${RUN_ID}`;

module.exports = defineConfig({
  testDir: "./qa",
  timeout: 45_000,
  expect: {
    timeout: 8_000
  },
  retries: process.env.CI ? 2 : 1,
  workers: Number(process.env.MIMI_E2E_WORKERS || (process.env.CI ? 2 : 1)),
  outputDir: process.env.MIMI_E2E_OUTPUT_DIR || DEFAULT_OUTPUT_DIR,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: process.env.MIMI_E2E_REPORT_DIR || DEFAULT_REPORT_DIR }]
  ],
  use: {
    baseURL: BASE_URL,
    actionTimeout: 12_000,
    navigationTimeout: 20_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure"
  },
  webServer: process.env.MIMI_E2E_BASE_URL
    ? undefined
    : {
        command: `npx serve . -l ${PORT}`,
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 20_000
      },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 7"] }
    }
  ]
});
