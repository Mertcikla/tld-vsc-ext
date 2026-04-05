import * as vscode from 'vscode'
import { logger } from '../logger'
import type { MessageRouter } from './MessageRouter'
import type { WorkspaceSymbol } from '../../../frontend/src/types/vscode-messages'

type PostMessageFn = (msg: unknown) => void

/**
 * Handles workspace-related messages from the webview:
 *  - request-workspace-files  → findFiles → workspace-files response
 *  - request-symbol-list-for-file → documentSymbolProvider → workspace-symbols response
 *  - open-file → showTextDocument at the given line
 */
export class WorkspaceSymbolService {
  constructor(
    private readonly postMessage: PostMessageFn,
    router: MessageRouter,
  ) {
    router.register('request-workspace-files', async (msg) => {
      if (msg.type !== 'request-workspace-files') return
      logger.debug('WorkspaceSymbolService', 'request-workspace-files', {
        requestId: msg.requestId,
        pattern: msg.pattern,
      })

      const uris = await vscode.workspace.findFiles(msg.pattern, '**/node_modules/**')
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? ''
      const files = uris.map((u) => {
        const abs = u.fsPath
        return workspaceRoot && abs.startsWith(workspaceRoot + '/')
          ? abs.slice(workspaceRoot.length + 1)
          : abs
      })

      logger.debug('WorkspaceSymbolService', 'workspace-files response', {
        requestId: msg.requestId,
        count: files.length,
      })
      this.postMessage({ type: 'workspace-files', requestId: msg.requestId, files })
    })

    router.register('request-symbol-list-for-file', async (msg) => {
      if (msg.type !== 'request-symbol-list-for-file') return
      logger.debug('WorkspaceSymbolService', 'request-symbol-list-for-file', {
        requestId: msg.requestId,
        filePath: msg.filePath,
      })

      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri
      if (!workspaceRoot) {
        logger.warn('WorkspaceSymbolService', 'No workspace root — returning empty symbols')
        this.postMessage({ type: 'workspace-symbols', requestId: msg.requestId, symbols: [] })
        return
      }

      const fileUri = vscode.Uri.joinPath(workspaceRoot, msg.filePath)
      try {
        const rawSymbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
          'vscode.executeDocumentSymbolProvider',
          fileUri,
        )
        const symbols: WorkspaceSymbol[] = (rawSymbols ?? []).map((s) => ({
          name: s.name,
          kind: vscode.SymbolKind[s.kind],
          filePath: msg.filePath,
          startLine: s.range.start.line,
        }))
        logger.debug('WorkspaceSymbolService', 'workspace-symbols response', {
          requestId: msg.requestId,
          filePath: msg.filePath,
          count: symbols.length,
        })
        this.postMessage({ type: 'workspace-symbols', requestId: msg.requestId, symbols })
      } catch (e) {
        logger.warn('WorkspaceSymbolService', 'executeDocumentSymbolProvider failed', {
          filePath: msg.filePath,
          error: String(e),
        })
        this.postMessage({ type: 'workspace-symbols', requestId: msg.requestId, symbols: [] })
      }
    })

    router.register('open-file', async (msg) => {
      if (msg.type !== 'open-file') return
      logger.info('WorkspaceSymbolService', 'open-file', { filePath: msg.filePath, startLine: msg.startLine })

      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri
      if (!workspaceRoot) {
        logger.warn('WorkspaceSymbolService', 'open-file: no workspace root')
        return
      }
      const fileUri = vscode.Uri.joinPath(workspaceRoot, msg.filePath)
      const pos = new vscode.Position(Math.max(0, msg.startLine), 0)
      try {
        await vscode.window.showTextDocument(fileUri, {
          selection: new vscode.Range(pos, pos),
          preserveFocus: false,
        })
        logger.debug('WorkspaceSymbolService', 'open-file: document shown', { filePath: msg.filePath })
      } catch (e) {
        logger.error('WorkspaceSymbolService', 'open-file: showTextDocument failed', {
          filePath: msg.filePath,
          error: String(e),
        })
      }
    })
  }
}
