#!/usr/bin/env node
const routes = [
  "/servicios",
  "/prestador",
  "/chofer",
  "/operadores",
  "/privacidad",
  "/delete-account"
];

const baseUrl = process.env.MIMI_PRODUCTION_URL || "https://mimi-transporte.vercel.app";

function isAllowedConsoleMessage(message) {
  const text = String(message?.text || "");
  return (
    text.includes("GPU stall due to ReadPixels") ||
    text.includes("WebGL") ||
    text.includes("Tracking Prevention blocked access to storage")
  );
}

async function loadPlaywright() {
  try {
    return require("playwright");
  } catch (error) {
    return { error };
  }
}

(async () => {
  const loaded = await loadPlaywright();
  if (loaded.error) {
    console.log(JSON.stringify({
      ok: false,
      skipped: true,
      reason: "playwright_not_available",
      detail: "Run `npx playwright install chromium` and expose the Playwright package to Node before this audit."
    }, null, 2));
    process.exit(2);
  }

  const { chromium } = loaded;
  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const route of routes) {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      deviceScaleFactor: 2
    });

    const consoleMessages = [];
    const requestFailures = [];
    const badResponses = [];

    page.on("console", (message) => {
      if (["error", "warning"].includes(message.type())) {
        const item = {
          type: message.type(),
          text: message.text().slice(0, 500)
        };
        consoleMessages.push(item);
      }
    });

    page.on("requestfailed", (request) => {
      requestFailures.push({
        url: request.url(),
        error: request.failure()?.errorText || "request_failed"
      });
    });

    page.on("response", (response) => {
      if (response.status() >= 400) {
        badResponses.push({
          status: response.status(),
          url: response.url()
        });
      }
    });

    let status = 0;
    let title = "";
    let bodyChars = 0;
    let error = null;

    try {
      const response = await page.goto(`${baseUrl}${route}`, {
        waitUntil: "networkidle",
        timeout: 45000
      });
      status = response?.status() || 0;
      title = await page.title();
      bodyChars = (await page.locator("body").innerText({ timeout: 5000 })).length;
    } catch (err) {
      error = err?.message || String(err);
    }

    const criticalConsole = consoleMessages.filter((message) => !isAllowedConsoleMessage(message));

    results.push({
      route,
      status,
      title,
      bodyChars,
      error,
      criticalConsole,
      consoleMessages,
      requestFailures: requestFailures.slice(0, 12),
      badResponses: badResponses.slice(0, 12)
    });

    await page.close();
  }

  await browser.close();

  const ok = results.every((result) =>
    result.status >= 200 &&
    result.status < 400 &&
    !result.error &&
    result.criticalConsole.length === 0 &&
    result.requestFailures.length === 0 &&
    result.badResponses.length === 0
  );

  console.log(JSON.stringify({ ok, baseUrl, results }, null, 2));
  if (!ok) process.exitCode = 1;
})().catch((error) => {
  console.log(JSON.stringify({
    ok: false,
    error: error?.message || String(error)
  }, null, 2));
  process.exit(1);
});
