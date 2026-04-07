import * as vscode from 'vscode'

/** Symbol kinds we index as top-level diagram nodes. */
export const INDEXED_KINDS = new Set([
  vscode.SymbolKind.Function,
  vscode.SymbolKind.Class,
  vscode.SymbolKind.Interface,
  vscode.SymbolKind.Module,
  vscode.SymbolKind.Struct,
  vscode.SymbolKind.Enum,
])

/** Maps VS Code SymbolKind to the tlDiagram object type string. */
export function kindToObjectType(kind: vscode.SymbolKind): string {
  switch (kind) {
    case vscode.SymbolKind.Class:
    case vscode.SymbolKind.Struct:
      return 'component'
    case vscode.SymbolKind.Interface:
      return 'api'
    case vscode.SymbolKind.Module:
      return 'container'
    case vscode.SymbolKind.Enum:
      return 'component'
    default:
      return 'component'
  }
}

/** Glob patterns for source files we scan for symbols. */
export const SOURCE_GLOB = '**/*.{ts,tsx,js,jsx,go,py,rs,java,kt,swift,cpp,cc,cxx,c,h,hpp,cs,rb,vue}'

/** Glob patterns to exclude. */
export const EXCLUDE_GLOB = '**/node_modules/**,**/dist/**,**/build/**,**/out/**,**/.git/**'
