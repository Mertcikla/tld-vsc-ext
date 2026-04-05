import * as vscode from 'vscode'
import type { Diagram } from '../api/ExtensionApiClient'

export class DiagramTreeItem extends vscode.TreeItem {
  constructor(
    public readonly diagram: Diagram,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
  ) {
    super(diagram.name, collapsibleState)
    this.contextValue = 'diagram'
    this.description = diagram.level_label ?? undefined
    this.tooltip = diagram.description ?? undefined
    this.iconPath = new vscode.ThemeIcon('type-hierarchy')
    this.command = {
      command: 'tldiagram.openDiagram',
      title: 'Open Diagram',
      arguments: [this],
    }
  }
}
