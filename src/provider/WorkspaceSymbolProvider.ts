import * as vscode from 'vscode'
import { logger } from '../logger'
import type { ElementCacheService } from '../ElementCacheService'

export class WorkspaceSymbolProvider implements vscode.WorkspaceSymbolProvider {
  constructor(private readonly cacheService: ElementCacheService) {}

  async provideWorkspaceSymbols(
    query: string,
    _token: vscode.CancellationToken,
  ): Promise<vscode.SymbolInformation[]> {
    if (!query || query.trim().length === 0) return []

    const lowerQuery = query.toLowerCase()

    // Collect all elements from the cache that match the query
    const symbols: vscode.SymbolInformation[] = []

    for (const [relPath] of this.cacheService.fileIndex) {
      const elements = this.cacheService.getElementsForFile(relPath)
      for (const element of elements) {
        if (element.name.toLowerCase().includes(lowerQuery)) {
          const symbol = new vscode.SymbolInformation(
            `[tlDiagram] ${element.name}`,
            vscode.SymbolKind.Object,
            element.name,
            new vscode.Location(
              vscode.Uri.parse(`tldiagram://element/${element.id}`),
              new vscode.Position(0, 0),
            ),
          )
          symbol.containerName = element.type
          symbols.push(symbol)
        }
      }
    }

    logger.trace('WorkspaceSymbolProvider', 'provideWorkspaceSymbols', {
      query,
      matches: symbols.length,
    })

    return symbols.slice(0, 100)
  }

  async resolveWorkspaceSymbol(
    symbol: vscode.SymbolInformation,
    _token: vscode.CancellationToken,
  ): Promise<vscode.SymbolInformation> {
    return symbol
  }
}
