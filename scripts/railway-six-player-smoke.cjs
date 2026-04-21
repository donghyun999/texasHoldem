const fs = require("fs");
const path = require("path");
const {
  DEFAULT_FRONTEND_URL,
  DEFAULT_BACKEND_URL,
  readNumberEnv,
  readSeatCountEnv,
  sleep,
  ensureDir,
  timestampId,
  resolvePlaywrightModule,
} = require("./railway-test-common.cjs");

const { chromium } = resolvePlaywrightModule();
const FRONTEND_URL = (process.env.FRONTEND_URL || DEFAULT_FRONTEND_URL).replace(/\/$/, "");
const BACKEND_URL = (process.env.BACKEND_URL || DEFAULT_BACKEND_URL).replace(/\/$/, "");
const DEFAULT_PLAYER_COUNT = readSeatCountEnv("PLAYER_COUNT", 6, { minimum: 2, maximum: 9 });
const JOIN_TIMEOUT_MS = readNumberEnv("JOIN_TIMEOUT_MS", 30000);
const ACTION_LIMIT = readNumberEnv("ACTION_LIMIT", 120);
const START_TIMEOUT_MS = readNumberEnv("START_TIMEOUT_MS", 30000);
const ACTION_TIMEOUT_MS = readNumberEnv("ACTION_TIMEOUT_MS", 20000);
const STATE_ADVANCE_TIMEOUT_MS = readNumberEnv("STATE_ADVANCE_TIMEOUT_MS", 12000);
const HAND_RESULT_WAIT_MS = readNumberEnv("HAND_RESULT_WAIT_MS", 6500);
const POLL_INTERVAL_MS = readNumberEnv("POLL_INTERVAL_MS", 500);

function buildAuthHeaders(guestToken, extraHeaders = {}) {
  return {
    ...(guestToken ? { Authorization: `Bearer ${guestToken}` } : {}),
    ...extraHeaders,
  };
}

async function requestGuestSession(player) {
  const response = await player.context.request.post(`${BACKEND_URL}/api/v1/guests`, {
    data: { nickname: player.nickname },
  });

  if (!response.ok) {
    throw new Error(
      `POST /api/v1/guests failed for ${player.label}: ${response.status()} ${await response.text()}`,
    );
  }

  const payload = await response.json();
  const session = payload.data;
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

async function getSnapshot(code, player) {
  const response = await fetch(`${BACKEND_URL}/api/v1/tournaments/${code}`, {
    headers: buildAuthHeaders(player.guestToken),
  });
  if (!response.ok) {
    throw new Error(`GET tournament snapshot failed: ${response.status} ${await response.text()}`);
  }

  return (await response.json()).data;
}

async function readGuestSession(page) {
  return page.evaluate(() => {
    const guestSession = JSON.parse(window.localStorage.getItem("texas-holdem-guest-session") || "{}");
    const uiState = JSON.parse(window.localStorage.getItem("texas-holdem-ui") || "{}");
    return {
      guestId: guestSession.guestId || uiState.guestId || "",
      guestToken: guestSession.guestToken || "",
      nickname: uiState.nickname || "",
    };
  });
}

function normalizeText(value) {
  return (value || "").trim().replace(/\s+/g, " ");
}

function resolvePlayerCount(options = {}) {
  const playerCount = options.playerCount ?? DEFAULT_PLAYER_COUNT;
  if (!Number.isInteger(playerCount) || playerCount < 2 || playerCount > 9) {
    throw new Error(`playerCount must be an integer between 2 and 9. Received: ${playerCount}`);
  }
  return playerCount;
}

async function waitForEnabledTestId(page, testId, timeout = START_TIMEOUT_MS) {
  const locator = page.locator(`[data-testid="${testId}"]`);
  await locator.waitFor({ state: "visible", timeout });
  await page.waitForFunction(
    (buttonTestId) => {
      const button = document.querySelector(`[data-testid="${buttonTestId}"]`);
      return !!button && !button.disabled;
    },
    testId,
    { timeout },
  );
  return locator;
}

async function waitForTournamentPage(page, code, timeout = JOIN_TIMEOUT_MS) {
  await page.waitForURL(new RegExp(`/tournaments/${code}$`), { timeout, waitUntil: "commit" });
  await page.locator('[data-testid="tournament-table"]').waitFor({ state: "visible", timeout });
  await page.waitForLoadState("networkidle");
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
    if (!(await button.isVisible())) {
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
    if (!(await button.isVisible()) || !(await button.isEnabled())) {
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
    if (!(await button.isVisible())) {
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

async function waitForStateAdvance(code, player, previousStateVersion, timeout = STATE_ADVANCE_TIMEOUT_MS) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeout) {
    const snapshot = await getSnapshot(code, player);
    if (snapshot.stateVersion > previousStateVersion) {
      return snapshot;
    }
    await sleep(POLL_INTERVAL_MS);
  }

  return null;
}

async function collectDomState(page) {
  return page.evaluate(() => {
    const buttons = [...document.querySelectorAll("button")]
      .map((button) => ({
        label: (button.textContent || "").trim().replace(/\s+/g, " "),
        disabled: button.disabled,
      }))
      .filter((entry) => entry.label);

    const heroTags = [...document.querySelectorAll("span")]
      .map((node) => (node.textContent || "").trim())
      .filter((text) => text === "YOU" || text === "TURN");

    return {
      url: window.location.href,
      title: document.title,
      heroTags,
      buttons,
    };
  });
}

async function captureFailure(players, artifactDir, label) {
  if (!artifactDir) {
    return;
  }

  ensureDir(artifactDir);
  await Promise.all(
    players.map(async (player) => {
      const filepath = path.join(artifactDir, `${label}-${player.label}.png`);
      try {
        await player.page.screenshot({ path: filepath, fullPage: true });
      } catch (error) {
        fs.writeFileSync(
          path.join(artifactDir, `${label}-${player.label}.screenshot-error.txt`),
          String(error?.message || error),
        );
      }
    }),
  );
}

async function openLobby(page) {
  await page.goto(FRONTEND_URL, { waitUntil: "networkidle" });
  await page.locator('[data-testid="lobby-nickname-input"]').waitFor({ state: "visible", timeout: JOIN_TIMEOUT_MS });
}

async function fillLobbyNickname(page, nickname) {
  await page.locator('[data-testid="lobby-nickname-input"]').fill(nickname);
}

async function createTournamentViaUi(player, options = {}) {
  const roomName = (options.roomName || `${options.roomNamePrefix || "railway"}-${timestampId().slice(-6)}`).slice(0, 40);

  await openLobby(player.page);
  await fillLobbyNickname(player.page, player.nickname);
  await player.page.locator('[data-testid="create-room-name-input"]').fill(roomName);
  const createResponsePromise = player.page.waitForResponse(
    (response) =>
      response.url() === `${BACKEND_URL}/api/v1/tournaments` &&
      response.request().method() === "POST",
    { timeout: START_TIMEOUT_MS },
  );
  await player.page.locator('[data-testid="create-room-submit"]').click({ force: true });
  const createResponse = await createResponsePromise;
  if (!createResponse.ok()) {
    throw new Error(
      `Create tournament failed: ${createResponse.status()} ${await createResponse.text()}`,
    );
  }
  await player.page.waitForURL(/\/tournaments\/[^/?#]+$/, { timeout: START_TIMEOUT_MS, waitUntil: "commit" });

  const code = /\/tournaments\/([^/?#]+)/.exec(player.page.url())?.[1];
  if (!code) {
    throw new Error(`Could not resolve tournament code after create: ${player.page.url()}`);
  }

  await waitForTournamentPage(player.page, code, START_TIMEOUT_MS);
  player.guestId = (await readGuestSession(player.page)).guestId;
  return { code, roomName };
}

async function joinTournamentViaUi(player, code) {
  await openLobby(player.page);
  await fillLobbyNickname(player.page, player.nickname);
  await player.page.locator('[data-testid="lobby-view-join"]').click({ force: true });
  await player.page.locator('[data-testid="lobby-room-list"]').waitFor({ state: "visible", timeout: JOIN_TIMEOUT_MS });

  const joinButton = player.page.locator(`[data-testid="room-join-button-${code}"]`);
  const startedAt = Date.now();
  while (Date.now() - startedAt < JOIN_TIMEOUT_MS) {
    if (await joinButton.isVisible().catch(() => false)) {
      break;
    }
    await player.page.reload({ waitUntil: "networkidle" });
    await player.page.locator('[data-testid="lobby-view-join"]').click({ force: true });
    await player.page.locator('[data-testid="lobby-room-list"]').waitFor({ state: "visible", timeout: JOIN_TIMEOUT_MS });
    await sleep(600);
  }
  await joinButton.waitFor({ state: "visible", timeout: Math.max(1000, JOIN_TIMEOUT_MS / 3) });
  const joinResponsePromise = player.page.waitForResponse(
    (response) =>
      response.url() === `${BACKEND_URL}/api/v1/tournaments/${code}/join` &&
      response.request().method() === "POST",
    { timeout: JOIN_TIMEOUT_MS },
  );
  await joinButton.click({ force: true });
  const joinResponse = await joinResponsePromise;
  if (!joinResponse.ok()) {
    throw new Error(`Join tournament failed for ${player.label}: ${joinResponse.status()} ${await joinResponse.text()}`);
  }

  await waitForTournamentPage(player.page, code);
  const guestSession = await readGuestSession(player.page);
  player.guestId = guestSession.guestId;
  player.guestToken = guestSession.guestToken;
}

async function markAllReady(players) {
  for (const player of players) {
    const readyButton = await waitForEnabledTestId(player.page, "waiting-ready-toggle");
    await readyButton.click({ force: true });
  }
}

async function createBrowserPlayers(browser, iterationTag, playerCount, consoleMessages, pageErrors) {
  const players = [];

  for (let index = 0; index < playerCount; index += 1) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
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

    players.push({ label, nickname, guestId: "", guestToken: "", context, page });
  }

  return players;
}

async function runTournament(options = {}) {
  const playerCount = resolvePlayerCount(options);
  const artifactDir = options.artifactDir || null;
  const iterationTag = (options.iterationTag || "rail_").slice(0, 14);
  const browser = await chromium.launch({ headless: options.headless !== false });
  const consoleMessages = [];
  const pageErrors = [];
  const issues = [];
  const statusHistory = [];
  const domSamples = {};
  let players = [];
  let code = null;
  let roomName = null;

  try {
    players = await createBrowserPlayers(browser, iterationTag, playerCount, consoleMessages, pageErrors);
    for (const player of players) {
      await requestGuestSession(player);
    }

    const owner = players[0];
    const createdRoom = await createTournamentViaUi(owner, {
      roomName: options.roomName,
      roomNamePrefix: options.roomNamePrefix,
    });
    code = createdRoom.code;
    roomName = createdRoom.roomName;

    for (let index = 1; index < players.length; index += 1) {
      await joinTournamentViaUi(players[index], code);
    }

    await markAllReady(players);
    const startButton = await waitForEnabledTestId(owner.page, "waiting-start-game");
    await startButton.click({ force: true });

    let ownerSnapshot = await waitForStateAdvance(code, owner, -1, START_TIMEOUT_MS);
    if (!ownerSnapshot) {
      issues.push("Tournament did not advance after clicking Start Tournament");
      await captureFailure(players, artifactDir, "start-timeout");
      ownerSnapshot = await getSnapshot(code, owner);
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
      const table = await getSnapshot(code, owner);
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
        issues.push(`No browser player found for acting guest ${actor.guestId}`);
        await captureFailure(players, artifactDir, "missing-player");
        break;
      }

      const action = chooseAction(table.availableActions, actionCount);
      if (!action) {
        issues.push(`No action chosen for seat ${actor.seatIndex + 1}: ${table.availableActions.join(", ")}`);
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
          }
          const button = await waitForEnabledActionButton(player.page, action, ACTION_TIMEOUT_MS);
          await button.click({ force: true });
          if (action === "BET" || action === "RAISE") {
            await submitSizedAction(player.page, action, ACTION_TIMEOUT_MS);
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
      const advanced = await waitForStateAdvance(code, owner, table.stateVersion, STATE_ADVANCE_TIMEOUT_MS);
      if (!advanced) {
        issues.push(
          `State did not advance after ${action} by ${player.label}/seat ${actor.seatIndex + 1} from version ${table.stateVersion}`,
        );
        await captureFailure(players, artifactDir, `state-stalled-${actionCount}`);
        break;
      }
    }

    const finalSnapshot = await getSnapshot(code, owner);
    const finalDomState = {};
    for (const player of players) {
      finalDomState[player.label] = await collectDomState(player.page);
    }

    const summary = {
      frontendUrl: FRONTEND_URL,
      backendUrl: BACKEND_URL,
      code,
      roomName,
      playerCount,
      startedAt: options.startedAt || new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      actionCount,
      handResultCount,
      finalStatus: finalSnapshot.status,
      finalHandNumber: finalSnapshot.handNumber,
      finalStateVersion: finalSnapshot.stateVersion,
      players: players.map((player) => ({ label: player.label, nickname: player.nickname, guestId: player.guestId })),
      statusHistory,
      issues: [...new Set(issues)],
      consoleMessages,
      pageErrors,
      domSamples,
      finalDomState,
      artifactDir,
    };

    if (artifactDir) {
      ensureDir(artifactDir);
      fs.writeFileSync(path.join(artifactDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
    }

    return summary;
  } finally {
    await Promise.all(players.map((player) => player.context.close().catch(() => undefined)));
    await browser.close();
  }
}

module.exports = {
  runTournament,
  main,
  timestampId,
};

function main() {
  runTournament({ startedAt: new Date().toISOString() })
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      process.exit(summary.issues.length > 0 ? 2 : 0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

if (require.main === module) {
  main();
}
