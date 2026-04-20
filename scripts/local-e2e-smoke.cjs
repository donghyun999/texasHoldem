const fs = require("fs");
const {
  DEFAULT_BACKEND_URL,
  DEFAULT_FRONTEND_URL,
  STARTUP_TIMEOUT_MS,
  createRunArtifacts,
  waitForHttpOk,
  startBackend,
  startFrontend,
  stopProcess,
  resolvedPlaywrightDetails,
  runBrowserPreflight,
} = require("./local-e2e-common.cjs");

async function runSmoke(page, urls) {
  await page.goto(urls.frontendUrl, { waitUntil: "networkidle" });
  await page.getByText("Nickname").waitFor({ timeout: 15000 });
  await page.getByText("Tournament Code").waitFor({ timeout: 15000 });
  const hasCreateButton = await page.getByRole("button", { name: "Create Tournament" }).isVisible();
  const healthResponse = await fetch(`${urls.backendUrl}/api/v1/status`);
  return {
    homeUrl: page.url(),
    hasCreateButton,
    backendHealthOk: healthResponse.ok,
    backendHealthStatus: healthResponse.status,
  };
}

async function main() {
  const artifacts = createRunArtifacts("local-smoke");
  const headless = process.env.LOCAL_E2E_HEADED === "true" ? false : true;
  const summary = {
    artifacts: artifacts.runDir,
    frontendUrl: DEFAULT_FRONTEND_URL,
    backendUrl: DEFAULT_BACKEND_URL,
    startupOk: false,
    browserPreflight: null,
    smoke: null,
    error: null,
  };

  let backendProcess;
  let frontendProcess;
  let browser;

  try {
    summary.browserPreflight = await runBrowserPreflight();
    if (!summary.browserPreflight.launchOk) {
      throw new Error(`Playwright browser preflight failed: ${summary.browserPreflight.launchError}`);
    }

    backendProcess = startBackend(artifacts.backendLog);
    await waitForHttpOk(`${summary.backendUrl}/api/v1/status`, STARTUP_TIMEOUT_MS);

    frontendProcess = startFrontend(artifacts.frontendLog);
    await waitForHttpOk(summary.frontendUrl, STARTUP_TIMEOUT_MS);
    summary.startupOk = true;

    const { chromium } = resolvedPlaywrightDetails();
    browser = await chromium.launch({ headless });
    const page = await browser.newPage();
    summary.smoke = await runSmoke(page, summary);
  } catch (error) {
    summary.error = String(error?.message || error);
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }
    await stopProcess(frontendProcess, "frontend");
    await stopProcess(backendProcess, "backend");
    fs.writeFileSync(artifacts.summaryFile, `${JSON.stringify(summary, null, 2)}\n`);
  }

  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.error ? 2 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
