import * as vscode from 'vscode'

export interface DiagObjectData {
  id: number
  name: string
  type: string
  technology?: string | null
}

export class ObjectTreeItem extends vscode.TreeItem {
  constructor(public readonly object: DiagObjectData) {
    super(object.name, vscode.TreeItemCollapsibleState.None)
    this.description = object.technology ?? object.type
    this.tooltip = `${object.name} (${object.type})`
    this.contextValue = 'diagObject'
    this.iconPath = new vscode.ThemeIcon('symbol-class')
  }
}
