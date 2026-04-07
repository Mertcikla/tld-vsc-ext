import * as vscode from 'vscode'

export interface IndexedSymbol {
  name: string
  kind: vscode.SymbolKind
  filePath: string
  startLine: number
}

export type ArchitectureParserMode = 'auto' | 'lsp' | 'treesitter'

export type ResolvedArchitectureParserMode = 'lsp' | 'treesitter'

export interface ParserResolution {
  requestedMode: ArchitectureParserMode
  resolvedMode: ResolvedArchitectureParserMode
  didFallback: boolean
  reason?: string
}

export interface ArchitectureAnalysisRunResult {
  rootDiagramId: number
  parser: ParserResolution
}