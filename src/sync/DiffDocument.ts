import * as vscode from 'vscode'
import { logger } from '../logger'
import type { SyncService } from './SyncService'

export class DiffDocument implements vscode.TextDocumentContentProvider {
  private _onDidChange = new vscode.EventEmitter<vscode.Uri>()
  readonly onDidChange = this._onDidChange.event

  constructor(private readonly syncService: SyncService) {}

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    logger.info('DiffDocument', 'Providing diff content', { uri: uri.toString() })

    try {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '.'
      const result = await this.syncService.diffWithCloud(workspaceRoot)

      if (!result.changed) {
        return 'No changes detected between local workspace and cloud.'
      }

      const lines: string[] = ['# tlDiagram — Changes vs Cloud\n']

      for (const diff of result.diffs) {
        const prefix = diff.change_type === 'added' ? '+' : diff.change_type === 'removed' ? '-' : '~'
        const name = diff.name || `#${diff.id}`
        const type = diff.resource_type || 'unknown'

        lines.push(`${prefix} [${type}] ${name}`)

        if (diff.fields) {
          for (const [key, value] of Object.entries(diff.fields)) {
            lines.push(`    ${key}: ${JSON.stringify(value)}`)
          }
        }
      }

      return lines.join('\n')
    } catch (e) {
      logger.error('DiffDocument', 'Failed to get diff', { error: String(e) })
      return `Error generating diff: ${e instanceof Error ? e.message : String(e)}`
    }
  }

  refresh(): void {
    this._onDidChange.fire(vscode.Uri.parse('tldiagram-diff://cloud'))
  }
}
