import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { logger } from '../logger'
import type { AuthManager } from '../auth/AuthManager'
import { type DataSource } from '../datasource/DataSource'
import { CloudDataSource } from '../datasource/CloudDataSource'
import { LocalDataSource } from '../datasource/LocalDataSource'

type Mode = 'local' | 'cloud' | 'auto'

export class ModeManager {
  private _onDataSourceChange = new vscode.EventEmitter<DataSource>()
  readonly onDataSourceChange = this._onDataSourceChange.event

  private dataSource: DataSource | undefined
  private cloudDs: CloudDataSource | undefined
  private localDs: LocalDataSource | undefined

  constructor(
    private readonly authManager: AuthManager,
  ) {}

  getDataSource(): DataSource | undefined {
    return this.dataSource
  }

  async initialize(): Promise<DataSource | undefined> {
    const mode = this.getConfiguredMode()
    logger.info('ModeManager', 'Initializing', { mode })

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

  private getAutoStartWatch(): boolean {
    return vscode.workspace.getConfiguration('tldiagram').get<boolean>('autoStartWatch', true)
  }

  private getServerUrl(): string {
    return vscode.workspace.getConfiguration('tldiagram').get<string>('serverUrl', 'https://tldiagram.com').replace(/\/$/, '')
  }

  private hasTldWorkspace(): boolean {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (!root) return false
    return fs.existsSync(path.join(root, '.tld')) || fs.existsSync(path.join(root, 'tld'))
  }

  private updateContext(mode: 'local' | 'cloud' | undefined, hybrid: boolean): void {
    void vscode.commands.executeCommand('setContext', 'tldiagram.mode', mode)
    void vscode.commands.executeCommand('setContext', 'tldiagram.hybrid', hybrid)
  }

  async switchToLocal(): Promise<DataSource> {
    logger.info('ModeManager', 'Switching to local mode')
    await this.disconnectCloud()

    const ds = new LocalDataSource()
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

    if (this.getAutoStartWatch() && this.hasTldWorkspace()) {
      logger.info('ModeManager', 'Auto-starting watch')
      try {
        await ds.startWatch(vscode.workspace.workspaceFolders![0].uri.fsPath)
      } catch (e) {
        logger.warn('ModeManager', 'Auto-start watch failed', { error: String(e) })
      }
    }

    vscode.window.showInformationMessage('tlDiagram: Connected to local workspace')
    this._onDataSourceChange.fire(ds)
    return ds
  }

  async switchToCloud(): Promise<DataSource> {
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
    const hasKey = !!(await this.authManager.getKey())

    if (tldFound) {
      logger.info('ModeManager', 'Auto: CLI found, using local mode')
      return this.switchToLocal()
    }

    if (hasKey) {
      logger.info('ModeManager', 'Auto: No CLI, using cloud mode')
      return this.switchToCloud()
    }

    logger.info('ModeManager', 'Auto: Neither CLI nor API key available — showing setup prompt')
    this.updateContext(undefined, false)
    void vscode.commands.executeCommand('setContext', 'tldiagram.authenticated', false)

    const choice = await vscode.window.showInformationMessage(
      'tlDiagram: Choose your connection mode',
      { modal: false },
      'Connect to Cloud',
      'Use Local CLI',
    )

    if (choice === 'Connect to Cloud') {
      return this.switchToCloud()
    }
    if (choice === 'Use Local CLI') {
      return this.switchToLocal()
    }
    return undefined
  }

  private async checkTldAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = require('child_process').spawn('tld', ['--version'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      proc.on('close', (code: number) => resolve(code === 0))
      proc.on('error', () => resolve(false))
    })
  }

  private async fallbackToCloud(): Promise<DataSource> {
    const hasKey = !!(await this.authManager.getKey())
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
