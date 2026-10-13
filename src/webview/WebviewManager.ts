import * as vscode from 'vscode'
import { logger } from '../logger'
import type { DiagramTreeItem } from '../tree/DiagramTreeItem'
import type { DataSource } from '../datasource/DataSource'
import { getWebviewHtml } from './getWebviewHtml'
import { MessageRouter } from './MessageRouter'
import { WorkspaceSymbolService } from './WorkspaceSymbolService'
import { MarkdownDocumentService } from './MarkdownDocumentService'
import type { RepositoryChangeTarget } from './vscodeMessages'

export class WebviewManager {
  private repositoryPanels = new Map<string, { panel: vscode.WebviewPanel; target: RepositoryChangeTarget; ready: boolean; loaded: boolean }>()
  private panels = new Map<number, vscode.WebviewPanel>()

  constructor(
    private readonly extensionUri: vscode.Uri,
    private serverUrl: string = 'http://127.0.0.1:8060',
    private readonly onPostMessage?: (diagramId: number, message: unknown) => void,
    private readonly markdownDocumentService?: MarkdownDocumentService,
  ) {}

  setDataSource(dataSource: DataSource): void {
    this.serverUrl = (dataSource as any).baseUrl || this.serverUrl
    this.markdownDocumentService?.updateDataSource(dataSource)
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
    this.markdownDocumentService?.registerRouter(router)

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
    const markdownSaveSubscription = this.markdownDocumentService?.onDidSaveMarkdown((event) => {
      if (event.viewId !== diagram.id) return
      postMessage({
        type: 'markdown-saved',
        viewId: event.viewId,
        markdown: {
          path: event.path,
          is_managed: event.isManaged,
          updated_at: event.updatedAt,
        },
        content: event.content,
      })
    })
    panel.onDidDispose(() => {
      logger.info('WebviewManager', 'Panel disposed', { diagramId: diagram.id })
      markdownSaveSubscription?.dispose()
      this.panels.delete(diagram.id)
    })
  }

  async openRepositoryChange(target: RepositoryChangeTarget): Promise<void> {
    const existing = this.repositoryPanels.get(target.repositoryId)
    if (existing) {
      existing.target = target
      existing.panel.reveal(vscode.ViewColumn.One)
      if (existing.ready) void existing.panel.webview.postMessage({ type: 'focus-repository-change', ...target })
      return
    }

    const panel = vscode.window.createWebviewPanel('tldiagram.repositoryChanges', 'Repository Changes', vscode.ViewColumn.One, {
      enableScripts: true, retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'out', 'webview')],
    })
    const state = { panel, target, ready: false, loaded: false }
    this.repositoryPanels.set(target.repositoryId, state)
    const router = new MessageRouter()
    const postMessage = (message: unknown) => { void panel.webview.postMessage(message) }
    new WorkspaceSymbolService(postMessage, router)
    this.markdownDocumentService?.registerRouter(router)
    router.register('ready', () => {
      state.ready = true
      postMessage({ type: 'focus-repository-change', ...state.target })
    })
    router.register('repository-change-loaded', (message) => {
      if (message.type === 'repository-change-loaded' && message.repositoryId === state.target.repositoryId) state.loaded = true
    })
    const messages = panel.webview.onDidReceiveMessage((message) => { void router.dispatch(message) })
    panel.onDidDispose(() => {
      messages.dispose()
      this.repositoryPanels.delete(target.repositoryId)
    })
    panel.webview.html = getWebviewHtml(panel.webview, this.extensionUri, this.serverUrl, undefined, target)
  }

  getRepositoryChangeState(repositoryId: string): { target: RepositoryChangeTarget; ready: boolean; loaded: boolean; active: boolean } | undefined {
    const state = this.repositoryPanels.get(repositoryId)
    return state ? { target: state.target, ready: state.ready, loaded: state.loaded, active: state.panel.active } : undefined
  }

  postMessageToDiagram(diagramId: number, message: any): void {
    this.onPostMessage?.(diagramId, message)
    const panel = this.panels.get(diagramId)
    if (panel) {
      panel.webview.postMessage(message)
    }
  }
}
