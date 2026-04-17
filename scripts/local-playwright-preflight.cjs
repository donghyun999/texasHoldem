const fs = require("fs");
const {
  createRunArtifacts,
  runBrowserPreflight,
} = require("./local-e2e-common.cjs");

async function main() {
  const artifacts = createRunArtifacts("preflight");
  const result = await runBrowserPreflight();
  fs.writeFileSync(artifacts.summaryFile, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ artifacts: artifacts.runDir, ...result }, null, 2));
  process.exit(result.launchOk ? 0 : 2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
