const path = require('path');
const { runTests } = require('@vscode/test-electron');

async function main() {
  try {
    // The folder containing the Extension Manifest package.json
    const extensionDevelopmentPath = path.resolve(__dirname, '../../vscode-extension');

    // The path to the extension test script
    // Test runner must point to an index file which resolves the actual tests
    // For test-electron, the `extensionTestsPath` specifies a script that must export a `run` function.
    const extensionTestsPath = path.resolve(__dirname, '../../tests/realworld/test-runner/index.js');

    const args = [
      '--install-extension', 'golang.go',
      '--install-extension', 'ms-python.python',
      '--install-extension', 'rust-lang.rust-analyzer',
      '--install-extension', 'redhat.java',
      '--install-extension', 'ms-vscode.cpptools',
      '--install-extension', 'Vue.volar',
      '--install-extension', 'Angular.ng-template'
    ];

    // Note: We don't specify a workspace here. We want the test script to programmatically
    // open the different workspaces and run the generation tool on each.
    // Wait, testing multiple workspaces sequentially requires reloading VS Code, or adding folders to the current workspace dynamically using `vscode.workspace.updateWorkspaceFolders`.
    // The test script inside VS Code will add folders to the workspace dynamically to trigger LSPs.

    console.log('Downloading VS Code and running tests...');

    const userDataDir = path.resolve(__dirname, '../../.vscode-test-user-data');

    // Download VS Code, unzip it and run the integration test
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        '--disable-gpu',
        '--disable-workspace-trust',
        '--user-data-dir', userDataDir,
        ...args
      ]
    });
  } catch (err) {
    console.error('Failed to run tests');
    console.error(err);
    process.exit(1);
  }
}

main();
