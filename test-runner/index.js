const path = require('path');
const { runTests } = require(path.join(__dirname, '..', 'out', 'run-arch-test.js'));

async function run() {
  try {
    await runTests();
  } catch (err) {
    console.error('Test runner caught exception:');
    console.error(err);
    // Write out to file to be sure
    require('fs').writeFileSync('/tmp/arch-test-error.log', err ? err.stack || err.toString() : 'Unknown error');
    throw err;
  }
}

module.exports = { run };
