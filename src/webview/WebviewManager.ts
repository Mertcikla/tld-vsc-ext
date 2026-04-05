import * as vscode from 'vscode'
import type { AuthManager } from '../auth/AuthManager'
import type { DiagramTreeItem } from '../tree/DiagramTreeItem'
import { getWebviewHtml } from './getWebviewHtml'

export class WebviewManager {
  private panels = new Map<number, vscode.WebviewPanel>()

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly authManager: AuthManager,
    private readonly serverUrl: string,
  ) {}

  async openDiagram(item: DiagramTreeItem): Promise<void> {
    const { diagram } = item

    // Reuse existing panel if open
    const existing = this.panels.get(diagram.id)
    if (existing) {
      existing.reveal(vscode.ViewColumn.One)
      return
    }

    const apiKey = await this.authManager.getKey()
    if (!apiKey) {
      vscode.window.showErrorMessage(
        'Not connected to tlDiagram. Run "tlDiagram: Connect with API Key" first.',
      )
      return
    }

    const panel = vscode.window.createWebviewPanel(
      'tldiagram.diagram',
      diagram.name,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        // Prevents the React canvas from unmounting when the user switches tabs
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'out', 'webview')],
      },
    )

    panel.webview.html = getWebviewHtml(
      panel.webview,
      this.extensionUri,
      apiKey,
      this.serverUrl,
      diagram.id,
    )

    this.panels.set(diagram.id, panel)
    panel.onDidDispose(() => this.panels.delete(diagram.id))
  }
}
