import * as vscode from 'vscode'
import { logger } from '../logger'
import type { ExtensionApiClient } from '../api/ExtensionApiClient'
import { ElementTreeItem, type DiagElementData } from './ElementTreeItem'
import type { WebviewManager } from '../webview/WebviewManager'

/**
 * TreeDataProvider for the Element Library panel.
 * Shows all reusable elements from the org, grouped by type.
 * "Add to Diagram" context-menu action posts element-placed to the active webview.
 */
export class ElementLibraryTreeProvider implements vscode.TreeDataProvider<ElementTreeItem | vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  private elements: DiagElementData[] = []
  private groupedTypes: string[] = []
  private postMessageFn: ((msg: unknown) => void) | undefined

  constructor(
    private client: ExtensionApiClient | undefined,
    private readonly webviewManager: WebviewManager,
  ) {}

  updateClient(client: ExtensionApiClient): void {
    logger.debug('ElementLibraryTreeProvider', 'Client updated')
    this.client = client
  }

  setPostMessage(fn: ((msg: unknown) => void) | undefined): void {
    logger.trace('ElementLibraryTreeProvider', fn ? 'postMessage fn set' : 'postMessage fn cleared')
    this.postMessageFn = fn
  }

  refresh(): void {
    logger.debug('ElementLibraryTreeProvider', 'Refresh — clearing element cache')
    this.elements = []
    this.groupedTypes = []
    this._onDidChangeTreeData.fire()
  }

  getTreeItem(element: ElementTreeItem | vscode.TreeItem): vscode.TreeItem {
    return element
  }

  async getChildren(element?: ElementTreeItem | vscode.TreeItem): Promise<(ElementTreeItem | vscode.TreeItem)[]> {
    if (!this.client) {
      logger.trace('ElementLibraryTreeProvider', 'getChildren: no client — returning empty')
      return []
    }

    if (!element) {
      if (this.elements.length === 0) {
        logger.debug('ElementLibraryTreeProvider', 'getChildren: loading elements')
        await this.loadElements()
      }
      logger.trace('ElementLibraryTreeProvider', 'getChildren: returning type groups', {
        groups: this.groupedTypes,
      })
      return this.groupedTypes.map((type) => {
        const item = new vscode.TreeItem(
          type.charAt(0).toUpperCase() + type.slice(1),
          vscode.TreeItemCollapsibleState.Expanded,
        )
        item.contextValue = 'elementTypeGroup'
        item.id = `group::${type}`
        return item
      })
    }

    if (element.id?.startsWith('group::')) {
      const type = element.id.slice('group::'.length)
      const items = this.elements
        .filter((o) => o.type === type)
        .map((o) => new ElementTreeItem(o))
      logger.trace('ElementLibraryTreeProvider', 'getChildren: group expanded', { type, count: items.length })
      return items
    }

    return []
  }

  private async loadElements(): Promise<void> {
    if (!this.client) return
    try {
      logger.debug('ElementLibraryTreeProvider', 'loadElements: fetching via listElements')
      const elements = await this.client.listElements()
      this.setElements(elements)
      logger.debug('ElementLibraryTreeProvider', 'loadElements: done', { count: elements.length })
    } catch (e) {
      logger.error('ElementLibraryTreeProvider', 'loadElements failed', { error: String(e) })
      this.elements = []
      this.groupedTypes = []
    }
  }

  setElements(elements: DiagElementData[]): void {
    logger.info('ElementLibraryTreeProvider', 'setElements', { count: elements.length })
    this.elements = elements
    const seen = new Set<string>()
    this.groupedTypes = []
    for (const o of elements) {
      if (!seen.has(o.type)) {
        seen.add(o.type)
        this.groupedTypes.push(o.type)
      }
    }
    logger.debug('ElementLibraryTreeProvider', 'setElements: type groups', { groups: this.groupedTypes })
    this._onDidChangeTreeData.fire()
  }

  addElementToDiagram(element: DiagElementData): void {
    if (!this.postMessageFn) {
      logger.warn('ElementLibraryTreeProvider', 'addElementToDiagram: no active webview panel')
      vscode.window.showWarningMessage('No diagram is open. Open a diagram first.')
      return
    }
    logger.info('ElementLibraryTreeProvider', 'addElementToDiagram', { elementId: element.id, name: element.name })
    this.postMessageFn({
      type: 'element-placed',
      elementId: element.id,
      x: 200,
      y: 200,
    })
  }
}
