import * as vscode from 'vscode'
import { logger } from '../logger'
import type { ExtensionApiClient } from '../api/ExtensionApiClient'
import { ObjectTreeItem, type DiagObjectData } from './ObjectTreeItem'
import type { WebviewManager } from '../webview/WebviewManager'

/**
 * TreeDataProvider for the Object Library panel.
 * Shows all reusable objects from the org, grouped by type.
 * "Add to Diagram" context-menu action posts object-placed to the active webview.
 */
export class ObjectLibraryTreeProvider implements vscode.TreeDataProvider<ObjectTreeItem | vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  private objects: DiagObjectData[] = []
  private groupedTypes: string[] = []
  private postMessageFn: ((msg: unknown) => void) | undefined

  constructor(
    private client: ExtensionApiClient | undefined,
    private readonly webviewManager: WebviewManager,
  ) {}

  updateClient(client: ExtensionApiClient): void {
    logger.debug('ObjectLibraryTreeProvider', 'Client updated')
    this.client = client
  }

  setPostMessage(fn: ((msg: unknown) => void) | undefined): void {
    logger.trace('ObjectLibraryTreeProvider', fn ? 'postMessage fn set' : 'postMessage fn cleared')
    this.postMessageFn = fn
  }

  refresh(): void {
    logger.debug('ObjectLibraryTreeProvider', 'Refresh — clearing object cache')
    this.objects = []
    this.groupedTypes = []
    this._onDidChangeTreeData.fire()
  }

  getTreeItem(element: ObjectTreeItem | vscode.TreeItem): vscode.TreeItem {
    return element
  }

  async getChildren(element?: ObjectTreeItem | vscode.TreeItem): Promise<(ObjectTreeItem | vscode.TreeItem)[]> {
    if (!this.client) {
      logger.trace('ObjectLibraryTreeProvider', 'getChildren: no client — returning empty')
      return []
    }

    if (!element) {
      if (this.objects.length === 0) {
        logger.debug('ObjectLibraryTreeProvider', 'getChildren: loading objects')
        await this.loadObjects()
      }
      logger.trace('ObjectLibraryTreeProvider', 'getChildren: returning type groups', {
        groups: this.groupedTypes,
      })
      return this.groupedTypes.map((type) => {
        const item = new vscode.TreeItem(
          type.charAt(0).toUpperCase() + type.slice(1),
          vscode.TreeItemCollapsibleState.Expanded,
        )
        item.contextValue = 'objectTypeGroup'
        item.id = `group::${type}`
        return item
      })
    }

    if (element.id?.startsWith('group::')) {
      const type = element.id.slice('group::'.length)
      const items = this.objects
        .filter((o) => o.type === type)
        .map((o) => new ObjectTreeItem(o))
      logger.trace('ObjectLibraryTreeProvider', 'getChildren: group expanded', { type, count: items.length })
      return items
    }

    return []
  }

  private async loadObjects(): Promise<void> {
    if (!this.client) return
    try {
      logger.debug('ObjectLibraryTreeProvider', 'loadObjects: fetching via listObjects')
      const objects = await this.client.listObjects()
      this.setObjects(objects)
      logger.debug('ObjectLibraryTreeProvider', 'loadObjects: done', { count: objects.length })
    } catch (e) {
      logger.error('ObjectLibraryTreeProvider', 'loadObjects failed', { error: String(e) })
      this.objects = []
      this.groupedTypes = []
    }
  }

  setObjects(objects: DiagObjectData[]): void {
    logger.info('ObjectLibraryTreeProvider', 'setObjects', { count: objects.length })
    this.objects = objects
    const seen = new Set<string>()
    this.groupedTypes = []
    for (const o of objects) {
      if (!seen.has(o.type)) {
        seen.add(o.type)
        this.groupedTypes.push(o.type)
      }
    }
    logger.debug('ObjectLibraryTreeProvider', 'setObjects: type groups', { groups: this.groupedTypes })
    this._onDidChangeTreeData.fire()
  }

  addObjectToDiagram(object: DiagObjectData): void {
    if (!this.postMessageFn) {
      logger.warn('ObjectLibraryTreeProvider', 'addObjectToDiagram: no active webview panel')
      vscode.window.showWarningMessage('No diagram is open. Open a diagram first.')
      return
    }
    logger.info('ObjectLibraryTreeProvider', 'addObjectToDiagram', { objectId: object.id, name: object.name })
    this.postMessageFn({
      type: 'object-placed',
      objectId: object.id,
      x: 200,
      y: 200,
    })
  }
}
