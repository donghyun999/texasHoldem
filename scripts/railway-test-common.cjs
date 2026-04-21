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

function clampSeatCount(value, name, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}. Received: ${value}`);
  }

  return value;
}

function readSeatCountEnv(name, fallback, options = {}) {
  const minimum = options.minimum ?? 2;
  const maximum = options.maximum ?? 9;
  const parsed = readNumberEnv(name, fallback);
  return clampSeatCount(parsed, name, minimum, maximum);
}

function expandSeatCountToken(token, minimum, maximum) {
  const trimmed = String(token || "").trim();
  if (!trimmed) {
    return [];
  }

  const rangeMatch = /^(\d+)\s*(?:-|~|\.\.)\s*(\d+)$/.exec(trimmed);
  if (!rangeMatch) {
    return [clampSeatCount(Number(trimmed), "seat count token", minimum, maximum)];
  }

  const start = clampSeatCount(Number(rangeMatch[1]), "seat count range start", minimum, maximum);
  const end = clampSeatCount(Number(rangeMatch[2]), "seat count range end", minimum, maximum);
  const direction = start <= end ? 1 : -1;
  const values = [];
  for (let current = start; direction > 0 ? current <= end : current >= end; current += direction) {
    values.push(current);
  }
  return values;
}

function readSeatCountsEnv(name, fallback, options = {}) {
  const minimum = options.minimum ?? 2;
  const maximum = options.maximum ?? 9;
  const raw = process.env[name] == null || process.env[name] === "" ? fallback : process.env[name];
  const values = String(raw)
    .split(",")
    .flatMap((token) => expandSeatCountToken(token, minimum, maximum));

  if (values.length === 0) {
    throw new Error(`${name} must include at least one seat count between ${minimum} and ${maximum}.`);
  }

  return [...new Set(values)];
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
  readSeatCountEnv,
  readSeatCountsEnv,
  sleep,
  ensureDir,
  timestampId,
  defaultTournamentCode,
  resolvePlaywrightModule,
  assertContinuousRailwayRunAllowed,
};
