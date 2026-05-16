import * as vscode from 'vscode'
import { logger } from '../logger'
import { type DataSource } from '../datasource/DataSource'
import { LocalDataSource } from '../datasource/LocalDataSource'
import { CLIManager } from '../cli/CLIManager'

export class ModeManager {
  private _onDataSourceChange = new vscode.EventEmitter<DataSource>()
  readonly onDataSourceChange = this._onDataSourceChange.event

  private dataSource: LocalDataSource | undefined
  private readonly cliManager = new CLIManager()

  getDataSource(): DataSource | undefined {
    return this.dataSource
  }

  async initialize(): Promise<DataSource | undefined> {
    logger.info('ModeManager', 'Initializing local CLI mode')
    return this.switchToLocal()
  }

  private getWatchHost(): string {
    return vscode.workspace.getConfiguration('tldiagram').get<string>('watch.host', '127.0.0.1') || '127.0.0.1'
  }

  private getWatchPort(): number {
    return vscode.workspace.getConfiguration('tldiagram').get<number>('watch.port', 0)
  }

  private updateContext(mode: 'local' | undefined): void {
    void vscode.commands.executeCommand('setContext', 'tldiagram.mode', mode)
  }

  refreshFeatureContexts(): void {
    this.updateContext(this.dataSource?.mode)
  }

  async switchToLocal(): Promise<DataSource> {
    logger.info('ModeManager', 'Switching to local mode')

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (!workspaceRoot) {
      throw new Error('Open a workspace folder before using tlDiagram local mode.')
    }

    const tldPath = await this.cliManager.detect()
    if (!tldPath) {
      this.updateContext(undefined)
      void vscode.commands.executeCommand('setContext', 'tldiagram.authenticated', false)
      vscode.window.showErrorMessage('tlDiagram local mode requires the tld CLI. Set "tlDiagram › Cli Path" or install tld on PATH.')
      throw new Error('tld CLI not found. Set "tlDiagram › Cli Path" or install tld on PATH.')
    }

    await this.disconnectLocal()

    const ds = new LocalDataSource(tldPath, workspaceRoot, this.getWatchHost(), this.getWatchPort())
    try {
      await ds.connect()
    } catch (e) {
      logger.error('ModeManager', 'Failed to start local mode', { error: String(e) })
      this.updateContext(undefined)
      void vscode.commands.executeCommand('setContext', 'tldiagram.authenticated', false)
      vscode.window.showErrorMessage(
        `tlDiagram local mode failed: ${e instanceof Error ? e.message : String(e)}`
      )
      throw e
    }

    this.dataSource = ds
    this.updateContext('local')
    void vscode.commands.executeCommand('setContext', 'tldiagram.authenticated', true)

    vscode.window.showInformationMessage('tlDiagram: Connected to local workspace')
    this._onDataSourceChange.fire(ds)
    return ds
  }

  private async disconnectLocal(): Promise<void> {
    if (this.dataSource) {
      this.dataSource.disconnect()
      this.dataSource = undefined
    }
  }

  async dispose(): Promise<void> {
    await this.disconnectLocal()
    this.updateContext(undefined)
  }
}
