const fs = require("fs");
const path = require("path");
const {
  ROOT_DIR,
  DEFAULT_FRONTEND_URL,
  DEFAULT_BACKEND_URL,
  ensureDir,
  sleep,
  readNumberEnv,
  readSeatCountEnv,
  timestampId,
  resolvePlaywrightModule,
} = require("./railway-test-common.cjs");

const { chromium } = resolvePlaywrightModule();

const FRONTEND_URL = process.env.FRONTEND_URL || DEFAULT_FRONTEND_URL;
const BACKEND_URL = process.env.BACKEND_URL || DEFAULT_BACKEND_URL;
const PLAYER_COUNT = readSeatCountEnv("PLAYER_COUNT", 6, { minimum: 2, maximum: 9 });
const ACTION_LIMIT = readNumberEnv("ACTION_LIMIT", 120);
const ITERATION_PAUSE_MS = readNumberEnv("ITERATION_PAUSE_MS", 3000);
const MAX_ITERATIONS = readNumberEnv("MAX_ITERATIONS", 0);
const RESULTS_ROOT =
  process.env.CONTINUOUS_RESULTS_ROOT || path.join(ROOT_DIR, "test-results", "continuous-live-runs");
const START_TIMEOUT_MS = readNumberEnv("START_TIMEOUT_MS", 30000);
const ACTION_TIMEOUT_MS = readNumberEnv("ACTION_TIMEOUT_MS", 15000);
const STATE_ADVANCE_TIMEOUT_MS = readNumberEnv("STATE_ADVANCE_TIMEOUT_MS", 12000);
const HAND_RESULT_WAIT_MS = readNumberEnv("HAND_RESULT_WAIT_MS", 6500);
const POLL_INTERVAL_MS = readNumberEnv("POLL_INTERVAL_MS", 500);

function writeJson(filepath, payload) {
  fs.writeFileSync(filepath, `${JSON.stringify(payload, null, 2)}\n`);
}

function buildAuthHeaders(guestToken, extraHeaders = {}) {
  return {
    ...(guestToken ? { Authorization: `Bearer ${guestToken}` } : {}),
    ...extraHeaders,
  };
}

async function parseResponse(response) {
  const text = await response.text();
  try {
    return {
      ok: response.ok(),
      status: response.status(),
      body: JSON.parse(text),
    };
  } catch {
    return {
      ok: response.ok(),
      status: response.status(),
      body: text,
    };
  }
}

async function requestJson(request, guestToken, method, pathname, body) {
  const response = await request.fetch(`${BACKEND_URL}${pathname}`, {
    method,
    headers: buildAuthHeaders(guestToken, { "Content-Type": "application/json" }),
    data: body,
  });
  const payload = await parseResponse(response);
  if (!payload.ok) {
    throw new Error(`${method} ${pathname} failed: ${payload.status} ${JSON.stringify(payload.body)}`);
  }
  return payload.body.data;
}

async function getSnapshot(request, guestToken, code) {
  const response = await request.get(`${BACKEND_URL}/api/v1/tournaments/${code}`, {
    headers: buildAuthHeaders(guestToken),
  });
  const payload = await parseResponse(response);
  if (!payload.ok) {
    throw new Error(`GET /api/v1/tournaments/${code} failed: ${payload.status} ${JSON.stringify(payload.body)}`);
  }
  return payload.body.data;
}

function chooseAction(actions, actionCount) {
  const available = new Set(actions);
  if (available.has("CHECK")) {
    return "CHECK";
  }
  if (available.has("CALL")) {
    return "CALL";
  }
  if (available.has("FOLD")) {
    return "FOLD";
  }
  if (available.has("BET")) {
    return "BET";
  }
  if (available.has("RAISE")) {
    return "RAISE";
  }
  if (available.has("ALL_IN")) {
    return "ALL_IN";
  }
  if (available.has("CHECK")) {
    return "CHECK";
  }
  if (available.has("CALL")) {
    return "CALL";
  }
  return actions[0] ?? null;
}

function actionMatcher(action) {
  switch (action) {
    case "FOLD":
      return /^Fold$/i;
    case "CHECK":
      return /^Check$/i;
    case "CALL":
      return /^Call\b/i;
    case "ALL_IN":
      return /^All in$/i;
    case "BET":
      return /^Bet\b/i;
    case "RAISE":
      return /^Raise\b/i;
    default:
      return new RegExp(`^${action.replaceAll("_", " ")}$`, "i");
  }
}

async function collectDomState(page) {
  return page.evaluate(() => ({
    url: window.location.href,
    title: document.title,
    buttons: [...document.querySelectorAll("button")]
      .map((button) => ({
        label: (button.textContent || "").trim().replace(/\s+/g, " "),
        disabled: button.disabled,
      }))
      .filter((entry) => entry.label),
    bodyText: document.body.innerText,
  }));
}

async function captureFailure(players, artifactDir, label) {
  ensureDir(artifactDir);
  await Promise.all(
    players.map(async (player) => {
      const screenshotPath = path.join(artifactDir, `${label}-${player.label}.png`);
      try {
        await player.page.screenshot({ path: screenshotPath, fullPage: true });
      } catch (error) {
        fs.writeFileSync(
          path.join(artifactDir, `${label}-${player.label}.txt`),
          String(error?.message || error),
        );
      }
    }),
  );
}

async function waitForTournamentPage(page, code) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < START_TIMEOUT_MS) {
    if (new RegExp(`/tournaments/${code}$`).test(page.url())) {
      try {
        await page.waitForSelector('[data-testid="tournament-table"]', { timeout: 1000 });
        return;
      } catch {
        // ignore and retry
      }
    }
    await sleep(500);
  }
  throw new Error(`Page did not reach /tournaments/${code}: ${page.url()}`);
}

async function waitForEnabledActionButton(page, action) {
  const matcher = actionMatcher(action);
  const startedAt = Date.now();

  while (Date.now() - startedAt < ACTION_TIMEOUT_MS) {
    const buttons = page.locator("button");
    const count = await buttons.count();
    for (let index = 0; index < count; index += 1) {
      const button = buttons.nth(index);
      const label = ((await button.textContent()) || "").trim().replace(/\s+/g, " ");
      if (!matcher.test(label)) {
        continue;
      }
      if (await button.isEnabled()) {
        return button;
      }
    }
    await sleep(300);
  }

  throw new Error(`No enabled action button found for ${action}`);
}

async function submitSizedAction(page, action) {
  const presetMatchers = [/^2 BB\b/i, /^3 BB\b/i, /^1\/2 Pot\b/i, /^2\/3 Pot\b/i, /^Pot\b/i];
  const presetButtons = page.locator("button");
  const presetCount = await presetButtons.count();
  for (let index = 0; index < presetCount; index += 1) {
    const button = presetButtons.nth(index);
    const label = ((await button.textContent()) || "").trim().replace(/\s+/g, " ");
    if (!presetMatchers.some((matcher) => matcher.test(label))) {
      continue;
    }
    if (await button.isVisible().catch(() => false) && (await button.isEnabled().catch(() => false))) {
      await button.click({ force: true });
      break;
    }
  }

  const matcher = action === "BET" ? /^Bet to\b/i : /^Raise to\b/i;
  const startedAt = Date.now();

  while (Date.now() - startedAt < ACTION_TIMEOUT_MS) {
    const buttons = page.locator("button");
    const count = await buttons.count();
    for (let index = 0; index < count; index += 1) {
      const button = buttons.nth(index);
      const label = ((await button.textContent()) || "").trim().replace(/\s+/g, " ");
      if (!matcher.test(label)) {
        continue;
      }
      if (await button.isEnabled()) {
        await button.click({ force: true });
        return;
      }
    }
    await sleep(300);
  }

  throw new Error(`No enabled sizing submit button found for ${action}`);
}

async function waitForStateAdvance(request, guestToken, code, previousStateVersion) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < STATE_ADVANCE_TIMEOUT_MS) {
    const snapshot = await getSnapshot(request, guestToken, code);
    if (snapshot.stateVersion > previousStateVersion) {
      return snapshot;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  return null;
}

async function createBrowserPlayers(browser, iterationTag, consoleMessages, pageErrors) {
  const players = [];
  for (let index = 0; index < PLAYER_COUNT; index += 1) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
    });
    const page = await context.newPage();
    const label = `p${index + 1}`;
    const nickname = `${iterationTag}${index + 1}`.slice(0, 20);

    page.on("console", (message) => {
      if (["error", "warning"].includes(message.type())) {
        consoleMessages.push({ label, type: message.type(), text: message.text() });
      }
    });
    page.on("pageerror", (error) => {
      pageErrors.push({ label, message: error.message });
    });

    players.push({
      label,
      nickname,
      guestId: "",
      guestToken: "",
      context,
      page,
      request: context.request,
    });
  }
  return players;
}

async function runTournament(options = {}) {
  const artifactDir = options.artifactDir;
  const iterationTag = (options.iterationTag || "live").slice(0, 14);
  const browser = await chromium.launch({ headless: options.headless !== false });
  const consoleMessages = [];
  const pageErrors = [];
  const statusHistory = [];
  const domSamples = {};
  const issues = [];
  let players = [];

  try {
    players = await createBrowserPlayers(browser, iterationTag, consoleMessages, pageErrors);

    for (const player of players) {
      const session = await requestJson(player.request, null, "POST", "/api/v1/guests", { nickname: player.nickname });
      player.guestId = session.guestId;
      player.guestToken = session.guestToken;
      await player.page.addInitScript((guestSession) => {
        window.localStorage.setItem(
          "texas-holdem-guest-session",
          JSON.stringify({
            guestId: guestSession.guestId,
            guestToken: guestSession.guestToken,
          }),
        );
        const raw = window.localStorage.getItem("texas-holdem-ui");
        const parsed = raw ? JSON.parse(raw) : {};
        window.localStorage.setItem(
          "texas-holdem-ui",
          JSON.stringify({
            ...parsed,
            guestId: guestSession.guestId,
            nickname: guestSession.nickname,
            stackDisplayMode: parsed.stackDisplayMode === "bb" ? "bb" : "chips",
          }),
        );
      }, session);
    }

    const owner = players[0];
    const created = await requestJson(owner.request, owner.guestToken, "POST", "/api/v1/tournaments", {
      nickname: owner.nickname,
      roomName: `${iterationTag}-${Date.now()}`,
      visibility: "PUBLIC",
    });
    const code = created.code;

    for (let index = 1; index < players.length; index += 1) {
      const player = players[index];
      await requestJson(player.request, player.guestToken, "POST", `/api/v1/tournaments/${code}/join`, {
        nickname: player.nickname,
      });
    }

    for (const player of players) {
      await requestJson(player.request, player.guestToken, "POST", `/api/v1/tournaments/${code}/ready`, {
        ready: true,
      });
    }

    await requestJson(owner.request, owner.guestToken, "POST", `/api/v1/tournaments/${code}/start`, {});

    await Promise.all(
      players.map(async (player) => {
        await player.page.goto(`${FRONTEND_URL}/tournaments/${code}`, { waitUntil: "networkidle" });
        await waitForTournamentPage(player.page, code);
      }),
    );

    let ownerSnapshot = await waitForStateAdvance(owner.request, owner.guestToken, code, -1);
    if (!ownerSnapshot) {
      issues.push("Tournament did not advance after start.");
      await captureFailure(players, artifactDir, "start-timeout");
      ownerSnapshot = await getSnapshot(owner.request, owner.guestToken, code);
    }

    statusHistory.push({
      handNumber: ownerSnapshot.handNumber,
      stateVersion: ownerSnapshot.stateVersion,
      status: ownerSnapshot.status,
      actingSeat: ownerSnapshot.actingSeat,
    });

    let actionCount = 0;
    let handResultCount = 0;
    let lastHandResultVersion = null;

    while (actionCount < (options.actionLimit || ACTION_LIMIT)) {
      const table = await getSnapshot(owner.request, owner.guestToken, code);
      const lastState = statusHistory[statusHistory.length - 1];
      if (
        !lastState ||
        lastState.stateVersion !== table.stateVersion ||
        lastState.status !== table.status ||
        lastState.actingSeat !== table.actingSeat
      ) {
        statusHistory.push({
          handNumber: table.handNumber,
          stateVersion: table.stateVersion,
          status: table.status,
          actingSeat: table.actingSeat,
        });
      }

      if (table.status === "FINISHED") {
        break;
      }

      if (table.status === "HAND_RESULT") {
        if (lastHandResultVersion !== table.stateVersion) {
          handResultCount += 1;
          lastHandResultVersion = table.stateVersion;
        }
        await sleep(HAND_RESULT_WAIT_MS);
        continue;
      }

      if (table.status !== "IN_HAND") {
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      const actor = table.players.find((candidate) => candidate.seatIndex === table.actingSeat);
      if (!actor) {
        issues.push(`No actor found for actingSeat ${table.actingSeat}`);
        await captureFailure(players, artifactDir, "missing-actor");
        break;
      }

      const player = players.find((candidate) => candidate.guestId === actor.guestId);
      if (!player) {
        issues.push(`No browser player found for guest ${actor.guestId}`);
        await captureFailure(players, artifactDir, "missing-player");
        break;
      }

      const action = chooseAction(table.availableActions, actionCount);
      if (!action) {
        issues.push(`No action chosen for seat ${actor.seatIndex + 1}`);
        await captureFailure(players, artifactDir, "missing-action");
        break;
      }

      domSamples[player.label] = await collectDomState(player.page);

      let clicked = false;
      let lastError = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          if (attempt === 1) {
            await player.page.reload({ waitUntil: "networkidle" });
            await waitForTournamentPage(player.page, code);
          }
          const button = await waitForEnabledActionButton(player.page, action);
          await button.click({ force: true });
          if (action === "BET" || action === "RAISE") {
            await submitSizedAction(player.page, action);
          }
          clicked = true;
          break;
        } catch (error) {
          lastError = error;
        }
      }

      if (!clicked) {
        issues.push(
          `Failed clicking ${action} for ${player.label}/seat ${actor.seatIndex + 1}: ${lastError?.message || lastError}`,
        );
        await captureFailure(players, artifactDir, `action-failure-${actionCount + 1}`);
        break;
      }

      actionCount += 1;
      const advanced = await waitForStateAdvance(owner.request, owner.guestToken, code, table.stateVersion);
      if (!advanced) {
        issues.push(
          `State did not advance after ${action} by ${player.label}/seat ${actor.seatIndex + 1} from version ${table.stateVersion}`,
        );
        await captureFailure(players, artifactDir, `state-stalled-${actionCount}`);
        break;
      }
    }

    const finalSnapshot = await getSnapshot(owner.request, owner.guestToken, code);
    const finalDomState = {};
    for (const player of players) {
      finalDomState[player.label] = await collectDomState(player.page);
    }

    const summary = {
      frontendUrl: FRONTEND_URL,
      backendUrl: BACKEND_URL,
      code,
      startedAt: options.startedAt || new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      actionCount,
      handResultCount,
      finalStatus: finalSnapshot.status,
      finalHandNumber: finalSnapshot.handNumber,
      finalStateVersion: finalSnapshot.stateVersion,
      players: players.map((player) => ({
        label: player.label,
        nickname: player.nickname,
        guestId: player.guestId,
      })),
      statusHistory,
      issues: [...new Set(issues)],
      consoleMessages,
      pageErrors,
      domSamples,
      finalDomState,
      artifactDir,
    };

    ensureDir(artifactDir);
    writeJson(path.join(artifactDir, "summary.json"), summary);
    return summary;
  } finally {
    await Promise.all(players.map((player) => player.context.close().catch(() => undefined)));
    await browser.close();
  }
}

async function main() {
  ensureDir(RESULTS_ROOT);
  const startedAt = new Date().toISOString();
  const batchName = `railway-seat-live-${timestampId()}`;
  const batchDir = path.join(RESULTS_ROOT, batchName);
  const latestFile = path.join(RESULTS_ROOT, "latest-batch.json");
  const pidFile = path.join(RESULTS_ROOT, "continuous-run.pid");
  const tournaments = [];

  ensureDir(batchDir);
  writeJson(latestFile, { batchDir, startedAt, pid: process.pid });
  fs.writeFileSync(pidFile, `${process.pid}\n`);

  const state = {
    batchDir,
    startedAt,
    finishedAt: null,
    requestedTournaments: MAX_ITERATIONS || null,
    completedTournaments: 0,
    totalActions: 0,
    totalHandResults: 0,
    issueCount: 0,
    consoleMessageCount: 0,
    pageErrorCount: 0,
    tournaments,
  };

  const flush = () => writeJson(path.join(batchDir, "batch-summary.json"), state);
  const finalize = () => {
    state.finishedAt = new Date().toISOString();
    flush();
  };

  process.on("SIGINT", () => {
    finalize();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    finalize();
    process.exit(143);
  });

  let index = 0;
  while (MAX_ITERATIONS === 0 || index < MAX_ITERATIONS) {
    index += 1;
    const runDir = path.join(batchDir, `run-${String(index).padStart(4, "0")}`);
    const iterationStartedAt = new Date().toISOString();
    ensureDir(runDir);

    let summary;
    try {
      summary = await runTournament({
        artifactDir: runDir,
        iterationTag: `lv${index}p`,
        startedAt: iterationStartedAt,
      });
    } catch (error) {
      summary = {
        code: null,
        startedAt: iterationStartedAt,
        finishedAt: new Date().toISOString(),
        actionCount: 0,
        handResultCount: 0,
        finalStatus: "ERROR",
        finalHandNumber: null,
        finalStateVersion: null,
        players: [],
        statusHistory: [],
        issues: [String(error?.message || error)],
        consoleMessages: [],
        pageErrors: [],
        artifactDir: runDir,
      };
      writeJson(path.join(runDir, "summary.json"), summary);
    }

    tournaments.push({
      index,
      code: summary.code,
      actionCount: summary.actionCount,
      handResults: summary.handResultCount,
      finalStatus: summary.finalStatus,
      finalHandNumber: summary.finalHandNumber,
      finalStateVersion: summary.finalStateVersion,
      issueCount: summary.issues.length,
      artifactDir: runDir,
    });

    state.completedTournaments = tournaments.length;
    state.totalActions += summary.actionCount;
    state.totalHandResults += summary.handResultCount;
    state.issueCount += summary.issues.length;
    state.consoleMessageCount += summary.consoleMessages.length;
    state.pageErrorCount += summary.pageErrors.length;
    flush();

    console.log(
      [
        `[${new Date().toISOString()}]`,
        `run=${index}`,
        `code=${summary.code || "n/a"}`,
        `status=${summary.finalStatus}`,
        `actions=${summary.actionCount}`,
        `handResults=${summary.handResultCount}`,
        `issues=${summary.issues.length}`,
      ].join(" "),
    );

    if (summary.issues.length > 0) {
      console.log(JSON.stringify({ code: summary.code, issues: summary.issues.slice(0, 5) }, null, 2));
    }

    if (MAX_ITERATIONS === 0 || index < MAX_ITERATIONS) {
      await sleep(ITERATION_PAUSE_MS);
    }
  }

  finalize();
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  runTournament,
};
