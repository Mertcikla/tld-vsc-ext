import * as vscode from 'vscode'
import { logger } from '../logger'
import type { AuthManager } from '../auth/AuthManager'
import { type DataSource } from '../datasource/DataSource'
import { CloudDataSource } from '../datasource/CloudDataSource'
import { LocalDataSource } from '../datasource/LocalDataSource'
import { CLIManager } from '../cli/CLIManager'

type Mode = 'local' | 'cloud' | 'auto'

export class ModeManager {
  private _onDataSourceChange = new vscode.EventEmitter<DataSource>()
  readonly onDataSourceChange = this._onDataSourceChange.event

  private dataSource: DataSource | undefined
  private cloudDs: CloudDataSource | undefined
  private localDs: LocalDataSource | undefined
  private readonly cliManager = new CLIManager()

  constructor(
    private readonly authManager: AuthManager,
  ) {}

  getDataSource(): DataSource | undefined {
    return this.dataSource
  }

  async initialize(): Promise<DataSource | undefined> {
    const mode = this.getConfiguredMode()
    const cloudEnabled = this.isCloudEnabled()
    logger.info('ModeManager', 'Initializing', { mode, cloudEnabled })

    if (!cloudEnabled) {
      return this.switchToLocal()
    }

    if (mode === 'auto') {
      return this.autoSelect()
    }
    if (mode === 'local') {
      return this.switchToLocal()
    }
    return this.switchToCloud()
  }

  private getConfiguredMode(): Mode {
    return vscode.workspace.getConfiguration('tldiagram').get<Mode>('mode', 'auto')
  }

  isCloudEnabled(): boolean {
    return vscode.workspace.getConfiguration('tldiagram').get<boolean>('cloud.enabled', false)
  }

  private getServerUrl(): string {
    return vscode.workspace.getConfiguration('tldiagram').get<string>('serverUrl', 'https://tldiagram.com').replace(/\/$/, '')
  }

  private getWatchHost(): string {
    return vscode.workspace.getConfiguration('tldiagram').get<string>('watch.host', '127.0.0.1') || '127.0.0.1'
  }

  private getWatchPort(): number {
    return vscode.workspace.getConfiguration('tldiagram').get<number>('watch.port', 0)
  }

  private updateContext(mode: 'local' | 'cloud' | undefined, hybrid: boolean): void {
    void vscode.commands.executeCommand('setContext', 'tldiagram.mode', mode)
    void vscode.commands.executeCommand('setContext', 'tldiagram.cloudEnabled', this.isCloudEnabled())
    void vscode.commands.executeCommand('setContext', 'tldiagram.hybrid', this.isCloudEnabled() && hybrid)
  }

  refreshFeatureContexts(): void {
    this.updateContext(this.dataSource?.mode, !!this.cloudDs && !!this.localDs)
  }

  async switchToLocal(): Promise<DataSource> {
    logger.info('ModeManager', 'Switching to local mode')
    if (!this.isCloudEnabled()) {
      await this.disconnectCloud()
    }

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (!workspaceRoot) {
      throw new Error('Open a workspace folder before using tlDiagram local mode.')
    }

    const tldPath = await this.cliManager.detect()
    if (!tldPath) {
      vscode.window.showErrorMessage('tlDiagram local mode requires the tld CLI. Set "tlDiagram › Cli Path" or install tld on PATH.')
      throw new Error('tld CLI not found. Set "tlDiagram › Cli Path" or install tld on PATH.')
    }

    const ds = new LocalDataSource(tldPath, workspaceRoot, this.getWatchHost(), this.getWatchPort())
    try {
      await ds.connect()
    } catch (e) {
      logger.error('ModeManager', 'Failed to start local mode', { error: String(e) })
      vscode.window.showErrorMessage(
        `tlDiagram local mode failed: ${e instanceof Error ? e.message : String(e)}`
      )
      return this.fallbackToCloud()
    }

    this.localDs = ds
    this.dataSource = ds
    this.updateContext('local', !!this.cloudDs)

    void vscode.commands.executeCommand('setContext', 'tldiagram.authenticated', true)

    vscode.window.showInformationMessage('tlDiagram: Connected to local workspace')
    this._onDataSourceChange.fire(ds)
    return ds
  }

  async switchToCloud(): Promise<DataSource> {
    if (!this.isCloudEnabled()) {
      throw new Error('Cloud features are disabled. Enable "tlDiagram › Cloud: Enabled" to use cloud mode.')
    }
    logger.info('ModeManager', 'Switching to cloud mode')
    await this.disconnectLocal()

    const serverUrl = this.getServerUrl()
    const apiKey = await this.authManager.getKey()
    if (!apiKey) {
      logger.info('ModeManager', 'No stored API key — showing login prompt')
      await this.promptLogin(serverUrl)
      return Promise.reject(new Error('Cloud mode requires login'))
    }

    const ds = new CloudDataSource(serverUrl, apiKey)
    try {
      await ds.connect()
    } catch (e) {
      logger.error('ModeManager', 'Cloud connection failed', { error: String(e) })
      await this.authManager.clearKey()
      vscode.window.showErrorMessage(
        `tlDiagram cloud connection failed: ${e instanceof Error ? e.message : String(e)}`
      )
      return Promise.reject(e)
    }

    this.cloudDs = ds
    this.dataSource = ds
    this.updateContext('cloud', !!this.localDs)

    void vscode.commands.executeCommand('setContext', 'tldiagram.authenticated', true)
    vscode.window.showInformationMessage('tlDiagram: Connected to cloud')
    this._onDataSourceChange.fire(ds)
    return ds
  }

  private async autoSelect(): Promise<DataSource | undefined> {
    logger.info('ModeManager', 'Auto-selecting mode')

    const tldFound = await this.checkTldAvailable()

    if (tldFound) {
      logger.info('ModeManager', 'Auto: CLI found, using local mode')
      return this.switchToLocal()
    }

    if (this.isCloudEnabled() && !!(await this.authManager.getKey())) {
      logger.info('ModeManager', 'Auto: No CLI, using cloud mode')
      return this.switchToCloud()
    }

    logger.info('ModeManager', 'Auto: CLI unavailable and cloud disabled')
    this.updateContext(undefined, false)
    void vscode.commands.executeCommand('setContext', 'tldiagram.authenticated', false)
    vscode.window.showErrorMessage('tlDiagram local mode requires the tld CLI. Set "tlDiagram › Cli Path" or install tld on PATH.')
    return undefined
  }

  private async checkTldAvailable(): Promise<boolean> {
    return (await this.cliManager.detect()) !== null
  }

  private async fallbackToCloud(): Promise<DataSource> {
    const hasKey = this.isCloudEnabled() && !!(await this.authManager.getKey())
    if (hasKey) {
      logger.info('ModeManager', 'Falling back to cloud mode')
      return this.switchToCloud()
    }
    throw new Error('Local mode unavailable and no cloud credentials found')
  }

  private async promptLogin(serverUrl: string): Promise<void> {
    const result = await vscode.window.showInformationMessage(
      'Connect to tlDiagram cloud to use the extension.',
      'Login',
      'Switch to Local',
      'Cancel',
    )
    if (result === 'Login') {
      await vscode.commands.executeCommand('tldiagram.login')
    } else if (result === 'Switch to Local') {
      await this.switchToLocal()
    }
  }

  private async disconnectCloud(): Promise<void> {
    if (this.cloudDs) {
      this.cloudDs.disconnect()
      this.cloudDs = undefined
    }
  }

  private async disconnectLocal(): Promise<void> {
    if (this.localDs) {
      this.localDs.disconnect()
      this.localDs = undefined
    }
  }

  async dispose(): Promise<void> {
    await this.disconnectCloud()
    await this.disconnectLocal()
    this.dataSource = undefined
  }
}
