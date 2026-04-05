import * as vscode from 'vscode'
import { logger } from '../logger'
import { indexFolder, type IndexedSymbol } from './FolderIndexer'

/**
 * Singleton workspace symbol index.
 * Lazily initialized on first access, then kept up-to-date via save events.
 */
export class WorkspaceIndex {
  private static instance: WorkspaceIndex | undefined
  private symbols: IndexedSymbol[] = []
  private initialized = false
  private initPromise: Promise<void> | undefined
  private disposable: vscode.Disposable | undefined

  private constructor() {}

  static getInstance(): WorkspaceIndex {
    if (!WorkspaceIndex.instance) {
      WorkspaceIndex.instance = new WorkspaceIndex()
      logger.debug('WorkspaceIndex', 'Singleton created')
    }
    return WorkspaceIndex.instance
  }

  async ensureInitialized(token?: vscode.CancellationToken): Promise<void> {
    if (this.initialized) {
      logger.trace('WorkspaceIndex', 'Already initialized', { symbolCount: this.symbols.length })
      return
    }
    if (this.initPromise) {
      logger.debug('WorkspaceIndex', 'Init already in progress — awaiting')
      return this.initPromise
    }

    logger.info('WorkspaceIndex', 'Initializing workspace index')
    this.initPromise = this.buildIndex(token ?? new vscode.CancellationTokenSource().token)
    await this.initPromise
    this.initPromise = undefined
    this.initialized = true
    logger.info('WorkspaceIndex', 'Initialization complete', { symbolCount: this.symbols.length })

    this.disposable = vscode.workspace.onDidSaveTextDocument((doc) => {
      logger.debug('WorkspaceIndex', 'File saved — re-indexing', { file: doc.uri.fsPath })
      void this.reindexFile(doc.uri)
    })
  }

  private async buildIndex(token: vscode.CancellationToken): Promise<void> {
    const folders = vscode.workspace.workspaceFolders
    if (!folders || folders.length === 0) {
      logger.warn('WorkspaceIndex', 'No workspace folders open — index will be empty')
      return
    }
    logger.debug('WorkspaceIndex', 'Building index for workspace root', { root: folders[0].uri.fsPath })
    const results = await indexFolder(folders[0].uri, token)
    this.symbols = results
    logger.info('WorkspaceIndex', 'Index built', { symbolCount: results.length })
  }

  private async reindexFile(uri: vscode.Uri): Promise<void> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri
    if (!workspaceRoot) return

    const relPath = uri.fsPath.startsWith(workspaceRoot.fsPath + '/')
      ? uri.fsPath.slice(workspaceRoot.fsPath.length + 1)
      : uri.fsPath

    const before = this.symbols.filter((s) => s.filePath === relPath).length
    this.symbols = this.symbols.filter((s) => s.filePath !== relPath)

    const token = new vscode.CancellationTokenSource().token
    const fresh = await indexFolder(vscode.Uri.file(uri.fsPath.replace(/\/[^/]+$/, '')), token)
    const added = fresh.filter((s) => s.filePath === relPath)
    this.symbols.push(...added)

    logger.debug('WorkspaceIndex', 'File re-indexed', {
      file: relPath,
      symbolsBefore: before,
      symbolsAfter: added.length,
      totalSymbols: this.symbols.length,
    })
  }

  getSymbols(): IndexedSymbol[] {
    return this.symbols
  }

  dispose(): void {
    logger.debug('WorkspaceIndex', 'Disposing')
    this.disposable?.dispose()
    WorkspaceIndex.instance = undefined
  }
}
