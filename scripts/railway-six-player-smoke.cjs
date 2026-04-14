const fs = require("fs");
const path = require("path");
const {
  DEFAULT_FRONTEND_URL,
  DEFAULT_BACKEND_URL,
  readNumberEnv,
  sleep,
  ensureDir,
  timestampId,
  defaultTournamentCode,
  resolvePlaywrightModule,
} = require("./railway-test-common.cjs");

const { chromium } = resolvePlaywrightModule();
const FRONTEND_URL = process.env.FRONTEND_URL || DEFAULT_FRONTEND_URL;
const BACKEND_URL = process.env.BACKEND_URL || DEFAULT_BACKEND_URL;
const PLAYER_COUNT = readNumberEnv("PLAYER_COUNT", 6);
const ACTION_LIMIT = readNumberEnv("ACTION_LIMIT", 120);
const START_TIMEOUT_MS = readNumberEnv("START_TIMEOUT_MS", 30000);
const ACTION_TIMEOUT_MS = readNumberEnv("ACTION_TIMEOUT_MS", 20000);
const STATE_ADVANCE_TIMEOUT_MS = readNumberEnv("STATE_ADVANCE_TIMEOUT_MS", 12000);
const HAND_RESULT_WAIT_MS = readNumberEnv("HAND_RESULT_WAIT_MS", 6500);
const POLL_INTERVAL_MS = readNumberEnv("POLL_INTERVAL_MS", 500);

async function postJson(pathname, body) {
  const response = await fetch(`${BACKEND_URL}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`POST ${pathname} failed: ${response.status} ${await response.text()}`);
  }

  return (await response.json()).data;
}

async function getSnapshot(code, guestId) {
  const response = await fetch(`${BACKEND_URL}/api/v1/tournaments/${code}?guestId=${guestId}`);
  if (!response.ok) {
    throw new Error(`GET tournament snapshot failed: ${response.status} ${await response.text()}`);
  }

  return (await response.json()).data;
}

async function readGuestSession(page) {
  return page.evaluate(() => JSON.parse(window.localStorage.getItem("texas-holdem-ui") || "{}"));
}

async function waitForEnabledButton(page, name, timeout = START_TIMEOUT_MS) {
  const button = page.getByRole("button", { name });
  await button.waitFor({ state: "visible", timeout });
  await page.waitForFunction(
    (buttonName) => {
      return [...document.querySelectorAll("button")].some((candidate) => {
        const label = (candidate.textContent || "").trim();
        return label === buttonName && !candidate.disabled;
      });
    },
    name,
    { timeout },
  );
  return button;
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

    const label = ((await button.textContent()) || "").trim().replace(/\s+/g, " ");
    if (!matcher.test(label)) {
      continue;
    }

    if (await button.isEnabled()) {
      return button;
    }
  }

  throw new Error(`No enabled action button found for ${action}`);
}

function chooseAction(actions, actionCount) {
  const available = new Set(actions);

  if (available.has("CHECK") && actionCount % 3 !== 0) {
    return "CHECK";
  }

  if (available.has("CALL") && actionCount % 4 !== 0) {
    return "CALL";
  }

  if (available.has("FOLD")) {
    return "FOLD";
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

async function waitForStateAdvance(code, guestId, previousStateVersion, timeout = STATE_ADVANCE_TIMEOUT_MS) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeout) {
    const snapshot = await getSnapshot(code, guestId);
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

async function joinTournamentViaUi(player, code, create = false) {
  await player.page.goto(FRONTEND_URL, { waitUntil: "networkidle" });
  await player.page.getByLabel("Nickname").fill(player.nickname);
  await player.page.getByLabel("Tournament Code").fill(code);
  await player.page.getByRole("button", { name: create ? "Create Tournament" : "Join Tournament" }).click();
  await player.page.waitForURL(new RegExp(`/tournaments/${code}$`), { timeout: START_TIMEOUT_MS });
  await player.page.waitForLoadState("networkidle");
  player.guestId = (await readGuestSession(player.page)).guestId;
}

async function markAllReady(players) {
  for (const player of players) {
    const readyButton = await waitForEnabledButton(player.page, "Mark Ready");
    await readyButton.click();
  }
}

async function createBrowserPlayers(browser, iterationTag, consoleMessages, pageErrors) {
  const players = [];

  for (let index = 0; index < PLAYER_COUNT; index += 1) {
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

    players.push({ label, nickname, guestId: "", context, page });
  }

  return players;
}

async function runTournament(options = {}) {
  const code = (options.code || defaultTournamentCode()).toUpperCase();
  const artifactDir = options.artifactDir || null;
  const iterationTag = (options.iterationTag || "rail_").slice(0, 14);
  const browser = await chromium.launch({ headless: options.headless !== false });
  const consoleMessages = [];
  const pageErrors = [];
  const issues = [];
  const statusHistory = [];
  const domSamples = {};
  let players = [];

  try {
    players = await createBrowserPlayers(browser, iterationTag, consoleMessages, pageErrors);

    const owner = players[0];
    await joinTournamentViaUi(owner, code, true);

    for (let index = 1; index < players.length; index += 1) {
      await joinTournamentViaUi(players[index], code, false);
    }

    await markAllReady(players);
    const startButton = await waitForEnabledButton(owner.page, "Start Tournament");
    await startButton.click();

    let ownerSnapshot = await waitForStateAdvance(code, owner.guestId, -1, START_TIMEOUT_MS);
    if (!ownerSnapshot) {
      issues.push("Tournament did not advance after clicking Start Tournament");
      await captureFailure(players, artifactDir, "start-timeout");
      ownerSnapshot = await getSnapshot(code, owner.guestId);
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
      const table = await getSnapshot(code, owner.guestId);
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
          await button.click();
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
      const advanced = await waitForStateAdvance(code, owner.guestId, table.stateVersion, STATE_ADVANCE_TIMEOUT_MS);
      if (!advanced) {
        issues.push(
          `State did not advance after ${action} by ${player.label}/seat ${actor.seatIndex + 1} from version ${table.stateVersion}`,
        );
        await captureFailure(players, artifactDir, `state-stalled-${actionCount}`);
        break;
      }
    }

    const finalSnapshot = await getSnapshot(code, owner.guestId);
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
  timestampId,
};

if (require.main === module) {
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
