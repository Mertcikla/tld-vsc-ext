import * as vscode from 'vscode'
import { logger } from '../logger'
import type { WatchService } from './WatchService'
import type { RepositoryChangeTarget } from '../webview/vscodeMessages'

interface DiffItem {
  changeType: 'added' | 'modified' | 'removed'
  resourceType: string
  id: number
  name: string
  target?: RepositoryChangeTarget
  details?: any
}

class DiffTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly diffItem?: DiffItem,
    public readonly changeGroup?: string,
    public readonly resourceGroup?: string,
  ) {
    super(label, collapsibleState)
    if (diffItem) {
      this.description = diffItem.resourceType
      if (diffItem.target) this.command = {
        command: 'tldiagram.openRepositoryChange', title: 'Open Repository Change', arguments: [diffItem.target],
      }
      if (diffItem.changeType === 'added') {
        this.iconPath = new vscode.ThemeIcon('diff-added')
        this.contextValue = 'watchDiffAdded'
      } else if (diffItem.changeType === 'modified') {
        this.iconPath = new vscode.ThemeIcon('diff-modified')
        this.contextValue = 'watchDiffModified'
      } else {
        this.iconPath = new vscode.ThemeIcon('diff-removed')
        this.contextValue = 'watchDiffRemoved'
      }
    }
  }
}

export class WatchDiffProvider implements vscode.TreeDataProvider<DiffTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<DiffTreeItem | undefined | null>()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  private readonly subscription: { dispose(): void }
  private diffs: DiffItem[] = []
  private groupedDiffs: Map<string, Map<string, DiffItem[]>> = new Map()

  constructor(private readonly watchService: WatchService) {
    this.subscription = this.watchService.onEvent((event) => {
      if (event.type === 'representation.updated' && event.data?.diffs) {
        this.processDiffs(event.data.diffs)
      }
    })
  }

  private processDiffs(diffs: any[]): void {
    this.diffs = []
    this.groupedDiffs.clear()

    for (const diff of diffs) {
      const item: DiffItem = {
        changeType: diff.change_type || 'modified',
        resourceType: diff.resource_type || 'unknown',
        id: diff.id ?? 0,
        name: diff.name || `#${diff.id}`,
        details: diff,
        target: diff.repositoryId && diff.filePath ? { repositoryId: diff.repositoryId, filePath: diff.filePath } : undefined,
      }
      this.diffs.push(item)

      if (!this.groupedDiffs.has(item.changeType)) {
        this.groupedDiffs.set(item.changeType, new Map())
      }
      const byType = this.groupedDiffs.get(item.changeType)!
      if (!byType.has(item.resourceType)) {
        byType.set(item.resourceType, [])
      }
      byType.get(item.resourceType)!.push(item)
    }

    logger.info('WatchDiffProvider', 'Diffs processed', {
      total: this.diffs.length,
      added: this.groupedDiffs.get('added')?.size ?? 0,
      modified: this.groupedDiffs.get('modified')?.size ?? 0,
      removed: this.groupedDiffs.get('removed')?.size ?? 0,
    })

    this._onDidChangeTreeData.fire(undefined)
  }

  async refresh(): Promise<void> {
    logger.info('WatchDiffProvider', 'Manual refresh')
    await this.watchService.requestDiff().then((diffs) => {
      if (Array.isArray(diffs)) {
        this.processDiffs(diffs)
      }
    }).catch((e) => {
      logger.warn('WatchDiffProvider', 'Refresh failed', { error: String(e) })
    })
  }

  dispose(): void {
    this.subscription.dispose()
    this._onDidChangeTreeData.dispose()
  }

  getTreeItem(element: DiffTreeItem): vscode.TreeItem {
    return element
  }

  getChildren(element?: DiffTreeItem): DiffTreeItem[] {
    if (!element) {
      // Root: show change type groups
      if (this.diffs.length === 0) {
        return [new DiffTreeItem('No changes detected', vscode.TreeItemCollapsibleState.None)]
      }

      const items: DiffTreeItem[] = []
      for (const changeType of ['added', 'modified', 'removed']) {
        const byType = this.groupedDiffs.get(changeType)
        if (byType && byType.size > 0) {
          let total = 0
          for (const items of byType.values()) {
            total += items.length
          }
          const label = `${changeType === 'added' ? '+' : changeType === 'removed' ? '-' : '~'} ${total} ${changeType}`
          items.push(new DiffTreeItem(label, vscode.TreeItemCollapsibleState.Collapsed, undefined, changeType))
        }
      }
      return items
    }

    if (element.changeGroup && !element.resourceGroup) {
      const byType = this.groupedDiffs.get(element.changeGroup)
      return [...(byType ?? [])].map(([resourceType, diffs]) => new DiffTreeItem(
        `${resourceType} (${diffs.length})`, vscode.TreeItemCollapsibleState.Collapsed,
        undefined, element.changeGroup, resourceType,
      ))
    }

    if (element.changeGroup && element.resourceGroup) {
      const diffs = this.groupedDiffs.get(element.changeGroup)?.get(element.resourceGroup) ?? []
      return diffs.map((diff) => {
        const prefix = diff.changeType === 'added' ? '+' : diff.changeType === 'removed' ? '-' : '~'
        return new DiffTreeItem(`${prefix} ${diff.name}`, vscode.TreeItemCollapsibleState.None, diff)
      })
    }

    return []
  }
}
