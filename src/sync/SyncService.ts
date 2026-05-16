import * as cp from 'child_process'
import * as util from 'util'
import * as vscode from 'vscode'
import { logger } from '../logger'
import type { DiffResult, SyncStatus } from '../datasource/DataSource'
import { CLIManager } from '../cli/CLIManager'

const execFileAsync = util.promisify(cp.execFile)

export class SyncService {
  private watcher: vscode.FileSystemWatcher | undefined
  private readonly cliManager = new CLIManager()

  constructor(
    private readonly onStatusChanged: (status: SyncStatus) => void,
  ) {}

  startFileWatcher(workspaceRoot: string): void {
    this.watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(workspaceRoot, '.tld/**/*'),
    )
    let debounceTimer: ReturnType<typeof setTimeout> | undefined

    const checkSync = () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(async () => {
        try {
          const status = await this.getSyncStatus()
          this.onStatusChanged(status)
        } catch (e) {
          logger.warn('SyncService', 'File watcher sync check failed', { error: String(e) })
        }
      }, 2000)
    }

    this.watcher.onDidChange(() => checkSync())
    this.watcher.onDidCreate(() => checkSync())
    this.watcher.onDidDelete(() => checkSync())
  }

  stopFileWatcher(): void {
    this.watcher?.dispose()
    this.watcher = undefined
  }

  private async getTldPath(): Promise<string> {
    const tldPath = await this.cliManager.detect()
    if (!tldPath) {
      throw new Error('tld CLI not found. Set "tlDiagram › Cli Path" or install tld on PATH.')
    }
    return tldPath
  }

  async exportToCloud(workspaceRoot: string): Promise<void> {
    logger.info('SyncService', 'Exporting to cloud')
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Exporting workspace to cloud...', cancellable: false },
      async () => {
        try {
          const tldPath = await this.getTldPath()
          const { stderr } = await execFileAsync(tldPath, ['apply', '--force'], {
            cwd: workspaceRoot,
            timeout: 30000,
          })
          const stderrText = String(stderr)
          if (stderrText) {
            logger.warn('SyncService', 'tld apply stderr', { stderr: stderrText.slice(0, 500) })
          }
          vscode.window.showInformationMessage('Workspace exported to cloud successfully.')
        } catch (e: any) {
          logger.error('SyncService', 'exportToCloud failed', { error: String(e) })
          throw new Error(`Export failed: ${e.message}`)
        }
      },
    )
  }

  async importFromCloud(workspaceRoot: string): Promise<void> {
    logger.info('SyncService', 'Importing from cloud')
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Downloading from cloud...', cancellable: false },
      async () => {
        try {
          const tldPath = await this.getTldPath()
          const { stderr } = await execFileAsync(tldPath, ['pull', '--force'], {
            cwd: workspaceRoot,
            timeout: 30000,
          })
          const stderrText = String(stderr)
          if (stderrText) {
            logger.warn('SyncService', 'tld pull stderr', { stderr: stderrText.slice(0, 500) })
          }
          vscode.window.showInformationMessage('Workspace downloaded from cloud successfully.')
        } catch (e: any) {
          logger.error('SyncService', 'importFromCloud failed', { error: String(e) })
          throw new Error(`Import failed: ${e.message}`)
        }
      },
    )
  }

  async diffWithCloud(workspaceRoot: string): Promise<DiffResult> {
    logger.info('SyncService', 'Diffing with cloud')
    try {
      const tldPath = await this.getTldPath()
      const { stdout } = await execFileAsync(tldPath, ['status', '--format', 'json'], {
        cwd: workspaceRoot,
        timeout: 15000,
      })
      const result = JSON.parse(String(stdout))
      return {
        changed: result.changed ?? false,
        scan: result.scan ?? {},
        representation: result.representation ?? {},
        diffs: result.diffs ?? [],
      }
    } catch (e: any) {
      logger.error('SyncService', 'diffWithCloud failed', { error: String(e) })
      return { changed: false, scan: {}, representation: {}, diffs: [] }
    }
  }

  async getSyncStatus(workspaceRoot?: string): Promise<SyncStatus> {
    try {
      const root = workspaceRoot || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '.'
      const tldPath = await this.getTldPath()
      const { stdout } = await execFileAsync(tldPath, ['status', '--format', 'json'], {
        cwd: root,
        timeout: 10000,
      })
      const result = JSON.parse(String(stdout))
      return {
        localChanges: result.local_changes ?? result.localChanges ?? 0,
        needsPush: result.needs_push ?? result.needsPush ?? false,
        needsPull: result.needs_pull ?? result.needsPull ?? false,
      }
    } catch {
      return { localChanges: 0, needsPush: false, needsPull: false }
    }
  }

  dispose(): void {
    this.stopFileWatcher()
  }
}
