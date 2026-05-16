import * as vscode from 'vscode'
import { logger } from '../logger'
import type { DiagramTreeItem } from '../tree/DiagramTreeItem'
import type { DataSource } from '../datasource/DataSource'
import { getWebviewHtml } from './getWebviewHtml'
import { MessageRouter } from './MessageRouter'
import { WorkspaceSymbolService } from './WorkspaceSymbolService'

export class WebviewManager {
  private panels = new Map<number, vscode.WebviewPanel>()

  constructor(
    private readonly extensionUri: vscode.Uri,
    private serverUrl: string = 'http://127.0.0.1:8060',
  ) {}

  setDataSource(dataSource: DataSource): void {
    this.serverUrl = (dataSource as any).baseUrl || this.serverUrl
  }

  async openDiagram(item: DiagramTreeItem): Promise<void> {
    const { diagram } = item

    const existing = this.panels.get(diagram.id)
    if (existing) {
      logger.debug('WebviewManager', 'Revealing existing panel', { diagramId: diagram.id })
      existing.reveal(vscode.ViewColumn.One)
      return
    }

    logger.info('WebviewManager', 'Opening diagram panel', { diagramId: diagram.id, name: diagram.name })

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
      this.serverUrl,
      diagram.id,
    )

    logger.debug('WebviewManager', 'Webview HTML injected', { diagramId: diagram.id })

    const router = new MessageRouter()
    const postMessage = (msg: unknown) => {
      logger.trace('WebviewManager', 'postMessage → webview', { type: (msg as { type?: string }).type })
      panel.webview.postMessage(msg)
    }

    new WorkspaceSymbolService(postMessage, router)

    router.register('diagram-loaded', (msg) => {
      if (msg.type !== 'diagram-loaded') return
      logger.info('WebviewManager', 'diagram-loaded received', {
        diagramId: msg.diagramId,
        elementCount: msg.elements.length,
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

  postMessageToDiagram(diagramId: number, message: any): void {
    const panel = this.panels.get(diagramId)
    if (panel) {
      panel.webview.postMessage(message)
    }
  }
}
