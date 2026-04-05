import * as vscode from 'vscode'
import { logger } from '../logger'
import { INDEXED_KINDS, SOURCE_GLOB, EXCLUDE_GLOB } from './symbolMapping'

export interface IndexedSymbol {
  name: string
  kind: vscode.SymbolKind
  filePath: string  // workspace-relative
  startLine: number
}

const BATCH_CONCURRENCY = 5

/**
 * Indexes top-level symbols in a given folder URI by walking source files
 * and calling the LSP document symbol provider per file.
 *
 * @param folderUri  The folder to index (can be a sub-folder of the workspace)
 * @param token      Cancellation token; checked between file batches
 * @param onProgress Called after each batch with running total
 */
export async function indexFolder(
  folderUri: vscode.Uri,
  token: vscode.CancellationToken,
  onProgress?: (indexed: number, total: number) => void,
): Promise<IndexedSymbol[]> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri

  logger.info('FolderIndexer', 'Starting folder index', { folder: folderUri.fsPath })

  const uris = await vscode.workspace.findFiles(
    new vscode.RelativePattern(folderUri, SOURCE_GLOB),
    `{${EXCLUDE_GLOB}}`,
  )

  logger.info('FolderIndexer', 'Files to index', { count: uris.length, folder: folderUri.fsPath })

  const results: IndexedSymbol[] = []
  const seen = new Set<string>()
  let filesProcessed = 0
  let filesSkipped = 0

  for (let i = 0; i < uris.length; i += BATCH_CONCURRENCY) {
    if (token.isCancellationRequested) {
      logger.info('FolderIndexer', 'Indexing cancelled', { processedSoFar: filesProcessed })
      break
    }
    const batch = uris.slice(i, i + BATCH_CONCURRENCY)
    logger.trace('FolderIndexer', 'Processing batch', {
      batchStart: i,
      batchSize: batch.length,
      total: uris.length,
    })

    await Promise.all(
      batch.map(async (uri) => {
        if (token.isCancellationRequested) return
        let rawSymbols: vscode.DocumentSymbol[] | undefined
        try {
          rawSymbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            'vscode.executeDocumentSymbolProvider',
            uri,
          )
        } catch (e) {
          logger.trace('FolderIndexer', 'Symbol provider failed for file', {
            file: uri.fsPath,
            error: String(e),
          })
          filesSkipped++
          return
        }
        if (!rawSymbols) {
          logger.trace('FolderIndexer', 'No symbols returned for file', { file: uri.fsPath })
          filesSkipped++
          return
        }

        const relPath = workspaceRoot
          ? uri.fsPath.startsWith(workspaceRoot.fsPath + '/')
            ? uri.fsPath.slice(workspaceRoot.fsPath.length + 1)
            : uri.fsPath
          : uri.fsPath

        let addedFromFile = 0
        for (const sym of rawSymbols) {
          if (!INDEXED_KINDS.has(sym.kind)) continue
          const dedupeKey = `${sym.name}::${relPath}`
          if (seen.has(dedupeKey)) continue
          seen.add(dedupeKey)
          results.push({
            name: sym.name,
            kind: sym.kind,
            filePath: relPath,
            startLine: sym.range.start.line,
          })
          addedFromFile++
        }
        filesProcessed++
        logger.trace('FolderIndexer', 'File indexed', { file: relPath, symbolsAdded: addedFromFile })
      }),
    )

    const done = Math.min(i + BATCH_CONCURRENCY, uris.length)
    logger.debug('FolderIndexer', 'Batch complete', {
      processed: done,
      total: uris.length,
      symbolsSoFar: results.length,
    })
    onProgress?.(done, uris.length)
  }

  logger.info('FolderIndexer', 'Indexing complete', {
    filesProcessed,
    filesSkipped,
    totalSymbols: results.length,
    cancelled: token.isCancellationRequested,
  })

  return results
}
