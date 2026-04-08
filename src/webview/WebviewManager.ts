import * as vscode from 'vscode'
import { logger } from '../logger'
import type { AuthManager } from '../auth/AuthManager'
import type { DiagramTreeItem } from '../tree/DiagramTreeItem'
import { getWebviewHtml } from './getWebviewHtml'
import { MessageRouter } from './MessageRouter'
import { WorkspaceSymbolService } from './WorkspaceSymbolService'

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
      logger.debug('WebviewManager', 'Revealing existing panel', { diagramId: diagram.id })
      existing.reveal(vscode.ViewColumn.One)
      return
    }

    logger.info('WebviewManager', 'Opening diagram panel', { diagramId: diagram.id, name: diagram.name })

    const apiKey = await this.authManager.getKey()
    if (!apiKey) {
      logger.error('WebviewManager', 'Cannot open panel — no API key stored')
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

    logger.debug('WebviewManager', 'Webview HTML injected', { diagramId: diagram.id })

    // Set up typed message routing
    const router = new MessageRouter()
    const postMessage = (msg: unknown) => {
      logger.trace('WebviewManager', 'postMessage → webview', { type: (msg as { type?: string }).type })
      panel.webview.postMessage(msg)
    }

    // Wire workspace symbol/file handlers
    new WorkspaceSymbolService(postMessage, router)

    // Handle diagram-loaded
    router.register('diagram-loaded', (msg) => {
      if (msg.type !== 'diagram-loaded') return
      logger.info('WebviewManager', 'diagram-loaded received', {
        diagramId: msg.diagramId,
        objectCount: msg.objects.length,
      })
    })

    panel.webview.onDidReceiveMessage((msg) => {
      logger.trace('WebviewManager', 'Message received from webview', {
        type: (msg as { type?: string }).type,
      })
      void router.dispatch(msg)
    })

    this.panels.set(diagram.id, panel)
    panel.onDidDispose(() => {
      logger.info('WebviewManager', 'Panel disposed', { diagramId: diagram.id })
      this.panels.delete(diagram.id)
    })
  }
}
