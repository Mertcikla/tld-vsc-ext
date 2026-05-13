import * as vscode from 'vscode'
import { logger } from '../logger'
import type { SyncService } from './SyncService'

export class SyncStatusBar {
  private item: vscode.StatusBarItem

  constructor(private readonly syncService: SyncService) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99)
    this.item.name = 'tlDiagram Sync'
    this.item.tooltip = 'tlDiagram Sync Status'
    this.item.command = 'tldiagram.showSyncStatus'

    this.updateInSync()

    // Initial check
    void this.syncService.getSyncStatus().then((status) => this.updateStatus(status))
  }

  updateStatus(status: { localChanges: number; needsPush: boolean; needsPull: boolean }): void {
    if (status.localChanges > 0) {
      this.item.text = `$(warning) tlDiagram: ${status.localChanges} local change${status.localChanges === 1 ? '' : 's'} pending`
      this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground')
      this.item.show()
      logger.debug('SyncStatusBar', 'Pending changes', { count: status.localChanges })
    } else {
      this.updateInSync()
    }
  }

  private updateInSync(): void {
    this.item.text = '$(sync) tlDiagram: In sync'
    this.item.backgroundColor = undefined
    this.item.show()
  }

  show(): void {
    this.item.show()
  }

  hide(): void {
    this.item.hide()
  }

  dispose(): void {
    this.item.dispose()
  }
}
