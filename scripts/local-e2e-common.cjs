const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const {
  ROOT_DIR,
  ensureDir,
  readNumberEnv,
  resolvePlaywrightModule,
} = require("./railway-test-common.cjs");

const BACKEND_DIR = path.join(ROOT_DIR, "backend");
const FRONTEND_DIR = path.join(ROOT_DIR, "frontend");
const RESULTS_ROOT = process.env.LOCAL_E2E_RESULTS_ROOT || path.join(ROOT_DIR, "test-results", "local-e2e");
const FALLBACK_RESULTS_ROOT = path.join(os.tmpdir(), "texasholdem-local-e2e");
const DEFAULT_BACKEND_URL = process.env.LOCAL_BACKEND_URL || "http://127.0.0.1:8080";
const DEFAULT_FRONTEND_URL = process.env.LOCAL_FRONTEND_URL || "http://127.0.0.1:5173";
const STARTUP_TIMEOUT_MS = readNumberEnv("LOCAL_E2E_STARTUP_TIMEOUT_MS", 120000);
const POLL_INTERVAL_MS = readNumberEnv("LOCAL_E2E_POLL_INTERVAL_MS", 1000);

function timestamp() {
  return new Date().toISOString().replace(/[-:.]/g, "").replace("T", "-").replace("Z", "Z");
}

function writeLogLine(stream, line) {
  stream.write(`${line}\n`);
}

function createRunArtifacts(label) {
  const candidates = [RESULTS_ROOT, FALLBACK_RESULTS_ROOT];

  for (const artifactsRoot of candidates) {
    try {
      ensureDir(artifactsRoot);
      const runDir = path.join(artifactsRoot, `${label}-${timestamp()}`);
      ensureDir(runDir);
      return {
        artifactsRoot,
        runDir,
        backendLog: path.join(runDir, "backend.log"),
        frontendLog: path.join(runDir, "frontend.log"),
        summaryFile: path.join(runDir, "summary.json"),
      };
    } catch (error) {
      if (artifactsRoot === candidates[candidates.length - 1]) {
        throw error;
      }
    }
  }
}

function isWindows() {
  return process.platform === "win32";
}

function spawnLoggedProcess(command, args, options) {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    shell: options.shell ?? false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const logStream = fs.createWriteStream(options.logFile, { flags: "a" });
  writeLogLine(logStream, `[spawn] ${command} ${args.join(" ")}`);

  child.stdout.on("data", (chunk) => {
    logStream.write(chunk);
  });
  child.stderr.on("data", (chunk) => {
    logStream.write(chunk);
  });
  child.on("exit", (code, signal) => {
    writeLogLine(logStream, `[exit] code=${code} signal=${signal}`);
    logStream.end();
  });

  return child;
}

function httpFetch(url, init) {
  return fetch(url, init);
}

async function waitForHttpOk(url, timeoutMs = STARTUP_TIMEOUT_MS, options = {}) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    if (options.child && options.child.exitCode != null) {
      const logSuffix = options.logFile ? ` Check ${options.logFile} for details.` : "";
      throw new Error(
        `${options.label || "Process"} exited before ${url} became healthy (exitCode=${options.child.exitCode}).${logSuffix}`,
      );
    }

    try {
      const response = await httpFetch(url, { method: "GET" });
      if (response.ok) {
        return response;
      }
      lastError = new Error(`HTTP ${response.status} for ${url}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  const logSuffix = options.logFile ? ` Check ${options.logFile} for details.` : "";
  throw new Error(`Timed out waiting for ${url}: ${lastError?.message || lastError}.${logSuffix}`);
}

function buildBackendEnv() {
  const env = { ...process.env };
  env.SPRING_PROFILES_ACTIVE = env.SPRING_PROFILES_ACTIVE || "local";
  env.APP_CORS_ALLOWED_ORIGINS =
    env.APP_CORS_ALLOWED_ORIGINS || "http://127.0.0.1:5173,http://localhost:5173";
  env.GRADLE_USER_HOME = env.GRADLE_USER_HOME || path.join(ROOT_DIR, ".gradle-local-e2e");
  return env;
}

function buildFrontendEnv() {
  const env = { ...process.env };
  env.VITE_API_BASE_URL = env.VITE_API_BASE_URL || DEFAULT_BACKEND_URL;
  env.VITE_TOURNAMENT_WS_URL = env.VITE_TOURNAMENT_WS_URL || "ws://127.0.0.1:8080/ws";
  env.BROWSER = "none";
  return env;
}

function startBackend(logFile) {
  if (isWindows()) {
    const gradleCommand = "& .\\gradlew.bat bootRun --args='--spring.profiles.active=local'";
    return spawnLoggedProcess(
      "powershell.exe",
      ["-NoProfile", "-Command", gradleCommand],
      {
        cwd: BACKEND_DIR,
        env: buildBackendEnv(),
        shell: false,
        logFile,
      },
    );
  }

  return spawnLoggedProcess("./gradlew", ["bootRun", "--args=--spring.profiles.active=local"], {
    cwd: BACKEND_DIR,
    env: buildBackendEnv(),
    logFile,
  });
}

function startFrontend(logFile) {
  if (isWindows()) {
    return spawnLoggedProcess(
      "powershell.exe",
      ["-NoProfile", "-Command", "npm.cmd run dev -- --host 127.0.0.1"],
      {
        cwd: FRONTEND_DIR,
        env: buildFrontendEnv(),
        shell: false,
        logFile,
      },
    );
  }

  return spawnLoggedProcess("npm", ["run", "dev", "--", "--host", "127.0.0.1"], {
    cwd: FRONTEND_DIR,
    env: buildFrontendEnv(),
    logFile,
  });
}

async function stopProcess(child, label) {
  if (!child || child.exitCode != null) {
    return;
  }

  if (isWindows()) {
    await new Promise((resolve) => {
      const killer = spawn("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], {
        stdio: "ignore",
        windowsHide: true,
      });
      killer.on("exit", () => resolve());
      killer.on("error", () => resolve());
    });
    return;
  }

  child.kill("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 1000));
  if (child.exitCode == null) {
    child.kill("SIGKILL");
  }
}

function resolvedPlaywrightDetails() {
  const { chromium, source } = resolvePlaywrightModule();
  const executablePath = typeof chromium.executablePath === "function" ? chromium.executablePath() : null;
  return { chromium, source, executablePath };
}

async function runBrowserPreflight() {
  const details = resolvedPlaywrightDetails();
  const result = {
    moduleSource: details.source,
    executablePath: details.executablePath,
    executableExists: Boolean(details.executablePath && fs.existsSync(details.executablePath)),
    launchOk: false,
    launchError: null,
  };

  let browser;
  try {
    browser = await details.chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto("data:text/html,<html><body>ok</body></html>");
    result.launchOk = true;
  } catch (error) {
    result.launchError = String(error?.message || error);
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }
  }

  return result;
}

module.exports = {
  ROOT_DIR,
  BACKEND_DIR,
  FRONTEND_DIR,
  RESULTS_ROOT,
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
};
