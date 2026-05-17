import { execFileSync } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { runTests } from '@vscode/test-electron'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const extensionDevelopmentPath = path.resolve(__dirname, '..', '..')
const extensionTestsPath = path.resolve(extensionDevelopmentPath, 'out', 'e2e', 'suite.js')

function findTld(): string {
  if (process.env.TLD_CLI_PATH) return process.env.TLD_CLI_PATH
  const command = process.platform === 'win32' ? 'where' : 'which'
  const output = execFileSync(command, ['tld'], { encoding: 'utf8' })
  return output.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? 'tld'
}

function run(command: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): void {
  execFileSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: 'inherit',
  })
}

function createFixture(): { workspaceDir: string; env: NodeJS.ProcessEnv; tldPath: string } {
  const tempRoot = process.platform === 'win32' ? os.tmpdir() : '/tmp'
  const workspaceDir = fs.mkdtempSync(path.join(tempRoot, 'tld-vsc-e2e-'))
  const tldPath = findTld()
  const configDir = path.join(workspaceDir, '.tld-config')
  const dataDir = path.join(workspaceDir, '.tld-data')
  const srcDir = path.join(workspaceDir, 'src')
  const vscodeDir = path.join(workspaceDir, '.vscode')

  fs.mkdirSync(srcDir, { recursive: true })
  fs.mkdirSync(vscodeDir, { recursive: true })
  fs.writeFileSync(
    path.join(srcDir, 'sample.ts'),
    [
      'export function alphaJump() {',
      '  return 42',
      '}',
      '',
      'export class BetaJump {',
      '  run() {',
      '    return alphaJump()',
      '  }',
      '}',
      '',
    ].join('\n'),
  )

  run('git', ['init'], { cwd: workspaceDir })
  run('git', ['config', 'user.email', 'test@example.com'], { cwd: workspaceDir })
  run('git', ['config', 'user.name', 'tlDiagram E2E'], { cwd: workspaceDir })
  run('git', ['add', '.'], { cwd: workspaceDir })
  run('git', ['commit', '-m', 'fixture'], { cwd: workspaceDir })

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    TLD_CONFIG_DIR: configDir,
    TLD_DATA_DIR: dataDir,
    TLD_APPLY_TARGET: 'local',
    TLD_EMBEDDING_PROVIDER: 'local-deterministic-test',
    TLD_WATCH_LSP_ENABLED: '0',
    TLD_WATCH_WATCHER: 'poll',
    TLD_UPDATES_AUTO: '0',
    TLDIAGRAM_E2E: '1',
  }

  run(tldPath, ['init', workspaceDir], { env })
  fs.writeFileSync(
    path.join(workspaceDir, 'elements.yaml'),
    [
      'root_component:',
      '  name: E2E Diagram Root',
      '  kind: service',
      '  has_view: true',
      '  placements:',
      '    - parent: root',
      '      position_x: 0',
      '      position_y: 0',
      'alpha_jump:',
      '  name: alphaJump',
      '  kind: function',
      '  language: typescript',
      '  file_path: src/sample.ts',
      '  symbol: alphaJump',
      '  placements:',
      '    - parent: root_component',
      '      position_x: 100',
      '      position_y: 100',
      '',
    ].join('\n'),
  )
  run(tldPath, ['apply', '--workspace', workspaceDir, '--target', 'local', '--force', '--data-dir', dataDir], { env })

  fs.writeFileSync(
    path.join(vscodeDir, 'settings.json'),
    JSON.stringify({
      'tldiagram.cliPath': tldPath,
      'tldiagram.logLevel': 'trace',
      'tldiagram.watch.port': 0,
    }, null, 2),
  )

  return { workspaceDir, env, tldPath }
}

async function main(): Promise<void> {
  const { workspaceDir, env } = createFixture()
  const tempRoot = process.platform === 'win32' ? os.tmpdir() : '/tmp'
  const userDataDir = fs.mkdtempSync(path.join(tempRoot, 'tld-vsc-user-'))
  const extensionsDir = fs.mkdtempSync(path.join(tempRoot, 'tld-vsc-ext-'))
  const userSettingsDir = path.join(userDataDir, 'User')
  fs.mkdirSync(userSettingsDir, { recursive: true })
  fs.writeFileSync(
    path.join(userSettingsDir, 'settings.json'),
    JSON.stringify({
      'workbench.startupEditor': 'none',
      'workbench.welcomePage.walkthroughs.openOnInstall': false,
      'update.mode': 'none',
      'extensions.autoUpdate': false,
      'extensions.autoCheckUpdates': false,
      'telemetry.telemetryLevel': 'off',
    }, null, 2),
  )
  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    reuseMachineInstall: false,
    extensionTestsEnv: env,
    launchArgs: [
      workspaceDir,
      '--user-data-dir',
      userDataDir,
      '--extensions-dir',
      extensionsDir,
      '--disable-workspace-trust',
      '--disable-extensions',
      '--skip-welcome',
      '--skip-release-notes',
      '--disable-gpu',
    ],
  })
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
