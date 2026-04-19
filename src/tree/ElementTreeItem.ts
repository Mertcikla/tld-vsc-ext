import * as vscode from 'vscode'
import type { DiagElementData } from '../api/ExtensionApiClient'

export { type DiagElementData }

export class ElementTreeItem extends vscode.TreeItem {
  constructor(public readonly element: DiagElementData) {
    super(element.name, vscode.TreeItemCollapsibleState.None)
    this.description = element.technology ?? element.type
    this.tooltip = `${element.name} (${element.type})`
    this.contextValue = 'diagElement'
    this.iconPath = new vscode.ThemeIcon('symbol-class')
  }
}
