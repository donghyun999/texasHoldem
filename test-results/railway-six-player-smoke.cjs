const { chromium } = require("./playwright-work/node_modules/playwright");

const FRONTEND_URL = "https://texasholdemfrontend-production.up.railway.app";
const BACKEND_URL = "https://texasholdembackend-production.up.railway.app";
const PLAYER_COUNT = 6;
const ACTION_LIMIT = 36;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function postJson(path, body) {
  const response = await fetch(`${BACKEND_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`POST ${path} failed: ${response.status} ${await response.text()}`);
  }
  return (await response.json()).data;
}

async function getSnapshot(code, guestId) {
  const response = await fetch(`${BACKEND_URL}/api/v1/tournaments/${code}?guestId=${guestId}`);
  if (!response.ok) {
    throw new Error(`GET snapshot failed: ${response.status} ${await response.text()}`);
  }
  return (await response.json()).data;
}

async function activeTournament(guestId) {
  const response = await fetch(`${BACKEND_URL}/api/v1/guests/${guestId}/active-tournament`);
  if (!response.ok) {
    throw new Error(`GET active tournament failed: ${response.status} ${await response.text()}`);
  }
  return (await response.json()).data;
}

async function waitForEnabledButton(page, name, timeout = 30000) {
  const button = page.getByRole("button", { name });
  await button.waitFor({ state: "visible", timeout });
  await page.waitForFunction(
    (buttonName) => {
      const buttons = [...document.querySelectorAll("button")];
      return buttons.some((candidate) => candidate.textContent?.trim() === buttonName && !candidate.disabled);
    },
    name,
    { timeout },
  );
  return button;
}

async function readGuestSession(page) {
  return page.evaluate(() => JSON.parse(window.localStorage.getItem("texas-holdem-ui") || "{}"));
}

async function currentSeatDomState(page) {
  return page.evaluate(() => {
    const candidates = [...document.querySelectorAll("div")].filter((element) => {
      const text = element.innerText || "";
      return text.includes("YOU") && /Seat\s+\d/.test(text);
    });
    const seat = candidates
      .sort((left, right) => (left.innerText || "").length - (right.innerText || "").length)
      .at(0);
    if (!seat) {
      return { found: false, text: "", holdCount: 0, displayedSeat: null };
    }
    const text = seat.innerText || "";
    const displayedSeat = Number((text.match(/Seat\s+(\d+)/) || [])[1] || "0") || null;
    return {
      found: true,
      text,
      holdCount: (text.match(/HOLD/g) || []).length,
      displayedSeat,
    };
  });
}

async function collectVisibleState(players, code) {
  const rows = [];
  for (const player of players) {
    const snapshot = await getSnapshot(code, player.guestId);
    const self = snapshot.players.find((candidate) => candidate.guestId === player.guestId);
    const domSeat = await currentSeatDomState(player.page);
    rows.push({
      label: player.label,
      guestId: player.guestId,
      seatIndex: self?.seatIndex ?? null,
      displayedSeat: self ? self.seatIndex + 1 : null,
      apiSelfHoleCards: snapshot.selfHoleCards,
      apiSelfHoleCount: snapshot.selfHoleCards.length,
      domSelfSeatFound: domSeat.found,
      domSelfHoldCount: domSeat.holdCount,
      domDisplayedSeat: domSeat.displayedSeat,
      status: self?.status ?? null,
      connected: self?.connected ?? null,
      stack: self?.stack ?? null,
      tournamentStatus: snapshot.status,
      actingSeat: snapshot.actingSeat,
    });
  }
  return rows;
}

function chooseAction(actions) {
  for (const action of ["FOLD", "CHECK", "CALL", "ALL_IN"]) {
    if (actions.includes(action)) {
      return action;
    }
  }
  return null;
}

function actionButtonName(action) {
  return action.replaceAll("_", " ");
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const consoleMessages = [];
  const pageErrors = [];
  const issues = [];
  const players = [];
  const code = `R${Date.now().toString(36).slice(-6).toUpperCase()}`;

  try {
    for (let index = 0; index < PLAYER_COUNT; index += 1) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      });
      const page = await context.newPage();
      const label = `p${index + 1}`;
      page.on("console", (message) => {
        if (["error", "warning"].includes(message.type())) {
          consoleMessages.push({ label, type: message.type(), text: message.text() });
        }
      });
      page.on("pageerror", (error) => pageErrors.push({ label, message: error.message }));
      players.push({ label, nickname: `rail_${index + 1}`, context, page, guestId: "" });
    }

    const owner = players[0];
    await owner.page.goto(FRONTEND_URL, { waitUntil: "networkidle" });
    await owner.page.getByLabel("Nickname").fill(owner.nickname);
    await owner.page.getByLabel("Tournament Code").fill(code);
    await owner.page.getByRole("button", { name: "Create Tournament" }).click();
    await owner.page.waitForURL(new RegExp(`/tournaments/${code}$`), { timeout: 30000 });
    owner.guestId = (await readGuestSession(owner.page)).guestId;

    for (let index = 1; index < PLAYER_COUNT; index += 1) {
      const player = players[index];
      await player.page.goto(FRONTEND_URL, { waitUntil: "networkidle" });
      await player.page.getByLabel("Nickname").fill(player.nickname);
      await player.page.getByLabel("Tournament Code").fill(code);
      await player.page.getByRole("button", { name: "Join Tournament" }).click();
      await player.page.waitForURL(new RegExp(`/tournaments/${code}$`), { timeout: 30000 });
      player.guestId = (await readGuestSession(player.page)).guestId;
    }

    for (const player of players) {
      const readyButton = await waitForEnabledButton(player.page, "Mark Ready");
      await readyButton.click();
    }

    const startButton = await waitForEnabledButton(owner.page, "Start Tournament");
    await startButton.click();

    await sleep(2500);
    let rows = await collectVisibleState(players, code);
    for (const row of rows) {
      if (row.apiSelfHoleCount !== 2) {
        issues.push(`API selfHoleCards count mismatch after start for ${row.label}/seat ${row.displayedSeat}: ${row.apiSelfHoleCards.join(",")}`);
      }
      if (!row.domSelfSeatFound) {
        issues.push(`DOM self seat missing after start for ${row.label}/seat ${row.displayedSeat}`);
      }
      if (row.domSelfHoldCount > 0) {
        issues.push(`DOM self cards hidden after start for ${row.label}/seat ${row.displayedSeat}: HOLD count ${row.domSelfHoldCount}`);
      }
      if (row.domDisplayedSeat !== row.displayedSeat) {
        issues.push(`DOM self seat number mismatch after start for ${row.label}: API ${row.displayedSeat}, DOM ${row.domDisplayedSeat}`);
      }
    }

    let actionCount = 0;
    let handResultCount = 0;
    while (actionCount < ACTION_LIMIT) {
      const table = await getSnapshot(code, owner.guestId);
      if (table.status === "FINISHED") {
        break;
      }
      if (table.status === "HAND_RESULT") {
        handResultCount += 1;
        await sleep(6500);
        continue;
      }
      if (table.status !== "IN_HAND") {
        await sleep(1000);
        continue;
      }
      const actor = table.players.find((candidate) => candidate.seatIndex === table.actingSeat);
      if (!actor) {
        issues.push(`No actor found for actingSeat ${table.actingSeat}`);
        break;
      }
      const player = players.find((candidate) => candidate.guestId === actor.guestId);
      if (!player) {
        issues.push(`No browser context found for actor ${actor.guestId}`);
        break;
      }
      const action = chooseAction(table.availableActions);
      if (!action) {
        issues.push(`No simple UI action available for ${player.label}: ${table.availableActions.join(",")}`);
        break;
      }

      const buttonName = actionButtonName(action);
      try {
        const button = await waitForEnabledButton(player.page, buttonName, 15000);
        await button.click();
        actionCount += 1;
      } catch (error) {
        issues.push(`Failed clicking ${buttonName} for ${player.label}/seat ${actor.seatIndex + 1}: ${error.message}`);
        break;
      }

      await sleep(1000);
      rows = await collectVisibleState(players, code);
      for (const row of rows) {
        if (row.status === "ACTIVE" && row.apiSelfHoleCount !== 2) {
          issues.push(`API selfHoleCards count mismatch after action ${actionCount} for ${row.label}/seat ${row.displayedSeat}: ${row.apiSelfHoleCards.join(",")}`);
        }
        if (!row.domSelfSeatFound) {
          issues.push(`DOM self seat missing after action ${actionCount} for ${row.label}/seat ${row.displayedSeat}`);
        }
        if (row.status === "ACTIVE" && row.domSelfHoldCount > 0) {
          issues.push(`DOM self cards hidden after action ${actionCount} for ${row.label}/seat ${row.displayedSeat}: HOLD count ${row.domSelfHoldCount}`);
        }
      }
    }

    const finalRows = await collectVisibleState(players, code);
    const activeSessions = [];
    for (const player of players) {
      activeSessions.push({ label: player.label, active: await activeTournament(player.guestId) });
    }

    const summary = {
      frontendUrl: FRONTEND_URL,
      backendUrl: BACKEND_URL,
      code,
      players: players.map((player) => ({ label: player.label, nickname: player.nickname, guestId: player.guestId })),
      actionCount,
      handResultCount,
      finalRows,
      activeSessions,
      issues: [...new Set(issues)],
      consoleMessages,
      pageErrors,
    };
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
