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

const FRONTEND_URL = (process.env.FRONTEND_URL || DEFAULT_FRONTEND_URL).replace(/\/$/, "");
const BACKEND_URL = (process.env.BACKEND_URL || DEFAULT_BACKEND_URL).replace(/\/$/, "");
const PLAYER_COUNT = readSeatCountEnv("PLAYER_COUNT", 6, { minimum: 6, maximum: 9 });
const MAX_TOURNAMENTS = readNumberEnv("MAX_TOURNAMENTS", 5);
const ACTION_LIMIT = readNumberEnv("ACTION_LIMIT", 240);
const START_TIMEOUT_MS = readNumberEnv("START_TIMEOUT_MS", 30000);
const ACTION_TIMEOUT_MS = readNumberEnv("ACTION_TIMEOUT_MS", 20000);
const STATE_ADVANCE_TIMEOUT_MS = readNumberEnv("STATE_ADVANCE_TIMEOUT_MS", 12000);
const HAND_RESULT_WAIT_MS = readNumberEnv("HAND_RESULT_WAIT_MS", 6500);
const POLL_INTERVAL_MS = readNumberEnv("POLL_INTERVAL_MS", 500);
const ITERATION_PAUSE_MS = readNumberEnv("ITERATION_PAUSE_MS", 2000);
const RESULTS_ROOT =
  process.env.RAILWAY_EDGE_RESULTS_ROOT || path.join(ROOT_DIR, "test-results", "railway-edge-case-verify");

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

async function requestGuestSession(player) {
  const session = await requestJson(player.request, null, "POST", "/api/v1/guests", {
    nickname: player.nickname,
  });
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
  return session;
}

function normalizeText(value) {
  return (value || "").trim().replace(/\s+/g, " ");
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
      return /^Bet$/i;
    case "RAISE":
      return /^Raise$/i;
    default:
      return new RegExp(`^${action.replaceAll("_", " ")}$`, "i");
  }
}

function getSeatLabel(seatIndex) {
  return `seat${seatIndex + 1}`;
}

function pickReloadPlayer(players) {
  return players[Math.min(4, players.length - 1)];
}

function pickReconnectPlayer(players) {
  return players[Math.min(5, players.length - 1)];
}

function getActor(table, players) {
  const actorView = table.players.find((player) => player.seatIndex === table.actingSeat);
  if (!actorView) {
    return null;
  }
  const browserPlayer = players.find((player) => player.guestId === actorView.guestId);
  if (!browserPlayer) {
    return null;
  }
  return { actorView, browserPlayer };
}

function getNextActivePlayer(table, seatIndex) {
  const activePlayers = table.players
    .filter((player) => player.status === "ACTIVE" && player.stack > 0)
    .sort((left, right) => left.seatIndex - right.seatIndex);

  if (activePlayers.length <= 1) {
    return null;
  }

  const next = activePlayers.find((player) => player.seatIndex > seatIndex);
  return next || activePlayers[0] || null;
}

function buildCoverage() {
  return {
    raise: false,
    shortAllInRaise: false,
    seatReload: false,
    actingReload: false,
    disconnectReconnect: false,
  };
}

function hasTargetCoverage(coverage) {
  return (
    coverage.raise &&
    coverage.shortAllInRaise &&
    coverage.seatReload &&
    coverage.actingReload &&
    coverage.disconnectReconnect
  );
}

function chooseBaselineAction(actions) {
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
  return actions[0] ?? null;
}

function chooseSearchAction(table, coverage) {
  const available = new Set(table.availableActions);
  if (!coverage.raise && available.has("RAISE")) {
    return "RAISE";
  }
  if (table.chipsToCall > 0 && available.has("CALL")) {
    return "CALL";
  }
  if (available.has("CHECK")) {
    return "CHECK";
  }
  if (available.has("BET")) {
    return "BET";
  }
  if (available.has("CALL")) {
    return "CALL";
  }
  if (available.has("ALL_IN")) {
    return "ALL_IN";
  }
  if (available.has("FOLD")) {
    return "FOLD";
  }
  if (available.has("RAISE")) {
    return "RAISE";
  }
  return table.availableActions[0] ?? null;
}

function classifyShortAllInOpportunity(table) {
  const actor = table.players.find((player) => player.seatIndex === table.actingSeat);
  if (!actor) {
    return null;
  }

  const available = new Set(table.availableActions);
  if (!available.has("ALL_IN")) {
    return null;
  }

  if (table.chipsToCall <= 0 || table.minimumRaiseTo <= 0) {
    return null;
  }

  const currentCommitment = actor.roundContribution ?? 0;
  const allInCommitment = currentCommitment + actor.stack;
  const callCommitment = currentCommitment + table.chipsToCall;

  if (allInCommitment <= callCommitment) {
    return null;
  }

  if (allInCommitment >= table.minimumRaiseTo) {
    return null;
  }

  return {
    guestId: actor.guestId,
    seatIndex: actor.seatIndex,
    stack: actor.stack,
    roundContribution: currentCommitment,
    chipsToCall: table.chipsToCall,
    minimumRaiseTo: table.minimumRaiseTo,
    callCommitment,
    allInCommitment,
  };
}

function chooseExactRaiseTarget(actorView, actorTable, targetView) {
  if (!actorView || !targetView) {
    return null;
  }

  const actorTotalCommitment = (actorView.roundContribution ?? 0) + actorView.stack;
  const targetTotalCommitment = (targetView.roundContribution ?? 0) + targetView.stack;
  const minimumRaiseTo = actorTable.minimumRaiseTo ?? 0;
  const maxRaiseTo = Math.min(actorTotalCommitment, targetTotalCommitment - 1);

  if (targetTotalCommitment <= 0 || maxRaiseTo < minimumRaiseTo) {
    return null;
  }

  return maxRaiseTo;
}

function buildShortAllInPlan(table, actorTable) {
  const actorView = table.players.find((player) => player.seatIndex === table.actingSeat);
  if (!actorView) {
    return null;
  }

  const available = new Set(actorTable.availableActions || []);
  if (!available.has("RAISE")) {
    return null;
  }

  const targetView = getNextActivePlayer(table, actorView.seatIndex);
  if (!targetView || targetView.guestId === actorView.guestId) {
    return null;
  }

  const raiseTo = chooseExactRaiseTarget(actorView, actorTable, targetView);
  if (!raiseTo) {
    return null;
  }

  return {
    handNumber: table.handNumber,
    raiserGuestId: actorView.guestId,
    raiserSeatIndex: actorView.seatIndex,
    targetGuestId: targetView.guestId,
    targetSeatIndex: targetView.seatIndex,
    raiseTo,
  };
}

function timeRemainingMs(snapshot) {
  return Math.max(0, Number(snapshot.actionDeadlineAtEpochMilli || 0) - Date.now());
}

async function collectDomState(page) {
  return page.evaluate(() => ({
    url: window.location.href,
    title: document.title,
    bodyText: document.body.innerText,
    buttons: [...document.querySelectorAll("button")]
      .map((button) => ({
        label: (button.textContent || "").trim().replace(/\s+/g, " "),
        disabled: button.disabled,
      }))
      .filter((entry) => entry.label),
  }));
}

async function capturePlayer(player, artifactDir, label) {
  ensureDir(artifactDir);
  const filepath = path.join(artifactDir, `${label}-${player.label}.png`);
  await player.page.screenshot({ path: filepath, fullPage: true });
  return filepath;
}

async function captureAll(players, artifactDir, label) {
  ensureDir(artifactDir);
  const screenshots = [];
  for (const player of players) {
    const filepath = await capturePlayer(player, artifactDir, label);
    screenshots.push(filepath);
  }
  return screenshots;
}

async function waitForTournamentPage(page, code, timeout = START_TIMEOUT_MS) {
  await page.waitForURL(new RegExp(`/tournaments/${code}$`), { timeout, waitUntil: "commit" });
  await page.locator('[data-testid="tournament-table"]').waitFor({ state: "visible", timeout });
  await page.waitForLoadState("networkidle");
}

async function waitForEnabledActionButton(page, action, timeout = ACTION_TIMEOUT_MS) {
  const matcher = actionMatcher(action);

  await page.waitForFunction(
    ({ source, flags }) => {
      const regex = new RegExp(source, flags);
      return [...document.querySelectorAll("button")].some((candidate) => {
        const label = (candidate.textContent || "").trim().replace(/\s+/g, " ");
        return regex.test(label) && !candidate.disabled;
      });
    },
    { source: matcher.source, flags: matcher.flags },
    { timeout },
  );

  const buttons = page.locator("button");
  const count = await buttons.count();
  for (let index = 0; index < count; index += 1) {
    const button = buttons.nth(index);
    if (!(await button.isVisible().catch(() => false))) {
      continue;
    }

    const label = normalizeText(await button.textContent());
    if (!matcher.test(label)) {
      continue;
    }

    if (await button.isEnabled()) {
      return button;
    }
  }

  throw new Error(`No enabled action button found for ${action}`);
}

async function submitSizedAction(page, action, timeout = ACTION_TIMEOUT_MS) {
  const presetMatchers = [/^2 BB\b/i, /^3 BB\b/i, /^1\/2 Pot\b/i, /^2\/3 Pot\b/i, /^Pot\b/i];
  const presetButtons = page.locator("button");
  const presetCount = await presetButtons.count();
  for (let index = 0; index < presetCount; index += 1) {
    const button = presetButtons.nth(index);
    if (!(await button.isVisible().catch(() => false)) || !(await button.isEnabled().catch(() => false))) {
      continue;
    }

    const label = normalizeText(await button.textContent());
    if (presetMatchers.some((matcher) => matcher.test(label))) {
      await button.click({ force: true });
      break;
    }
  }

  const matcher = action === "BET" ? /^Bet to\b/i : /^Raise to\b/i;
  await page.waitForFunction(
    ({ source, flags }) => {
      const regex = new RegExp(source, flags);
      return [...document.querySelectorAll("button")].some((candidate) => {
        const label = (candidate.textContent || "").trim().replace(/\s+/g, " ");
        return regex.test(label) && !candidate.disabled;
      });
    },
    { source: matcher.source, flags: matcher.flags },
    { timeout },
  );

  const buttons = page.locator("button");
  const count = await buttons.count();
  for (let index = 0; index < count; index += 1) {
    const button = buttons.nth(index);
    if (!(await button.isVisible().catch(() => false))) {
      continue;
    }

    const label = normalizeText(await button.textContent());
    if (!matcher.test(label)) {
      continue;
    }

    if (await button.isEnabled()) {
      await button.click({ force: true });
      return;
    }
  }

  throw new Error(`No enabled sizing submit button found for ${action}`);
}

async function clickExactButton(page, label, timeout = ACTION_TIMEOUT_MS) {
  const matcher = new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
  await page.waitForFunction(
    ({ source, flags }) => {
      const regex = new RegExp(source, flags);
      return [...document.querySelectorAll("button")].some((candidate) => {
        const text = (candidate.textContent || "").trim().replace(/\s+/g, " ");
        return regex.test(text) && !candidate.disabled;
      });
    },
    { source: matcher.source, flags: matcher.flags },
    { timeout },
  );

  const buttons = page.locator("button");
  const count = await buttons.count();
  for (let index = 0; index < count; index += 1) {
    const button = buttons.nth(index);
    if (!(await button.isVisible().catch(() => false)) || !(await button.isEnabled().catch(() => false))) {
      continue;
    }

    const text = normalizeText(await button.textContent());
    if (!matcher.test(text)) {
      continue;
    }

    await button.click({ force: true });
    return;
  }

  throw new Error(`No enabled exact button found for ${label}`);
}

async function submitExactSizedAction(page, action, targetAmount, timeout = ACTION_TIMEOUT_MS) {
  if (!Number.isInteger(targetAmount) || targetAmount <= 0) {
    throw new Error(`Invalid ${action} target amount: ${targetAmount}`);
  }

  await clickExactButton(page, "C", timeout);
  for (const digit of String(targetAmount)) {
    await clickExactButton(page, digit, timeout);
  }

  const matcher = action === "BET" ? /^Bet to\b/i : /^Raise to\b/i;
  await page.waitForFunction(
    ({ source, flags }) => {
      const regex = new RegExp(source, flags);
      return [...document.querySelectorAll("button")].some((candidate) => {
        const label = (candidate.textContent || "").trim().replace(/\s+/g, " ");
        return regex.test(label) && !candidate.disabled;
      });
    },
    { source: matcher.source, flags: matcher.flags },
    { timeout },
  );

  const buttons = page.locator("button");
  const count = await buttons.count();
  for (let index = 0; index < count; index += 1) {
    const button = buttons.nth(index);
    if (!(await button.isVisible().catch(() => false)) || !(await button.isEnabled().catch(() => false))) {
      continue;
    }

    const label = normalizeText(await button.textContent());
    if (!matcher.test(label)) {
      continue;
    }

    await button.click({ force: true });
    return;
  }

  throw new Error(`No enabled exact sizing submit button found for ${action} ${targetAmount}`);
}

async function waitForStateAdvance(request, guestToken, code, previousStateVersion, timeout = STATE_ADVANCE_TIMEOUT_MS) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const snapshot = await getSnapshot(request, guestToken, code);
    if (snapshot.stateVersion > previousStateVersion) {
      return snapshot;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  return null;
}

async function waitForPlayerConnected(request, guestToken, code, targetGuestId, connected, timeout = START_TIMEOUT_MS) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const snapshot = await getSnapshot(request, guestToken, code);
    const player = snapshot.players.find((entry) => entry.guestId === targetGuestId);
    if (player && player.connected === connected) {
      return snapshot;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  return null;
}

async function reloadAndAssert(player, code, expectedActions = []) {
  await player.page.reload({ waitUntil: "networkidle" });
  await waitForTournamentPage(player.page, code);
  if (expectedActions.length > 0) {
    await Promise.any(expectedActions.map((action) => waitForEnabledActionButton(player.page, action, ACTION_TIMEOUT_MS)));
  }
  return collectDomState(player.page);
}

async function ensureReturnToPlayCleared(player, code) {
  const domState = await collectDomState(player.page);
  const hasReturnToPlay = domState.buttons.some((button) => /^Return to Play$/i.test(button.label) && !button.disabled);
  if (!hasReturnToPlay) {
    return domState;
  }

  await requestJson(player.request, player.guestToken, "POST", `/api/v1/tournaments/${code}/return-to-play`, { code });
  await player.page.reload({ waitUntil: "networkidle" });
  await waitForTournamentPage(player.page, code);
  return collectDomState(player.page);
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

async function setupTournament(players, iterationTag) {
  for (const player of players) {
    await requestGuestSession(player);
  }

  const owner = players[0];
  const created = await requestJson(owner.request, owner.guestToken, "POST", "/api/v1/tournaments", {
    nickname: owner.nickname,
    roomName: `edge-${iterationTag}-${Date.now()}`.slice(0, 40),
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
      code,
      ready: true,
    });
  }

  await requestJson(owner.request, owner.guestToken, "POST", `/api/v1/tournaments/${code}/start`, { code });

  await Promise.all(
    players.map(async (player) => {
      await player.page.goto(`${FRONTEND_URL}/tournaments/${code}`, { waitUntil: "networkidle" });
      await waitForTournamentPage(player.page, code);
    }),
  );

  return { code, owner };
}

function chooseActionForCoverage(table, actorTable, coverage, shortAllInPlan) {
  const actorView = table.players.find((player) => player.seatIndex === table.actingSeat);
  const shortAllIn = classifyShortAllInOpportunity(actorTable);
  if (
    !coverage.shortAllInRaise &&
    shortAllInPlan &&
    actorView &&
    shortAllInPlan.handNumber === table.handNumber &&
    shortAllInPlan.raiserGuestId === actorView.guestId
  ) {
    return {
      action: "RAISE",
      amount: shortAllInPlan.raiseTo,
      shortAllIn: null,
    };
  }

  if (!coverage.shortAllInRaise && shortAllIn) {
    return {
      action: "ALL_IN",
      amount: null,
      shortAllIn,
    };
  }

  const available = new Set(actorTable.availableActions);
  if (!coverage.raise && available.has("RAISE")) {
    return {
      action: "RAISE",
      amount: null,
      shortAllIn: null,
    };
  }

  if (!coverage.shortAllInRaise) {
    return {
      action: chooseSearchAction(actorTable, coverage),
      amount: null,
      shortAllIn,
    };
  }

  return {
    action: chooseBaselineAction(actorTable.availableActions),
    amount: null,
    shortAllIn,
  };
}

async function runTournamentAttempt(options = {}) {
  const browser = await chromium.launch({ headless: options.headless !== false });
  const consoleMessages = [];
  const pageErrors = [];
  const issues = [];
  const coverage = buildCoverage();
  const actionLog = [];
  const screenshots = [];
  const screenshotHighlights = {
    seatReload: [],
    actingReload: [],
    disconnectReconnect: [],
    shortAllInRaise: [],
  };
  const statusHistory = [];
  const domSamples = {};
  const artifactDir = options.artifactDir;
  const iterationTag = (options.iterationTag || "edge").slice(0, 14);
  let players = [];
  let code = null;
  let shortAllInPlan = null;

  try {
    players = await createBrowserPlayers(browser, iterationTag, consoleMessages, pageErrors);
    const { code: tournamentCode, owner } = await setupTournament(players, iterationTag);
    code = tournamentCode;

    const seatReloadPlayer = pickReloadPlayer(players);
    const reconnectPlayer = pickReconnectPlayer(players);

    let ownerSnapshot = await waitForStateAdvance(owner.request, owner.guestToken, code, -1, START_TIMEOUT_MS);
    if (!ownerSnapshot) {
      issues.push("Tournament did not advance after start.");
      screenshots.push(...(await captureAll(players, artifactDir, "start-timeout")));
      ownerSnapshot = await getSnapshot(owner.request, owner.guestToken, code);
    }

    screenshots.push(await capturePlayer(seatReloadPlayer, artifactDir, `01-${getSeatLabel(4)}-after-start`));
    const seatReloadState = await reloadAndAssert(seatReloadPlayer, code);
    domSamples.seatReload = seatReloadState;
    screenshots.push(await capturePlayer(seatReloadPlayer, artifactDir, `02-${getSeatLabel(4)}-after-reload`));
    screenshotHighlights.seatReload.push(screenshots[screenshots.length - 1]);
    coverage.seatReload = true;

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

      const actor = getActor(table, players);
      if (!actor) {
        issues.push(`No browser actor found for actingSeat ${table.actingSeat}`);
        screenshots.push(...(await captureAll(players, artifactDir, "missing-actor")));
        break;
      }

      const actorTable =
        actor.browserPlayer.guestId === owner.guestId
          ? table
          : await getSnapshot(actor.browserPlayer.request, actor.browserPlayer.guestToken, code);

      if (shortAllInPlan && shortAllInPlan.handNumber !== table.handNumber) {
        shortAllInPlan = null;
      }
      if (
        shortAllInPlan &&
        actor.actorView.guestId !== shortAllInPlan.raiserGuestId &&
        actor.actorView.guestId !== shortAllInPlan.targetGuestId
      ) {
        shortAllInPlan = null;
      }
      if (!coverage.shortAllInRaise && !shortAllInPlan) {
        shortAllInPlan = buildShortAllInPlan(table, actorTable);
      }

      if (!coverage.disconnectReconnect && actionCount >= 2) {
        const reconnectTargetView = table.players.find((player) => player.guestId === reconnectPlayer.guestId);
        if (reconnectTargetView && reconnectTargetView.participating && reconnectTargetView.guestId !== actor.actorView.guestId) {
          await requestJson(
            reconnectPlayer.request,
            reconnectPlayer.guestToken,
            "POST",
            `/api/v1/tournaments/${code}/disconnect`,
            { code },
          );
          const disconnectedSnapshot = await waitForPlayerConnected(
            owner.request,
            owner.guestToken,
            code,
            reconnectPlayer.guestId,
            false,
          );
          if (!disconnectedSnapshot) {
            issues.push(`Reconnect target ${reconnectPlayer.label} did not flip to disconnected.`);
            screenshots.push(...(await captureAll(players, artifactDir, "disconnect-timeout")));
            break;
          }

          await requestJson(
            reconnectPlayer.request,
            reconnectPlayer.guestToken,
            "POST",
            `/api/v1/tournaments/${code}/reconnect`,
            { code },
          );
          const reconnectedSnapshot = await waitForPlayerConnected(
            owner.request,
            owner.guestToken,
            code,
            reconnectPlayer.guestId,
            true,
          );
          if (!reconnectedSnapshot) {
            issues.push(`Reconnect target ${reconnectPlayer.label} did not flip back to connected.`);
            screenshots.push(...(await captureAll(players, artifactDir, "reconnect-timeout")));
            break;
          }

          domSamples.disconnectReconnect = await reloadAndAssert(reconnectPlayer, code);
          screenshots.push(
            await capturePlayer(reconnectPlayer, artifactDir, `04-after-disconnect-reconnect`),
          );
          screenshotHighlights.disconnectReconnect.push(screenshots[screenshots.length - 1]);
          coverage.disconnectReconnect = true;
        }
      }

      const choice = chooseActionForCoverage(table, actorTable, coverage, shortAllInPlan);
      if (!choice.action) {
        issues.push(`No action chosen for seat ${actor.actorView.seatIndex + 1}.`);
        screenshots.push(...(await captureAll(players, artifactDir, "missing-action")));
        break;
      }

      if (!coverage.actingReload && timeRemainingMs(actorTable) >= 10000) {
        const actingReloadState = await reloadAndAssert(actor.browserPlayer, code, actorTable.availableActions);
        domSamples.actingReload = actingReloadState;
        screenshots.push(
          await capturePlayer(actor.browserPlayer, artifactDir, `03-acting-after-reload`),
        );
        screenshotHighlights.actingReload.push(screenshots[screenshots.length - 1]);
        coverage.actingReload = true;
      }

      domSamples[`${actor.browserPlayer.label}-before-${actionCount + 1}`] = await collectDomState(actor.browserPlayer.page);

      let clicked = false;
      let lastError = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          if (attempt === 1) {
            await actor.browserPlayer.page.reload({ waitUntil: "networkidle" });
            await waitForTournamentPage(actor.browserPlayer.page, code);
          }

          domSamples[`${actor.browserPlayer.label}-playable-${actionCount + 1}`] = await ensureReturnToPlayCleared(
            actor.browserPlayer,
            code,
          );

          const button = await waitForEnabledActionButton(actor.browserPlayer.page, choice.action, ACTION_TIMEOUT_MS);
          await button.click({ force: true });
          if (choice.action === "BET" || choice.action === "RAISE") {
            if (Number.isInteger(choice.amount) && choice.amount > 0) {
              await submitExactSizedAction(actor.browserPlayer.page, choice.action, choice.amount, ACTION_TIMEOUT_MS);
            } else {
              await submitSizedAction(actor.browserPlayer.page, choice.action, ACTION_TIMEOUT_MS);
            }
          }
          clicked = true;
          break;
        } catch (error) {
          lastError = error;
        }
      }

      if (!clicked) {
        const latestSnapshot = await getSnapshot(owner.request, owner.guestToken, code);
        if (
          latestSnapshot.stateVersion > table.stateVersion ||
          latestSnapshot.actingSeat !== table.actingSeat ||
          latestSnapshot.status !== table.status
        ) {
          continue;
        }

        issues.push(
          `Failed clicking ${choice.action} for ${actor.browserPlayer.label}/seat ${actor.actorView.seatIndex + 1}: ${lastError?.message || lastError}`,
        );
        screenshots.push(...(await captureAll(players, artifactDir, `action-failure-${actionCount + 1}`)));
        break;
      }

      if (choice.action === "RAISE") {
        coverage.raise = true;
      }
      if (choice.action === "ALL_IN" && choice.shortAllIn && choice.shortAllIn.guestId === actor.actorView.guestId) {
        coverage.shortAllInRaise = true;
        shortAllInPlan = null;
      }

      const screenshotLabel =
        choice.action === "ALL_IN" && choice.shortAllIn && choice.shortAllIn.guestId === actor.actorView.guestId
          ? `05-short-all-in-raise-action-${actionCount + 1}`
          : `after-action-${actionCount + 1}-${choice.action.toLowerCase()}`;
      const screenshotPath = await capturePlayer(actor.browserPlayer, artifactDir, screenshotLabel);
      screenshots.push(screenshotPath);
      if (choice.action === "ALL_IN" && choice.shortAllIn && choice.shortAllIn.guestId === actor.actorView.guestId) {
        screenshotHighlights.shortAllInRaise.push(screenshotPath);
      }

      actionLog.push({
        actionCount: actionCount + 1,
        handNumber: table.handNumber,
        stateVersion: table.stateVersion,
        actor: actor.browserPlayer.label,
        seat: actor.actorView.seatIndex + 1,
        action: choice.action,
        amount: choice.amount ?? null,
        shortAllIn: choice.action === "ALL_IN" ? choice.shortAllIn : null,
        availableActions: actorTable.availableActions,
        chipsToCall: actorTable.chipsToCall,
        minimumRaiseTo: actorTable.minimumRaiseTo,
        stack: actor.actorView.stack,
        contribution: actor.actorView.roundContribution,
        screenshotPath,
      });

      actionCount += 1;
      const advanced = await waitForStateAdvance(owner.request, owner.guestToken, code, table.stateVersion, STATE_ADVANCE_TIMEOUT_MS);
      if (!advanced) {
        issues.push(
          `State did not advance after ${choice.action} by ${actor.browserPlayer.label}/seat ${actor.actorView.seatIndex + 1} from version ${table.stateVersion}`,
        );
        screenshots.push(...(await captureAll(players, artifactDir, `state-stalled-${actionCount}`)));
        break;
      }

      if (hasTargetCoverage(coverage)) {
        break;
      }
    }

    const finalSnapshot = await getSnapshot(players[0].request, players[0].guestToken, code);
    const finalDomState = {};
    for (const player of players) {
      finalDomState[player.label] = await collectDomState(player.page);
    }

    const summary = {
      frontendUrl: FRONTEND_URL,
      backendUrl: BACKEND_URL,
      code,
      artifactDir,
      playerCount: PLAYER_COUNT,
      screenshotCount: screenshots.length,
      startedAt: options.startedAt || new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      actionCount,
      handResultCount,
      finalStatus: finalSnapshot.status,
      finalHandNumber: finalSnapshot.handNumber,
      finalStateVersion: finalSnapshot.stateVersion,
      coverage,
      screenshots,
      screenshotHighlights,
      actionLog,
      issues: [...new Set(issues)],
      consoleMessages,
      pageErrors,
      statusHistory,
      domSamples,
      finalDomState,
    };

    ensureDir(artifactDir);
    writeJson(path.join(artifactDir, "summary.json"), summary);
    return summary;
  } finally {
    await Promise.all(players.map((player) => player.context.close().catch(() => undefined)));
    await browser.close().catch(() => undefined);
  }
}

async function main() {
  ensureDir(RESULTS_ROOT);

  const startedAt = new Date().toISOString();
  const batchName = `railway-edge-case-${timestampId()}`;
  const batchDir = path.join(RESULTS_ROOT, batchName);
  const batchSummaryPath = path.join(batchDir, "batch-summary.json");
  const runs = [];
  const aggregateCoverage = buildCoverage();

  ensureDir(batchDir);

  for (let index = 1; index <= MAX_TOURNAMENTS; index += 1) {
    const runDir = path.join(batchDir, `run-${String(index).padStart(4, "0")}`);
    ensureDir(runDir);

    let summary;
    try {
      summary = await runTournamentAttempt({
        artifactDir: runDir,
        iterationTag: `edge${index}p`,
        startedAt: new Date().toISOString(),
      });
    } catch (error) {
      summary = {
        code: null,
        artifactDir: runDir,
        screenshotCount: 0,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        actionCount: 0,
        handResultCount: 0,
        finalStatus: "ERROR",
        finalHandNumber: null,
        finalStateVersion: null,
        coverage: buildCoverage(),
        screenshots: [],
        screenshotHighlights: {
          seatReload: [],
          actingReload: [],
          disconnectReconnect: [],
          shortAllInRaise: [],
        },
        actionLog: [],
        issues: [String(error?.message || error)],
        consoleMessages: [],
        pageErrors: [],
        statusHistory: [],
        domSamples: {},
        finalDomState: {},
      };
      writeJson(path.join(runDir, "summary.json"), summary);
    }

    runs.push({
      index,
      code: summary.code,
      actionCount: summary.actionCount,
      handResultCount: summary.handResultCount,
      finalStatus: summary.finalStatus,
      finalHandNumber: summary.finalHandNumber,
      finalStateVersion: summary.finalStateVersion,
      issueCount: summary.issues.length,
      coverage: summary.coverage,
      summaryPath: path.join(runDir, "summary.json"),
      screenshotCount: summary.screenshotCount ?? summary.screenshots?.length ?? 0,
      shortAllInRaiseScreenshots: summary.screenshotHighlights?.shortAllInRaise ?? [],
      artifactDir: runDir,
    });

    for (const [key, value] of Object.entries(summary.coverage)) {
      if (value) {
        aggregateCoverage[key] = true;
      }
    }

    const batchSummary = {
      batchDir,
      startedAt,
      finishedAt: new Date().toISOString(),
      maxTournaments: MAX_TOURNAMENTS,
      completedTournaments: runs.length,
      aggregateCoverage,
      issueCount: runs.reduce((count, run) => count + run.issueCount, 0),
      runs,
    };
    writeJson(batchSummaryPath, batchSummary);

    console.log(
      JSON.stringify(
        {
          run: index,
          code: summary.code,
          finalStatus: summary.finalStatus,
          actionCount: summary.actionCount,
          handResultCount: summary.handResultCount,
          issueCount: summary.issues.length,
          coverage: summary.coverage,
          artifactDir: runDir,
        },
        null,
        2,
      ),
    );

    if (hasTargetCoverage(aggregateCoverage) && runs.every((run) => run.issueCount === 0)) {
      break;
    }

    if (index < MAX_TOURNAMENTS) {
      await sleep(ITERATION_PAUSE_MS);
    }
  }

  const finalBatchSummary = JSON.parse(fs.readFileSync(batchSummaryPath, "utf8"));
  const ok = hasTargetCoverage(finalBatchSummary.aggregateCoverage) && finalBatchSummary.issueCount === 0;
  process.exit(ok ? 0 : 2);
}

module.exports = {
  runTournamentAttempt,
  main,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
