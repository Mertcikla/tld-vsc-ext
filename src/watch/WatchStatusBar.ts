import * as vscode from 'vscode'
import { logger } from '../logger'
import type { WatchService } from './WatchService'

export class WatchStatusBar {
  private item: vscode.StatusBarItem

  constructor(private readonly watchService: WatchService) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100)
    this.item.name = 'tlDiagram Watch'
    this.item.tooltip = 'tlDiagram Watch Status'
    this.item.command = 'tldiagram.watchQuickActions'
    this.updateIdle()

    this.watchService.onEvent((event) => {
      switch (event.type) {
        case 'watch.started':
          this.updateWatching(event.data?.watched_files)
          break
        case 'watch.stopped':
          this.updateIdle()
          break
        case 'watch.paused':
          this.updatePaused()
          break
        case 'watch.error':
          this.updateError(event.message)
          break
      }
    })
  }

  private updateWatching(fileCount?: number): void {
    if (fileCount != null) {
      this.item.text = `$(eye) tlDiagram: Watching (${fileCount} files)`
    } else {
      this.item.text = '$(eye) tlDiagram: Watching'
    }
    this.item.backgroundColor = undefined
    this.item.show()
    logger.debug('WatchStatusBar', 'Watching', { fileCount })
  }

  private updateIdle(): void {
    this.item.text = '$(circle-slash) tlDiagram: Idle'
    this.item.backgroundColor = undefined
    this.item.show()
  }

  private updatePaused(): void {
    this.item.text = '$(debug-pause) tlDiagram: Paused'
    this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground')
    this.item.show()
  }

  private updateError(message?: string): void {
    this.item.text = '$(error) tlDiagram: Watch Error'
    this.item.tooltip = message ? `tlDiagram Watch Error: ${message}` : 'tlDiagram Watch Error'
    this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground')
    this.item.show()
    logger.error('WatchStatusBar', 'Watch error', { message })
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
