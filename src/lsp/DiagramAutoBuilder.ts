import * as vscode from 'vscode'
import { logger } from '../logger'
import type { ExtensionApiClient } from '../api/ExtensionApiClient'
import type { IndexedSymbol } from './FolderIndexer'
import type { ExternalLibrary } from './ImportParser'
import { kindToObjectType } from './symbolMapping'

const GRID_COLS = 8
const GRID_COL_W = 220
const GRID_ROW_H = 140
const BATCH_SIZE = 50

/**
 * Creates a new diagram and populates it with nodes derived from indexed
 * workspace symbols. Runs in batches to stay within API rate limits.
 *
 * Returns the created diagram ID, or throws (after cleanup) if cancelled.
 */
export async function buildDiagramFromSymbols(
  client: ExtensionApiClient,
  folderName: string,
  symbols: IndexedSymbol[],
  orgId: string,
  token: vscode.CancellationToken,
  onProgress: (done: number, total: number) => void,
  externalLibraries?: Map<string, ExternalLibrary>,
): Promise<number> {
  logger.info('DiagramAutoBuilder', 'Starting diagram build', {
    folderName,
    symbolCount: symbols.length,
  })

  const diagram = await client.createDiagram(folderName)
  const diagramId = diagram.id
  logger.info('DiagramAutoBuilder', 'Diagram created', { diagramId, name: folderName })

  try {
    let objectsCreated = 0

    for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
      if (token.isCancellationRequested) {
        logger.info('DiagramAutoBuilder', 'Cancellation requested — deleting partial diagram', {
          diagramId,
          objectsCreated,
        })
        await client.deleteDiagram(orgId, diagramId)
        throw new vscode.CancellationError()
      }

      const batch = symbols.slice(i, i + BATCH_SIZE)
      logger.debug('DiagramAutoBuilder', 'Processing batch', {
        batchStart: i,
        batchSize: batch.length,
        total: symbols.length,
      })

      await Promise.all(
        batch.map(async (sym, batchIdx) => {
          const globalIdx = i + batchIdx
          const x = (globalIdx % GRID_COLS) * GRID_COL_W
          const y = Math.floor(globalIdx / GRID_COLS) * GRID_ROW_H

          const anchor = JSON.stringify({
            name: sym.name,
            type: kindToObjectType(sym.kind),
            startLine: sym.startLine,
          })
          const filePath = `${sym.filePath}#${anchor}`

          logger.trace('DiagramAutoBuilder', 'Creating object', {
            name: sym.name,
            type: kindToObjectType(sym.kind),
            x,
            y,
          })

          const obj = await client.createObject({
            name: sym.name,
            type: kindToObjectType(sym.kind),
            filePath,
          })
          await client.addObjectToDiagram(diagramId, obj.id, x, y)
          objectsCreated++
        }),
      )

      const done = Math.min(i + BATCH_SIZE, symbols.length)
      logger.debug('DiagramAutoBuilder', 'Batch complete', { done, total: symbols.length, objectsCreated })
      onProgress(done, symbols.length)
    }

    logger.info('DiagramAutoBuilder', 'Diagram build complete', { diagramId, objectsCreated })

    // Place external library nodes in a separate row below the symbol grid
    if (externalLibraries && externalLibraries.size > 0) {
      const symbolRows = Math.ceil(symbols.length / GRID_COLS)
      const libraryBaseY = (symbolRows + 1) * GRID_ROW_H
      const libEntries = [...externalLibraries.values()]
      logger.info('DiagramAutoBuilder', 'Placing external library nodes', { count: libEntries.length })

      for (let i = 0; i < libEntries.length; i += BATCH_SIZE) {
        if (token.isCancellationRequested) {
          logger.info('DiagramAutoBuilder', 'Cancellation during library placement — deleting partial diagram', { diagramId })
          await client.deleteDiagram(orgId, diagramId)
          throw new vscode.CancellationError()
        }
        const batch = libEntries.slice(i, i + BATCH_SIZE)
        await Promise.all(
          batch.map(async (lib, batchIdx) => {
            const idx = i + batchIdx
            const x = (idx % GRID_COLS) * GRID_COL_W
            const y = libraryBaseY + Math.floor(idx / GRID_COLS) * GRID_ROW_H
            const obj = await client.createObject({ name: lib.name, type: 'external_system' })
            await client.addObjectToDiagram(diagramId, obj.id, x, y)
          }),
        )
      }
    }
  } catch (e) {
    if (!(e instanceof vscode.CancellationError)) {
      logger.error('DiagramAutoBuilder', 'Build failed — cleaning up diagram', {
        diagramId,
        error: String(e),
      })
      await client.deleteDiagram(orgId, diagramId).catch((ce) => {
        logger.warn('DiagramAutoBuilder', 'Cleanup deleteDiagram also failed', { error: String(ce) })
      })
    }
    throw e
  }

  return diagramId
}
