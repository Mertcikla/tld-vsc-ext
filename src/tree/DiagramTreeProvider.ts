import * as vscode from 'vscode'
import type { Diagram, ExtensionApiClient } from '../api/ExtensionApiClient'
import { DiagramTreeItem } from './DiagramTreeItem'

export class DiagramTreeProvider implements vscode.TreeDataProvider<DiagramTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<DiagramTreeItem | undefined | null>()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  private diagrams: Diagram[] = []
  private loading = false
  private error: string | null = null

  constructor(private client: ExtensionApiClient) {}

  updateClient(client: ExtensionApiClient): void {
    this.client = client
  }

  refresh(): void {
    this.diagrams = []
    this._onDidChangeTreeData.fire(undefined)
  }

  clear(): void {
    this.diagrams = []
    this.error = null
    this._onDidChangeTreeData.fire(undefined)
  }

  getTreeItem(element: DiagramTreeItem): vscode.TreeItem {
    return element
  }

  async getChildren(element?: DiagramTreeItem): Promise<DiagramTreeItem[]> {
    if (!element) {
      // Root level: load all diagrams if not already loaded
      if (this.diagrams.length === 0 && !this.loading) {
        this.loading = true
        try {
          this.diagrams = await this.client.listDiagrams()
          this.error = null
        } catch (e) {
          this.error = e instanceof Error ? e.message : String(e)
          this.loading = false
          return []
        }
        this.loading = false
      }

      const roots = this.diagrams.filter((d) => d.parent_diagram_id === null)
      return roots.map((d) => this.toItem(d))
    }

    const children = this.diagrams.filter((d) => d.parent_diagram_id === element.diagram.id)
    return children.map((d) => this.toItem(d))
  }

  private toItem(d: Diagram): DiagramTreeItem {
    const hasChildren = this.diagrams.some((c) => c.parent_diagram_id === d.id)
    return new DiagramTreeItem(
      d,
      hasChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
    )
  }
}
