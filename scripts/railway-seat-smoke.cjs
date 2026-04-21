const fs = require("fs");
const path = require("path");
const { runTournament, timestampId } = require("./railway-six-player-smoke.cjs");
const {
  ROOT_DIR,
  ensureDir,
  readSeatCountsEnv,
} = require("./railway-test-common.cjs");

const RESULTS_ROOT =
  process.env.RAILWAY_SEAT_RESULTS_ROOT || path.join(ROOT_DIR, "test-results", "railway-seat-smoke");
const PLAYER_COUNTS = readSeatCountsEnv("PLAYER_COUNT", "6", { minimum: 2, maximum: 9 });

function writeJson(filepath, payload) {
  fs.writeFileSync(filepath, `${JSON.stringify(payload, null, 2)}\n`);
}

async function main() {
  ensureDir(RESULTS_ROOT);

  const startedAt = new Date().toISOString();
  const batchName = `railway-seat-smoke-${timestampId()}`;
  const batchDir = path.join(RESULTS_ROOT, batchName);
  const latestFile = path.join(RESULTS_ROOT, "latest-batch.json");
  const scenarios = [];

  ensureDir(batchDir);
  writeJson(latestFile, { batchDir, startedAt, playerCounts: PLAYER_COUNTS });

  for (const playerCount of PLAYER_COUNTS) {
    const scenarioDir = path.join(batchDir, `${playerCount}-players`);
    const scenarioStartedAt = new Date().toISOString();
    ensureDir(scenarioDir);

    let summary;
    try {
      summary = await runTournament({
        artifactDir: scenarioDir,
        iterationTag: `rs${playerCount}p`,
        startedAt: scenarioStartedAt,
        playerCount,
        roomNamePrefix: `railway-${playerCount}`,
      });
    } catch (error) {
      summary = {
        frontendUrl: process.env.FRONTEND_URL || null,
        backendUrl: process.env.BACKEND_URL || null,
        code: null,
        roomName: null,
        playerCount,
        startedAt: scenarioStartedAt,
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
        domSamples: {},
        finalDomState: {},
        artifactDir: scenarioDir,
      };
      writeJson(path.join(scenarioDir, "summary.json"), summary);
    }

    scenarios.push(summary);

    console.log(
      JSON.stringify(
        {
          playerCount,
          code: summary.code,
          roomName: summary.roomName,
          finalStatus: summary.finalStatus,
          actionCount: summary.actionCount,
          handResultCount: summary.handResultCount,
          issueCount: summary.issues.length,
          artifactDir: scenarioDir,
        },
        null,
        2,
      ),
    );
  }

  const result = {
    batchDir,
    startedAt,
    finishedAt: new Date().toISOString(),
    requestedPlayerCounts: PLAYER_COUNTS,
    failedPlayerCounts: scenarios.filter((summary) => summary.issues.length > 0).map((summary) => summary.playerCount),
    scenarios: scenarios.map((summary) => ({
      playerCount: summary.playerCount,
      code: summary.code,
      roomName: summary.roomName,
      finalStatus: summary.finalStatus,
      finalHandNumber: summary.finalHandNumber,
      finalStateVersion: summary.finalStateVersion,
      actionCount: summary.actionCount,
      handResultCount: summary.handResultCount,
      issueCount: summary.issues.length,
      artifactDir: summary.artifactDir,
    })),
  };

  writeJson(path.join(batchDir, "batch-summary.json"), result);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.failedPlayerCounts.length > 0 ? 2 : 0);
}

module.exports = {
  main,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
