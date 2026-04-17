import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
const wantsHelp = args.includes("--help") || args.includes("-h");
const wantsPreflight = args.includes("--preflight");
const wantsHeaded = args.includes("--headed");
const wantsDebug = args.includes("--debug");

if (wantsHelp) {
  console.log(
    [
      "Usage: node ../scripts/run-frontend-e2e.mjs [--preflight] [--headed] [--debug]",
      "--preflight  Run Playwright resolution/browser launch diagnostics only",
      "--headed     Request headed browser mode for the local smoke runner",
      "--debug      Alias for headed mode and sets PWDEBUG=1",
    ].join("\n"),
  );
  process.exit(0);
}

const targetScript = wantsPreflight ? "local-playwright-preflight.cjs" : "local-e2e-smoke.cjs";
const targetPath = path.join(__dirname, targetScript);
const env = { ...process.env };

if (wantsHeaded || wantsDebug) {
  env.LOCAL_E2E_HEADED = "true";
}

if (wantsDebug) {
  env.PWDEBUG = env.PWDEBUG || "1";
}

const child = spawn(process.execPath, [targetPath], {
  stdio: "inherit",
  env,
  windowsHide: false,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
