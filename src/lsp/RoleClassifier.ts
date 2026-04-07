import * as vscode from 'vscode'
import { logger } from '../logger'
import type { IndexedSymbol } from '../parsing/shared/types'
import { DEFAULT_IMPORT_ROLE_MAP } from '../parsing/shared/defaultImportRoleMap'
import { matchArchitecturalRoleHeuristics } from '../parsing/shared/roleHeuristics'
import type { ArchitecturalRole } from '../parsing/shared/roles'
import type { ExternalLibrary } from './ImportParser'
import type { TreeSitterQueryLoader } from '../parsing/treesitter/TreeSitterQueryLoader'

export interface ClassifiedSymbol extends IndexedSymbol {
  role: ArchitecturalRole
  vscodeLangId: string
}

export interface CustomRolePattern {
  /** Substring or regex pattern matched against the file path (lowercased) */
  pattern: string
  role: ArchitecturalRole
}

/**
 * Classifies IndexedSymbols into ArchitecturalRoles using (in priority order):
 *   1. User custom rules
 *   2. Tree-sitter structural queries (if available)
 *   3. Import fingerprint (which external libs does this file use?)
 *   4. Symbol Name heuristics (LSP fallback)
 *   5. Path segment heuristics
 *   6. SymbolKind fallback
 */
export class RoleClassifier {
  /** filePath (workspace-relative) → role inferred from import analysis */
  private readonly importFingerprint: Map<string, ArchitecturalRole>

  constructor(
    private readonly loader: TreeSitterQueryLoader | null,
    private readonly customRules: CustomRolePattern[],
    importFingerprint: Map<string, ArchitecturalRole>,
    private readonly disablePathHeuristics: boolean = false,
  ) {
    this.importFingerprint = importFingerprint
  }

  async classifyAll(
    symbols: IndexedSymbol[],
    token: vscode.CancellationToken,
  ): Promise<ClassifiedSymbol[]> {
    // Cache file text + lang ID so we read each file once
    const fileCache = new Map<string, { text: string; langId: string }>()

    const results: ClassifiedSymbol[] = []
    for (const sym of symbols) {
      if (token.isCancellationRequested) break

      if (!fileCache.has(sym.filePath)) {
        const langId = langIdFromPath(sym.filePath)
        const text = await readFileText(sym.filePath)
        fileCache.set(sym.filePath, { text: text ?? '', langId })
      }

      const { text, langId } = fileCache.get(sym.filePath)!
      const role = await this.classify(sym, text, langId)
      results.push({ ...sym, role, vscodeLangId: langId })
    }
    return results
  }

  private async classify(
    sym: IndexedSymbol,
    fileText: string,
    langId: string,
  ): Promise<ArchitecturalRole> {
    const pathLower = sym.filePath.toLowerCase()

    // 1. Custom rules
    for (const rule of this.customRules) {
      try {
        if (new RegExp(rule.pattern, 'i').test(pathLower)) {
          logger.trace('RoleClassifier', 'custom rule match', { name: sym.name, role: rule.role })
          return rule.role
        }
      } catch {
        // Invalid regex — skip
      }
    }

    // 2. Tree-sitter structural queries
    if (fileText && this.loader) {
      const tsRole = await this.loader.runRoleQueries(fileText, langId, sym.startLine)
      if (tsRole) {
        logger.trace('RoleClassifier', 'tree-sitter match', { name: sym.name, role: tsRole })
        return tsRole
      }
    }

    // 3. Import fingerprint (file-level inference from what it imports)
    const fpRole = this.importFingerprint.get(sym.filePath)
    if (fpRole) {
      logger.trace('RoleClassifier', 'import fingerprint match', { name: sym.name, role: fpRole })
      return fpRole
    }

    // 4. Symbol name and path heuristics
    const heuristicMatch = matchArchitecturalRoleHeuristics(sym.name, sym.filePath, this.disablePathHeuristics)
    if (heuristicMatch) {
      logger.trace('RoleClassifier', 'heuristic match', {
        name: sym.name,
        role: heuristicMatch.role,
        source: heuristicMatch.source,
      })
      return heuristicMatch.role
    }

    // 5. SymbolKind fallback
    if (sym.kind === vscode.SymbolKind.Interface || sym.kind === vscode.SymbolKind.Enum) {
      return 'model'
    }

    return 'unknown'
  }

  /**
   * Builds an import fingerprint: for each file, determines a role based on
   * which external libraries it imports. The caller provides an `importRoleMap`
   * (user-configurable key-value store matching import path substrings → role).
   */
  static buildImportFingerprint(
    externalLibraries: Map<string, ExternalLibrary>,
    importRoleMap: Record<string, ArchitecturalRole>,
  ): Map<string, ArchitecturalRole> {
    const fingerprint = new Map<string, ArchitecturalRole>()

    for (const [libName, library] of externalLibraries) {
      const role = matchImportRole(libName, importRoleMap)
      if (!role) continue

      for (const filePath of library.importedBy) {
        // Prefer higher-priority role (api_entry > repository > service > data_exit)
        const existing = fingerprint.get(filePath)
        if (!existing || rolePriority(role) > rolePriority(existing)) {
          fingerprint.set(filePath, role)
        }
      }
    }

    return fingerprint
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function matchImportRole(
  libName: string,
  importRoleMap: Record<string, ArchitecturalRole>,
): ArchitecturalRole | null {
  const lower = libName.toLowerCase()
  for (const [pattern, role] of Object.entries(importRoleMap)) {
    if (lower.includes(pattern.toLowerCase())) return role
  }
  return null
}

function rolePriority(role: ArchitecturalRole): number {
  const p: Record<ArchitecturalRole, number> = {
    api_entry: 6,
    data_exit: 5,
    repository: 4,
    service: 3,
    model: 2,
    utility: 1,
    external: 0,
    unknown: -1,
  }
  return p[role] ?? -1
}

function langIdFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    go: 'go',
    py: 'python',
    rs: 'rust',
    java: 'java',
    cs: 'csharp',
    kt: 'kotlin',
    swift: 'swift',
    cpp: 'cpp',
    cc: 'cpp',
    c: 'c',
    h: 'c',
    hpp: 'cpp',
    rb: 'ruby',
    vue: 'javascript',
  }
  return map[ext] ?? 'plaintext'
}

async function readFileText(relPath: string): Promise<string | null> {
  try {
    const wsFolders = vscode.workspace.workspaceFolders
    if (!wsFolders?.length) return null
    const absUri = vscode.Uri.joinPath(wsFolders[0].uri, relPath)
    const bytes = await vscode.workspace.fs.readFile(absUri)
    return Buffer.from(bytes).toString('utf8')
  } catch {
    return null
  }
}

export type { ArchitecturalRole } from '../parsing/shared/roles'
export { DEFAULT_IMPORT_ROLE_MAP } from '../parsing/shared/defaultImportRoleMap'
