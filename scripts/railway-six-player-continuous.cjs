const fs = require("fs");
const path = require("path");
const { runTournament, timestampId } = require("./railway-six-player-smoke.cjs");
const {
  ROOT_DIR,
  ensureDir,
  sleep,
  readNumberEnv,
  assertContinuousRailwayRunAllowed,
} = require("./railway-test-common.cjs");

const RESULTS_ROOT = process.env.CONTINUOUS_RESULTS_ROOT || path.join(ROOT_DIR, "test-results", "continuous-runs");
const ITERATION_PAUSE_MS = readNumberEnv("ITERATION_PAUSE_MS", 3000);
const MAX_ITERATIONS = readNumberEnv("MAX_ITERATIONS", 1);

function writeJson(filepath, payload) {
  fs.writeFileSync(filepath, `${JSON.stringify(payload, null, 2)}\n`);
}

async function main() {
  assertContinuousRailwayRunAllowed();
  ensureDir(RESULTS_ROOT);

  const startedAt = new Date().toISOString();
  const batchName = `railway-seat-continuous-${timestampId()}`;
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

  const flush = () => {
    writeJson(path.join(batchDir, "batch-summary.json"), state);
  };

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
        iterationTag: `cr${index}p`,
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

    const headline = [
      `[${new Date().toISOString()}]`,
      `run=${index}`,
      `code=${summary.code || "n/a"}`,
      `status=${summary.finalStatus}`,
      `actions=${summary.actionCount}`,
      `handResults=${summary.handResultCount}`,
      `issues=${summary.issues.length}`,
    ].join(" ");
    console.log(headline);

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
  main,
};
