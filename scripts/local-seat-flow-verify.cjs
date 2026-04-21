const fs = require("fs");
const path = require("path");
const {
  ROOT_DIR,
  ensureDir,
  readNumberEnv,
  readSeatCountsEnv,
  sleep,
  timestampId,
  resolvePlaywrightModule,
} = require("./railway-test-common.cjs");
const {
  createRunArtifacts,
  waitForHttpOk,
  startBackend,
  startFrontend,
  stopProcess,
} = require("./local-e2e-common.cjs");

const FRONTEND_URL = (process.env.LOCAL_FRONTEND_URL || "http://127.0.0.1:5173").replace(/\/$/, "");
const BACKEND_URL = (process.env.LOCAL_BACKEND_URL || "http://127.0.0.1:8080").replace(/\/$/, "");
const RESULTS_ROOT = path.join(ROOT_DIR, "test-results", "local-seat-flow-verify");
const JOIN_TIMEOUT_MS = readNumberEnv("LOCAL_SEAT_VERIFY_JOIN_TIMEOUT_MS", 30000);
const START_TIMEOUT_MS = readNumberEnv("LOCAL_SEAT_VERIFY_START_TIMEOUT_MS", 30000);
const STATE_TIMEOUT_MS = readNumberEnv("LOCAL_SEAT_VERIFY_STATE_TIMEOUT_MS", 20000);
const ACTION_LIMIT = readNumberEnv("LOCAL_SEAT_VERIFY_ACTION_LIMIT", 64);
const TARGET_HAND_ADVANCE = readNumberEnv("LOCAL_SEAT_VERIFY_TARGET_HAND_ADVANCE", 2);
const ANIMATION_WAIT_TIMEOUT_MS = readNumberEnv("LOCAL_SEAT_VERIFY_ANIMATION_WAIT_TIMEOUT_MS", 4200);
const SETTLE_ANIMATION_WAIT_TIMEOUT_MS = readNumberEnv("LOCAL_SEAT_VERIFY_SETTLE_ANIMATION_WAIT_TIMEOUT_MS", 5200);

const { chromium } = resolvePlaywrightModule();
const layoutConfig = readLayoutConfig();
const PLAYER_COUNTS = readSeatCountsEnv("PLAYER_COUNTS", "2,6,9", {
  minimum: 2,
  maximum: layoutConfig.totalSeats,
});

async function isHttpOk(url) {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

function readLayoutConfig() {
  const source = fs.readFileSync(
    path.join(ROOT_DIR, "frontend", "src", "features", "table", "model", "tournament-table-layout.ts"),
    "utf8",
  );
  const totalSeats = Number(/export const TOURNAMENT_MAX_SEATS = (\d+)/.exec(source)?.[1] || 0);
  const heroTablePositionIndex = Number(/heroTablePositionIndex:\s*(\d+)/.exec(source)?.[1] || 0);
  if (!totalSeats || Number.isNaN(heroTablePositionIndex)) {
    throw new Error("Could not read table layout constants from tournament-table-layout.ts");
  }
  return { totalSeats, heroTablePositionIndex };
}

function normalizeText(value) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function buildScenarioDir(runDir, playerCount) {
  const scenarioDir = path.join(runDir, `${playerCount}-players`);
  ensureDir(scenarioDir);
  return scenarioDir;
}

async function fetchPublicSnapshot(code) {
  const response = await fetch(`${BACKEND_URL}/api/v1/tournaments/${code}`);
  if (!response.ok) {
    throw new Error(`GET /api/v1/tournaments/${code} failed: ${response.status} ${await response.text()}`);
  }
  return (await response.json()).data;
}

async function waitForPublicSnapshot(code, predicate, timeoutMs = STATE_TIMEOUT_MS) {
  const startedAt = Date.now();
  let latestSnapshot = null;

  while (Date.now() - startedAt < timeoutMs) {
    latestSnapshot = await fetchPublicSnapshot(code);
    if (predicate(latestSnapshot)) {
      return latestSnapshot;
    }
    await sleep(250);
  }

  throw new Error(
    `Timed out waiting for public snapshot predicate for ${code}. Last snapshot: ${
      latestSnapshot ? JSON.stringify({ status: latestSnapshot.status, handNumber: latestSnapshot.handNumber, stateVersion: latestSnapshot.stateVersion }) : "none"
    }`,
  );
}

async function createMobilePlayer(browser, index) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
  });
  const page = await context.newPage();
  return {
    label: `p${index + 1}`,
    nickname: `seat-${index + 1}-${Date.now().toString(36).slice(-4)}`,
    context,
    page,
    seatIndex: null,
    guestId: null,
  };
}

async function bootstrapGuestSession(player) {
  const response = await player.context.request.post(`${BACKEND_URL}/api/v1/guests`, {
    data: { nickname: player.nickname },
  });
  if (!response.ok()) {
    throw new Error(`Guest bootstrap failed for ${player.label}: ${response.status()} ${await response.text()}`);
  }

  const payload = await response.json();
  const session = payload.data;
  player.guestId = session.guestId;

  await player.page.addInitScript((guestSession) => {
    window.localStorage.setItem(
      "texas-holdem-ui",
      JSON.stringify({
        guestId: guestSession.guestId,
        nickname: guestSession.nickname,
        stackDisplayMode: "chips",
      }),
    );
  }, session);
}

async function bootstrapCreateOwner(player, roomName) {
  await player.page.goto(FRONTEND_URL, { waitUntil: "networkidle" });
  await player.page.locator('[data-testid="lobby-nickname-input"]').fill(player.nickname);
  await player.page.locator('[data-testid="create-room-name-input"]').fill(roomName);
  await player.page.locator('[data-testid="create-room-submit"]').click({ force: true });
  await player.page.waitForURL(/\/tournaments\/[^/?#]+$/, { timeout: JOIN_TIMEOUT_MS });
  await player.page.locator('[data-testid="tournament-table"]').waitFor({ state: "visible", timeout: JOIN_TIMEOUT_MS });
}

async function bootstrapJoinPlayer(player, code) {
  await player.page.goto(FRONTEND_URL, { waitUntil: "networkidle" });
  await player.page.locator('[data-testid="lobby-nickname-input"]').fill(player.nickname);
  await player.page.locator('[data-testid="lobby-view-join"]').click();
  const joinButton = player.page.locator(`[data-testid="room-join-button-${code}"]`);
  await joinButton.waitFor({ state: "visible", timeout: JOIN_TIMEOUT_MS });
  await joinButton.click({ force: true });
  await player.page.waitForURL(new RegExp(`/tournaments/${code}$`), { timeout: JOIN_TIMEOUT_MS });
  await player.page.locator('[data-testid="tournament-table"]').waitFor({ state: "visible", timeout: JOIN_TIMEOUT_MS });
}

async function ensureHeroMetadata(player) {
  const heroAnchor = player.page.locator('[data-testid="hero-seat-anchor"]');
  await heroAnchor.waitFor({ state: "visible", timeout: JOIN_TIMEOUT_MS });
  const attributes = await heroAnchor.evaluate((element) => ({
    seatIndex: Number(element.getAttribute("data-seat-index")),
    tablePositionIndex: Number(element.getAttribute("data-table-position-index")),
    guestId: element.getAttribute("data-guest-id"),
  }));
  player.seatIndex = attributes.seatIndex;
  player.guestId = attributes.guestId;
  return attributes;
}

async function countVisible(locator) {
  const count = await locator.count();
  let visible = 0;
  for (let index = 0; index < count; index += 1) {
    if (await locator.nth(index).isVisible()) {
      visible += 1;
    }
  }
  return visible;
}

async function collectTableState(page) {
  return page.locator('[data-testid="tournament-table"]').evaluate((table) => {
    const tableRect = table.getBoundingClientRect();
    const hero = table.querySelector('[data-testid="hero-seat-anchor"]');
    const actionBar = table.querySelector('[data-testid="table-action-bar"]');
    const seatElements = [...table.querySelectorAll("[data-seat-index][data-table-position-index]")];
    const seatRects = seatElements.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        seatIndex: Number(element.getAttribute("data-seat-index")),
        tablePositionIndex: Number(element.getAttribute("data-table-position-index")),
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        label: element.getAttribute("data-testid") || `seat-${element.getAttribute("data-seat-index")}`,
      };
    });

    const overlaps = [];
    for (let leftIndex = 0; leftIndex < seatRects.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < seatRects.length; rightIndex += 1) {
        const left = seatRects[leftIndex];
        const right = seatRects[rightIndex];
        const overlapWidth = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left));
        const overlapHeight = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
        const overlapArea = overlapWidth * overlapHeight;
        if (overlapArea >= 120) {
          overlaps.push({
            left: left.label,
            right: right.label,
            overlapArea,
          });
        }
      }
    }

    const outOfBounds = seatRects
      .filter((rect) => rect.left < tableRect.left - 2 || rect.right > tableRect.right + 2 || rect.top < tableRect.top - 2 || rect.bottom > tableRect.bottom + 2)
      .map((rect) => rect.label);

    return {
      heroSeatIndex: hero ? Number(hero.getAttribute("data-seat-index")) : null,
      heroTablePositionIndex: hero ? Number(hero.getAttribute("data-table-position-index")) : null,
      heroText: hero ? (hero.textContent || "").replace(/\s+/g, " ").trim() : "",
      potAnimationSequence: Number(table.getAttribute("data-pot-animation-sequence") || 0),
      emptySeatCount: table.querySelectorAll('[data-testid^="empty-seat-"]').length,
      dealerButtonCount: table.querySelectorAll('[aria-label="Dealer button"]').length,
      sbBadgeCount: [...table.querySelectorAll("span")].filter((element) => (element.textContent || "").trim() === "SB").length,
      bbBadgeCount: [...table.querySelectorAll("span")].filter((element) => (element.textContent || "").trim() === "BB").length,
      meBadgeCount: [...table.querySelectorAll("span")].filter((element) => (element.textContent || "").trim() === "ME").length,
      betMarkerCount: table.querySelectorAll('[data-testid^="bet-marker-"]').length,
      actionTimerCount: table.querySelectorAll('[data-testid^="seat-action-timer-"]').length,
      flyingBetChipCount: table.querySelectorAll('[data-testid="flying-bet-chip"]').length,
      flyingPotChipCount: table.querySelectorAll('[data-testid="flying-pot-chip"]').length,
      heroContainsHoldBack: hero ? hero.querySelectorAll(":scope *").length > 0 && (hero.textContent || "").includes("HOLD") : false,
      actionBarGap: hero && actionBar ? actionBar.getBoundingClientRect().top - hero.getBoundingClientRect().bottom : null,
      seatOverlapPairs: overlaps,
      outOfBoundsSeats: outOfBounds,
    };
  });
}

async function clickReady(page) {
  const readyButton = page.locator('[data-testid="waiting-ready-toggle"]');
  await readyButton.waitFor({ state: "visible", timeout: JOIN_TIMEOUT_MS });
  await readyButton.click({ force: true });
}

async function waitForStartButton(page) {
  const button = page.locator('[data-testid="waiting-start-game"]');
  await button.waitFor({ state: "visible", timeout: START_TIMEOUT_MS });
  await page.waitForFunction(
    () => {
      const candidate = document.querySelector('[data-testid="waiting-start-game"]');
      return !!candidate && !(candidate).disabled;
    },
    { timeout: START_TIMEOUT_MS },
  );
  return button;
}

async function findEnabledAction(page, actionCount) {
  const actions =
    actionCount % 3 === 2
      ? [
          { label: "Fold", pattern: /^Fold$/i },
          { label: "Check", pattern: /^Check$/i },
          { label: "Call", pattern: /^Call\b/i },
          { label: "Bet", pattern: /^Bet$/i },
          { label: "Raise", pattern: /^Raise$/i },
          { label: "All in", pattern: /^All in$/i },
        ]
      : [
          { label: "Check", pattern: /^Check$/i },
          { label: "Call", pattern: /^Call\b/i },
          { label: "Fold", pattern: /^Fold$/i },
          { label: "Bet", pattern: /^Bet$/i },
          { label: "Raise", pattern: /^Raise$/i },
          { label: "All in", pattern: /^All in$/i },
        ];

  for (const action of actions) {
    const buttons = page.locator("button");
    const count = await buttons.count();
    for (let index = 0; index < count; index += 1) {
      const button = buttons.nth(index);
      if (!(await button.isVisible()) || !(await button.isEnabled())) {
        continue;
      }
      const text = normalizeText(await button.textContent());
      if (action.pattern.test(text)) {
        return {
          label: action.label,
          button,
        };
      }
    }
  }

  return null;
}

async function waitForAnyAnimation(pages, timeoutMs = ANIMATION_WAIT_TIMEOUT_MS) {
  const candidates = Array.isArray(pages) ? pages : [pages];
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    for (const page of candidates) {
      const state = await collectTableState(page);
      if (state.flyingBetChipCount > 0 || state.flyingPotChipCount > 0) {
        return state;
      }
    }
    await sleep(120);
  }
  return null;
}

async function runScenario(browser, runDir, playerCount) {
  if (playerCount > layoutConfig.totalSeats) {
    throw new Error(`Player count ${playerCount} exceeds table max seats ${layoutConfig.totalSeats}`);
  }

  const scenarioDir = buildScenarioDir(runDir, playerCount);
  const players = [];
  const roomName = `local-${playerCount}-${timestampId().slice(-8)}`;
  let mobileContext = null;
  let mobilePage = null;

  try {
    for (let index = 0; index < playerCount; index += 1) {
      players.push(await createMobilePlayer(browser, index));
    }

    for (const player of players) {
      await bootstrapGuestSession(player);
    }

    await bootstrapCreateOwner(players[0], roomName);
    const code = /\/tournaments\/([^/?#]+)/.exec(players[0].page.url())?.[1];
    if (!code) {
      throw new Error("Could not extract tournament code after owner creation");
    }

    for (let index = 1; index < players.length; index += 1) {
      await bootstrapJoinPlayer(players[index], code);
    }

    for (const player of players) {
      const hero = await ensureHeroMetadata(player);
      if (hero.tablePositionIndex !== layoutConfig.heroTablePositionIndex) {
        throw new Error(
          `${player.label} hero table position was ${hero.tablePositionIndex}, expected ${layoutConfig.heroTablePositionIndex}`,
        );
      }
    }

    const ownerStorageState = await players[0].context.storageState();
    mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      storageState: ownerStorageState,
    });
    mobilePage = await mobileContext.newPage();
    await mobilePage.addInitScript((guestId) => {
      const raw = window.localStorage.getItem("texas-holdem-ui");
      const parsed = raw ? JSON.parse(raw) : {};
      window.localStorage.setItem(
        "texas-holdem-ui",
        JSON.stringify({
          ...parsed,
          guestId,
          stackDisplayMode: parsed.stackDisplayMode === "bb" ? "bb" : "chips",
        }),
      );
    }, players[0].guestId);
    await mobilePage.goto(`${FRONTEND_URL}/tournaments/${code}`, { waitUntil: "networkidle" });
    await mobilePage.locator('[data-testid="tournament-table"]').waitFor({ state: "visible", timeout: JOIN_TIMEOUT_MS });

    const waitingMobilePath = path.join(scenarioDir, "waiting-mobile-owner.png");
    await mobilePage.screenshot({ path: waitingMobilePath, fullPage: true });

    const waitingState = await collectTableState(mobilePage);
    const expectedEmptySeats = layoutConfig.totalSeats - playerCount;

    for (const player of players) {
      await clickReady(player.page);
    }

    const startButton = await waitForStartButton(players[0].page);
    await startButton.click({ force: true });

    const firstInHandSnapshot = await waitForPublicSnapshot(code, (snapshot) => snapshot.status === "IN_HAND", START_TIMEOUT_MS);
    const startHandNumber = firstInHandSnapshot.handNumber;

    const inHandMobileBeforeActionPath = path.join(scenarioDir, "in-hand-mobile-owner-before-action.png");
    const inHandDesktopBeforeActionPath = path.join(scenarioDir, "in-hand-desktop-owner-before-action.png");
    await mobilePage.screenshot({ path: inHandMobileBeforeActionPath, fullPage: true });
    await players[0].page.screenshot({ path: inHandDesktopBeforeActionPath, fullPage: true });

    const inHandMobileState = await collectTableState(mobilePage);
    const inHandDesktopState = await collectTableState(players[0].page);
    const observedPages = [mobilePage, players[0].page];
    let sawFlyingBetChip = inHandMobileState.flyingBetChipCount > 0 || inHandDesktopState.flyingBetChipCount > 0;
    let sawFlyingPotChip =
      inHandMobileState.flyingPotChipCount > 0 ||
      inHandDesktopState.flyingPotChipCount > 0 ||
      inHandMobileState.potAnimationSequence > 0 ||
      inHandDesktopState.potAnimationSequence > 0;
    let sawOpponentActionTimer = inHandMobileState.actionTimerCount > 0 || inHandDesktopState.actionTimerCount > 0;
    const applyObservedState = (state) => {
      if (!state) {
        return;
      }
      sawFlyingBetChip ||= state.flyingBetChipCount > 0;
      sawFlyingPotChip ||= state.flyingPotChipCount > 0 || state.potAnimationSequence > 0;
      sawOpponentActionTimer ||= state.actionTimerCount > 0;
    };
    const sampleCurrentTableStates = async () => {
      for (const page of observedPages) {
        applyObservedState(await collectTableState(page));
      }
    };

    let actionCount = 0;
    let latestSnapshot = firstInHandSnapshot;

    while (actionCount < ACTION_LIMIT) {
      latestSnapshot = await fetchPublicSnapshot(code);
      await sampleCurrentTableStates();

      if (latestSnapshot.status === "FINISHED") {
        applyObservedState(await waitForAnyAnimation(observedPages, SETTLE_ANIMATION_WAIT_TIMEOUT_MS).catch(() => null));
        break;
      }

      if (latestSnapshot.handNumber >= startHandNumber + TARGET_HAND_ADVANCE && latestSnapshot.status === "IN_HAND") {
        applyObservedState(await waitForAnyAnimation(observedPages, SETTLE_ANIMATION_WAIT_TIMEOUT_MS).catch(() => null));
        break;
      }

      if (latestSnapshot.status !== "IN_HAND" || latestSnapshot.actingSeat == null) {
        applyObservedState(await waitForAnyAnimation(observedPages, 900).catch(() => null));
        await sampleCurrentTableStates();
        await sleep(180);
        continue;
      }

      const actingPlayer = players.find((player) => player.seatIndex === latestSnapshot.actingSeat);
      if (!actingPlayer) {
        throw new Error(`Could not find browser player for acting seat ${latestSnapshot.actingSeat}`);
      }

      const chosenAction = await findEnabledAction(actingPlayer.page, actionCount);
      if (!chosenAction) {
        throw new Error(`No enabled action button found for ${actingPlayer.label} at seat ${actingPlayer.seatIndex}`);
      }

      const previousStateVersion = latestSnapshot.stateVersion;
      await chosenAction.button.click({ force: true });
      actionCount += 1;

      applyObservedState(await waitForAnyAnimation(observedPages).catch(() => null));

      latestSnapshot = await waitForPublicSnapshot(code, (snapshot) => snapshot.stateVersion > previousStateVersion, STATE_TIMEOUT_MS);
      applyObservedState(await waitForAnyAnimation(observedPages, 2600).catch(() => null));
      await sampleCurrentTableStates();
    }

    applyObservedState(await waitForAnyAnimation(observedPages, SETTLE_ANIMATION_WAIT_TIMEOUT_MS).catch(() => null));
    const finalSnapshot = await fetchPublicSnapshot(code);
    const finalMobileState = await collectTableState(mobilePage);
    const finalDesktopState = await collectTableState(players[0].page);
    applyObservedState(finalMobileState);
    applyObservedState(finalDesktopState);

    const afterActionMobilePath = path.join(scenarioDir, "after-actions-mobile-owner.png");
    const afterActionDesktopPath = path.join(scenarioDir, "after-actions-desktop-owner.png");
    await mobilePage.screenshot({ path: afterActionMobilePath, fullPage: true });
    await players[0].page.screenshot({ path: afterActionDesktopPath, fullPage: true });

    const validations = {
      heroAnchorsBottom: players.every((player) => player.seatIndex !== null),
      waitingEmptySeatCountMatches: waitingState.emptySeatCount === expectedEmptySeats,
      inHandEmptySeatCountMatches: finalMobileState.emptySeatCount === expectedEmptySeats,
      dealerButtonVisible: finalMobileState.dealerButtonCount === 1,
      smallBlindBadgeVisible: finalMobileState.sbBadgeCount >= 1,
      bigBlindBadgeVisible: finalMobileState.bbBadgeCount >= 1,
      heroBadgeVisible: finalMobileState.meBadgeCount >= 1,
      heroCardsVisible: !finalMobileState.heroContainsHoldBack,
      betMarkersVisible: inHandMobileState.betMarkerCount >= Math.min(2, playerCount),
      opponentActionTimerVisible: sawOpponentActionTimer,
      mobileSeatOverlapFree: finalMobileState.seatOverlapPairs.length === 0,
      mobileSeatsInsideTable: finalMobileState.outOfBoundsSeats.length === 0,
      mobileActionBarSeparated: finalMobileState.actionBarGap == null || finalMobileState.actionBarGap >= 8,
      desktopSeatOverlapFree: finalDesktopState.seatOverlapPairs.length === 0,
      handsAdvanced: finalSnapshot.handNumber >= startHandNumber + TARGET_HAND_ADVANCE || finalSnapshot.status === "FINISHED",
      flyingBetChipObserved: sawFlyingBetChip,
      flyingPotChipObserved: sawFlyingPotChip,
    };

    const summary = {
      playerCount,
      code,
      frontendUrl: FRONTEND_URL,
      backendUrl: BACKEND_URL,
      layout: layoutConfig,
      expectedEmptySeats,
      actionCount,
      startHandNumber,
      finalStatus: finalSnapshot.status,
      finalHandNumber: finalSnapshot.handNumber,
      finalStateVersion: finalSnapshot.stateVersion,
      seatAssignments: players.map((player) => ({
        label: player.label,
        nickname: player.nickname,
        seatIndex: player.seatIndex,
        guestId: player.guestId,
      })),
      waitingState,
      inHandMobileState,
      inHandDesktopState,
      finalMobileState,
      finalDesktopState,
      validations,
      screenshots: {
        waitingMobilePath,
        inHandMobileBeforeActionPath,
        inHandDesktopBeforeActionPath,
        afterActionMobilePath,
        afterActionDesktopPath,
      },
    };

    fs.writeFileSync(path.join(scenarioDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
    return summary;
  } finally {
    if (mobileContext) {
      await mobileContext.close().catch(() => undefined);
    }
    await Promise.all(players.map((player) => player.context.close().catch(() => undefined)));
  }
}

async function main() {
  ensureDir(RESULTS_ROOT);
  const runDir = path.join(RESULTS_ROOT, timestampId());
  ensureDir(runDir);
  const launchArtifacts = createRunArtifacts("local-seat-flow-verify-launch");
  const launchedFrontend = !(await isHttpOk(`${FRONTEND_URL}/`));
  const launchedBackend = !(await isHttpOk(`${BACKEND_URL}/api/v1/status`));
  let backendProcess = null;
  let frontendProcess = null;
  process.env.APP_MAX_ACTIVE_PLAYERS = process.env.APP_MAX_ACTIVE_PLAYERS || "500";
  process.env.LOCAL_BACKEND_URL = BACKEND_URL;
  process.env.LOCAL_FRONTEND_URL = FRONTEND_URL;
  process.env.VITE_API_BASE_URL = BACKEND_URL;
  process.env.VITE_TOURNAMENT_WS_URL = `${BACKEND_URL.replace("http://", "ws://").replace("https://", "wss://")}/ws`;

  if (launchedBackend) {
    backendProcess = startBackend(launchArtifacts.backendLog);
    await waitForHttpOk(`${BACKEND_URL}/api/v1/status`, 180000, {
      child: backendProcess,
      label: "Backend",
      logFile: launchArtifacts.backendLog,
    });
  }

  if (launchedFrontend) {
    frontendProcess = startFrontend(launchArtifacts.frontendLog);
    await waitForHttpOk(`${FRONTEND_URL}/`, 180000, {
      child: frontendProcess,
      label: "Frontend",
      logFile: launchArtifacts.frontendLog,
    });
  }

  const browser = await chromium.launch({ headless: process.env.LOCAL_SEAT_VERIFY_HEADED === "true" ? false : true });
  const summaries = [];

  try {
    for (const playerCount of PLAYER_COUNTS) {
      summaries.push(await runScenario(browser, runDir, playerCount));
    }
  } finally {
    await browser.close();
    await stopProcess(frontendProcess, "frontend");
    await stopProcess(backendProcess, "backend");
  }

  const result = {
    runDir,
    layout: layoutConfig,
    launchArtifacts: launchArtifacts.runDir,
    launchedFrontend,
    launchedBackend,
    scenarios: summaries,
    failedScenarios: summaries
      .filter((summary) => Object.values(summary.validations).some((value) => value !== true))
      .map((summary) => summary.playerCount),
  };

  fs.writeFileSync(path.join(runDir, "summary.json"), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.failedScenarios.length > 0 ? 2 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
