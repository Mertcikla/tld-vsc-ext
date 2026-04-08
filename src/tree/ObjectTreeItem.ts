import * as vscode from 'vscode'
import type { DiagObjectData } from '../api/ExtensionApiClient'

export { type DiagObjectData }

export class ObjectTreeItem extends vscode.TreeItem {
  constructor(public readonly object: DiagObjectData) {
    super(object.name, vscode.TreeItemCollapsibleState.None)
    this.description = object.technology ?? object.type
    this.tooltip = `${object.name} (${object.type})`
    this.contextValue = 'diagObject'
    this.iconPath = new vscode.ThemeIcon('symbol-class')
  }
}
