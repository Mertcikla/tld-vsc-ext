import * as vscode from 'vscode'
import { logger } from '../logger'
import type { DiagObject } from '../../../frontend/src/types/index'

class DiagramObjectItem extends vscode.TreeItem {
  constructor(public readonly object: DiagObject) {
    super(object.name, vscode.TreeItemCollapsibleState.None)
    this.description = object.technology ?? object.type
    this.tooltip = `${object.name} (${object.type})`
    this.contextValue = 'diagramObject'
    this.iconPath = new vscode.ThemeIcon('symbol-class')
    this.command = {
      command: 'tldiagram.focusObject',
      title: 'Focus Object',
      arguments: [object.id],
    }
  }
}

/**
 * TreeDataProvider showing objects currently on the open diagram.
 * Populated by 'diagram-loaded' messages from the webview.
 * Clicking an item posts focus-object back to the webview.
 */
export class DiagramObjectTreeProvider implements vscode.TreeDataProvider<DiagramObjectItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  private objects: DiagObject[] = []
  private postMessageFn: ((msg: unknown) => void) | undefined

  setObjects(objects: DiagObject[]): void {
    logger.info('DiagramObjectTreeProvider', 'setObjects', { count: objects.length })
    this.objects = objects
    this._onDidChangeTreeData.fire()
  }

  setPostMessage(fn: ((msg: unknown) => void) | undefined): void {
    logger.trace('DiagramObjectTreeProvider', fn ? 'postMessage fn set' : 'postMessage fn cleared')
    this.postMessageFn = fn
  }

  getTreeItem(element: DiagramObjectItem): vscode.TreeItem {
    return element
  }

  getChildren(): DiagramObjectItem[] {
    logger.trace('DiagramObjectTreeProvider', 'getChildren', { count: this.objects.length })
    return this.objects.map((o) => new DiagramObjectItem(o))
  }

  focusObject(objectId: number): void {
    if (this.postMessageFn) {
      logger.info('DiagramObjectTreeProvider', 'focusObject', { objectId })
      this.postMessageFn({ type: 'focus-object', objectId })
    } else {
      logger.warn('DiagramObjectTreeProvider', 'focusObject: no active panel to post to', { objectId })
    }
  }
}
