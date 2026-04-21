const continuous = require("./railway-six-player-continuous.cjs");

if (require.main === module) {
  continuous.main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = continuous;
