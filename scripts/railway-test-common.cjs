const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_FRONTEND_URL = "https://texasholdemfrontend-production.up.railway.app";
const DEFAULT_BACKEND_URL = "https://texasholdembackend-production.up.railway.app";

function readNumberEnv(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === "") {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureDir(targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
}

function timestampId() {
  return new Date().toISOString().replace(/[-:.]/g, "").replace("T", "-").replace("Z", "Z");
}

function defaultTournamentCode() {
  return `T${Date.now().toString(36).slice(-7).toUpperCase()}`;
}

function resolvePlaywrightModule() {
  const candidates = [
    process.env.PLAYWRIGHT_MODULE_PATH,
    "playwright",
    path.join(ROOT_DIR, "frontend", "node_modules", "playwright"),
    path.join(ROOT_DIR, "test-results", "playwright-work", "node_modules", "playwright"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const mod = require(candidate);
      return {
        chromium: mod.chromium,
        source: candidate,
      };
    } catch (error) {
      if (error && error.code !== "MODULE_NOT_FOUND") {
        throw error;
      }
    }
  }

  throw new Error(
    [
      "Unable to resolve Playwright for the Railway smoke scripts.",
      "Set PLAYWRIGHT_MODULE_PATH or install playwright in a known local location.",
      "Checked: playwright, frontend/node_modules/playwright, test-results/playwright-work/node_modules/playwright",
    ].join(" "),
  );
}

function assertContinuousRailwayRunAllowed() {
  if (process.env.ALLOW_CONTINUOUS_RAILWAY_TESTS !== "true") {
    throw new Error(
      "Refusing to run deployed continuous Railway smoke without ALLOW_CONTINUOUS_RAILWAY_TESTS=true.",
    );
  }

  const maxIterations = readNumberEnv("MAX_ITERATIONS", 1);
  if (maxIterations === 0 && process.env.ALLOW_INFINITE_CONTINUOUS_RAILWAY_TESTS !== "true") {
    throw new Error(
      "Refusing infinite continuous Railway smoke without ALLOW_INFINITE_CONTINUOUS_RAILWAY_TESTS=true.",
    );
  }
}

module.exports = {
  ROOT_DIR,
  DEFAULT_FRONTEND_URL,
  DEFAULT_BACKEND_URL,
  readNumberEnv,
  sleep,
  ensureDir,
  timestampId,
  defaultTournamentCode,
  resolvePlaywrightModule,
  assertContinuousRailwayRunAllowed,
};
