const { defineConfig, devices } = require("@playwright/test");

const PORT = Number(process.env.MIMI_E2E_PORT || 8765);
const BASE_URL = process.env.MIMI_E2E_BASE_URL || `http://127.0.0.1:${PORT}`;

module.exports = defineConfig({
  testDir: "./qa",
  timeout: 45_000,
  expect: {
    timeout: 8_000
  },
  retries: process.env.CI ? 2 : 1,
  outputDir: process.env.MIMI_E2E_OUTPUT_DIR || "C:/tmp/mimi-playwright-results",
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: process.env.MIMI_E2E_REPORT_DIR || "C:/tmp/mimi-playwright-report" }]
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
