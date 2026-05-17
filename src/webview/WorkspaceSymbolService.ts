import * as vscode from 'vscode'
import { logger } from '../logger'
import type { MessageRouter } from './MessageRouter'
import type { WorkspaceSymbol } from './vscodeMessages'

type PostMessageFn = (msg: unknown) => void

export interface SourceLinkMessage {
  filePath: string
  startLine?: number
  symbolName?: string
  symbolKind?: string
}

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

function symbolNameMatches(actualName: string, requestedName: string): boolean {
  const actual = actualName.trim()
  const requested = requestedName.trim()
  if (!actual || !requested) return false
  return actual === requested
    || actual.endsWith(`.${requested}`)
    || actual.endsWith(`::${requested}`)
    || requested.endsWith(`.${actual}`)
    || requested.endsWith(`::${actual}`)
}

async function fileExists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri)
    return true
  } catch {
    return false
  }
}

function normalizeRelativePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '')
}

async function resolveWorkspaceFile(filePath: string): Promise<vscode.Uri | undefined> {
  const normalized = normalizeRelativePath(filePath)
  const absolute = filePath.startsWith('/') ? vscode.Uri.file(filePath) : undefined
  if (absolute && await fileExists(absolute)) return absolute

  const workspaceFolders = vscode.workspace.workspaceFolders ?? []
  for (const folder of workspaceFolders) {
    const direct = vscode.Uri.joinPath(folder.uri, normalized)
    if (await fileExists(direct)) return direct
  }

  const matches = await vscode.workspace.findFiles(
    `**/${normalized}`,
    '**/{node_modules,.git}/**',
    20,
  )
  if (matches.length === 0) {
    logger.warn('WorkspaceSymbolService', 'Could not resolve workspace file', { filePath })
    return undefined
  }

  const preferred = matches.find((uri) => !uri.fsPath.includes('/testdata/')) ?? matches[0]
  if (matches.length > 1) {
    logger.warn('WorkspaceSymbolService', 'Resolved workspace file via ambiguous suffix match', {
      filePath,
      selected: preferred.fsPath,
      candidates: matches.map((uri) => uri.fsPath).slice(0, 5),
    })
  } else {
    logger.debug('WorkspaceSymbolService', 'Resolved workspace file via suffix match', {
      filePath,
      selected: preferred.fsPath,
    })
  }
  return preferred
}

async function resolveSymbolStartLine(
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
      if (!symbolNameMatches(symbol.name, symbolName)) {
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

    return symbols.find((symbol) => symbolNameMatches(symbol.name, symbolName))?.selectionRange.start.line
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

export async function openWorkspaceSourceLink(msg: SourceLinkMessage): Promise<boolean> {
  logger.info('WorkspaceSymbolService', 'open-file', {
    filePath: msg.filePath,
    startLine: msg.startLine,
    symbolName: msg.symbolName,
    symbolKind: msg.symbolKind,
  })

  if (!vscode.workspace.workspaceFolders?.length) {
    logger.warn('WorkspaceSymbolService', 'open-file: no workspace root')
    return false
  }
  const fileUri = await resolveWorkspaceFile(msg.filePath)
  if (!fileUri) {
    vscode.window.showWarningMessage(`Could not find source file: ${msg.filePath}`)
    return false
  }

  let startLine = msg.symbolName
    ? await resolveSymbolStartLine(fileUri, msg.symbolName, msg.symbolKind)
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
    return true
  } catch (e) {
    logger.error('WorkspaceSymbolService', 'open-file: showTextDocument failed', {
      filePath: msg.filePath,
      error: String(e),
    })
    return false
  }
}

/**
 * Handles workspace-related messages from the webview:
 *  - request-workspace-files  → findFiles → workspace-files response
 *  - request-symbol-list-for-file → documentSymbolProvider → workspace-symbols response
 *  - open-file → showTextDocument at the given line
 */
export class WorkspaceSymbolService {
  private async resolveWorkspaceFile(filePath: string): Promise<vscode.Uri | undefined> {
    return resolveWorkspaceFile(filePath)
  }

  private async resolveSymbolStartLine(
    fileUri: vscode.Uri,
    symbolName: string,
    symbolKind?: string,
  ): Promise<number | undefined> {
    return resolveSymbolStartLine(fileUri, symbolName, symbolKind)
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

      const fileUri = await this.resolveWorkspaceFile(msg.filePath)
      if (!fileUri) {
        this.postMessage({ type: 'workspace-symbols', requestId: msg.requestId, symbols: [] })
        return
      }
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
      await openWorkspaceSourceLink(msg)
    })

    router.register('request-file-content', async (msg) => {
      if (msg.type !== 'request-file-content') return
      logger.debug('WorkspaceSymbolService', 'request-file-content', {
        requestId: msg.requestId,
        filePath: msg.filePath,
        startLine: msg.startLine
      })

      if (!vscode.workspace.workspaceFolders?.length) {
        this.postMessage({ type: 'file-content', requestId: msg.requestId, content: '', startLineOffset: 0 })
        return
      }
      
      const fileUri = await this.resolveWorkspaceFile(msg.filePath)
      if (!fileUri) {
        this.postMessage({ type: 'file-content', requestId: msg.requestId, content: '', startLineOffset: 0 })
        return
      }
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
