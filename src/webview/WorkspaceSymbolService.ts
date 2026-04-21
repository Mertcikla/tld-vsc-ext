import * as vscode from 'vscode'
import { logger } from '../logger'
import type { MessageRouter } from './MessageRouter'
import type { WorkspaceSymbol } from '../../../frontend/src/types/vscode-messages'

type PostMessageFn = (msg: unknown) => void

function flattenDocumentSymbols(symbols: vscode.DocumentSymbol[]): vscode.DocumentSymbol[] {
  const flattened: vscode.DocumentSymbol[] = []

  const visit = (nodes: vscode.DocumentSymbol[]) => {
    for (const node of nodes) {
      flattened.push(node)
      visit(node.children)
    }
  }

  visit(symbols)
  return flattened
}

function normalizeSymbolKind(kind: string | undefined): string | undefined {
  return kind?.replace(/\s+/g, '').toLowerCase()
}

/**
 * Handles workspace-related messages from the webview:
 *  - request-workspace-files  → findFiles → workspace-files response
 *  - request-symbol-list-for-file → documentSymbolProvider → workspace-symbols response
 *  - open-file → showTextDocument at the given line
 */
export class WorkspaceSymbolService {
  private async resolveSymbolStartLine(
    fileUri: vscode.Uri,
    symbolName: string,
    symbolKind?: string,
  ): Promise<number | undefined> {
    try {
      const rawSymbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        fileUri,
      )
      const symbols = flattenDocumentSymbols(rawSymbols ?? [])
      const normalizedKind = normalizeSymbolKind(symbolKind)
      const exactMatch = symbols.find((symbol) => {
        if (symbol.name !== symbolName) {
          return false
        }
        if (!normalizedKind) {
          return true
        }
        return normalizeSymbolKind(vscode.SymbolKind[symbol.kind]) === normalizedKind
      })
      if (exactMatch) {
        return exactMatch.selectionRange.start.line
      }

      return symbols.find((symbol) => symbol.name === symbolName)?.selectionRange.start.line
    } catch (e) {
      logger.warn('WorkspaceSymbolService', 'resolveSymbolStartLine failed', {
        filePath: fileUri.fsPath,
        symbolName,
        symbolKind,
        error: String(e),
      })
      return undefined
    }
  }

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
        const symbols: WorkspaceSymbol[] = flattenDocumentSymbols(rawSymbols ?? []).map((s) => ({
          name: s.name,
          kind: vscode.SymbolKind[s.kind],
          filePath: msg.filePath,
          startLine: s.selectionRange.start.line,
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
      logger.info('WorkspaceSymbolService', 'open-file', {
        filePath: msg.filePath,
        startLine: msg.startLine,
        symbolName: msg.symbolName,
        symbolKind: msg.symbolKind,
      })

      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri
      if (!workspaceRoot) {
        logger.warn('WorkspaceSymbolService', 'open-file: no workspace root')
        return
      }
      const fileUri = vscode.Uri.joinPath(workspaceRoot, msg.filePath)

      let startLine = msg.symbolName
        ? await this.resolveSymbolStartLine(fileUri, msg.symbolName, msg.symbolKind)
        : undefined
      if (typeof startLine !== 'number' && typeof msg.startLine === 'number') {
        startLine = msg.startLine
      }

      const pos = new vscode.Position(Math.max(0, startLine ?? 0), 0)
      try {
        await vscode.window.showTextDocument(fileUri, {
          selection: new vscode.Range(pos, pos),
          preserveFocus: false,
        })
        logger.debug('WorkspaceSymbolService', 'open-file: document shown', {
          filePath: msg.filePath,
          startLine: startLine ?? 0,
        })
      } catch (e) {
        logger.error('WorkspaceSymbolService', 'open-file: showTextDocument failed', {
          filePath: msg.filePath,
          error: String(e),
        })
      }
    })

    router.register('request-file-content', async (msg) => {
      if (msg.type !== 'request-file-content') return
      logger.debug('WorkspaceSymbolService', 'request-file-content', {
        requestId: msg.requestId,
        filePath: msg.filePath,
        startLine: msg.startLine
      })

      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri
      if (!workspaceRoot) {
        this.postMessage({ type: 'file-content', requestId: msg.requestId, content: '', startLineOffset: 0 })
        return
      }
      
      const fileUri = vscode.Uri.joinPath(workspaceRoot, msg.filePath)
      try {
        const fileData = await vscode.workspace.fs.readFile(fileUri)
        const fileContent = Buffer.from(fileData).toString('utf-8')
        const lines = fileContent.split(/\r?\n/)
        
        const lineLimit = 10
        const startLine = msg.startLine || 0
        const start = Math.max(0, startLine - lineLimit)
        const end = Math.min(lines.length, startLine + lineLimit + 1)
        
        const windowLines = lines.slice(start, end).join('\n')
        
        this.postMessage({ 
          type: 'file-content', 
          requestId: msg.requestId, 
          content: windowLines, 
          startLineOffset: start // 0-based offset for UI to use
        })
      } catch (e) {
        logger.error('WorkspaceSymbolService', 'request-file-content failed', { error: String(e) })
        this.postMessage({ type: 'file-content', requestId: msg.requestId, content: '', startLineOffset: 0 })
      }
    })
  }
}
