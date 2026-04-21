import * as vscode from 'vscode'
import { logger } from './logger'
import type { ElementCacheService } from './ElementCacheService'

export class TLDiagramCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>()
  public readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event

  constructor(private cacheService: ElementCacheService) {
    this.cacheService.onDidChange(() => {
      this._onDidChangeCodeLenses.fire()
    })
  }

  async provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): Promise<vscode.CodeLens[]> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (!workspaceRoot) return []

    // Only process files in the workspace
    const absPath = document.uri.fsPath
    if (!absPath.startsWith(workspaceRoot + '/')) return []
    
    const relPath = absPath.slice(workspaceRoot.length + 1)
    
    // Check if we have any elements for this file at all to avoid expensive symbol fetching
    const elementsForFile = this.cacheService.getElementsForFile(relPath)
    if (elementsForFile.length === 0) return []

    try {
      const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        document.uri
      )

      if (!symbols || symbols.length === 0) return []

      const codeLenses: vscode.CodeLens[] = []
      const flattenSymbols = (syms: vscode.DocumentSymbol[]) => {
        for (const s of syms) {
          const matchedElements = this.cacheService.getElementsForSymbol(relPath, s.name)
          for (const el of matchedElements) {
            const command: vscode.Command = {
              title: `tlDiagram: [${el.name}]`,
              command: 'tldiagram.goToDiagram',
              arguments: [{ elementId: el.id, elementName: el.name }]
            }
            codeLenses.push(new vscode.CodeLens(s.range, command))
          }
          if (s.children) {
            flattenSymbols(s.children)
          }
        }
      }

      flattenSymbols(symbols)
      return codeLenses
    } catch (e) {
      logger.error('TLDiagramCodeLensProvider', 'provideCodeLenses failed', { error: String(e) })
      return []
    }
  }
}
