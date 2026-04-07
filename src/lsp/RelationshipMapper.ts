import * as vscode from 'vscode'
import * as path from 'path'
import { logger } from '../logger'
import type { ClassifiedSymbol } from './RoleClassifier'
import type { TreeSitterQueryLoader } from './TreeSitterQueryLoader'

export interface SymbolEdge {
  srcRef: string
  dstRef: string
  /** Set by the Platonic filter: name of the collapsed intermediate node */
  label?: string
}

export interface RelationshipGraph {
  edges: SymbolEdge[]
  reachableRefs: Set<string>
}

// Roles that cannot be collapsed by the Platonic filter (they have side effects)
const SIDE_EFFECT_ROLES = new Set(['api_entry', 'repository', 'data_exit', 'external'])

/**
 * Builds a symbol-level relationship graph from import dependencies.
 *
 * For each source file: extract its import statements via tree-sitter, resolve
 * each import path to matching files in the symbol index, then create directed
 * edges from every symbol in the importing file to every symbol in the imported
 * file. This captures structural file-level dependencies without relying on
 * call-site name matching (which fails because call sites use method names while
 * the symbol index holds type/class names).
 *
 * Optionally applies the Platonic filter to collapse single-in/single-out
 * pass-through nodes.
 */
export async function buildRelationshipGraph(
  symbols: ClassifiedSymbol[],
  loader: TreeSitterQueryLoader,
  config: {
    callHierarchyDepth: number
    collapseIntermediates: boolean
  },
  token: vscode.CancellationToken,
): Promise<RelationshipGraph> {
  const symbolsByRef = new Map(symbols.map((s) => [symbolRef(s), s]))
  const symbolsByFile = new Map<string, ClassifiedSymbol[]>()
  for (const sym of symbols) {
    const arr = symbolsByFile.get(sym.filePath) ?? []
    arr.push(sym)
    symbolsByFile.set(sym.filePath, arr)
  }

  const adjacency = new Map<string, Set<string>>()

  if (config.callHierarchyDepth > 0) {
    await buildEdgesFromImports(symbols, symbolsByFile, adjacency, loader, token)
  }

  const inbound = buildInboundIndex(adjacency)

  let edgeLabels = new Map<string, string>()
  if (config.collapseIntermediates) {
    edgeLabels = applyPlatonicFilter(adjacency, inbound, symbolsByRef)
  }

  const edges: SymbolEdge[] = []
  const edgeSet = new Set<string>()
  for (const [src, dsts] of adjacency) {
    for (const dst of dsts) {
      const key = `${src}::${dst}`
      if (edgeSet.has(key)) continue
      edgeSet.add(key)
      const label = edgeLabels.get(key)
      edges.push({ srcRef: src, dstRef: dst, ...(label ? { label } : {}) })
    }
  }

  const reachableRefs = new Set(edges.flatMap((e) => [e.srcRef, e.dstRef]))
  logger.info('RelationshipMapper', 'graph built', { edges: edges.length, reachable: reachableRefs.size })
  return { edges, reachableRefs }
}

// ── Symbol ref ────────────────────────────────────────────────────────────────

export function symbolRef(sym: ClassifiedSymbol): string {
  return `${sym.filePath}::${sym.name}::${sym.startLine}`
}

// ── Import-based edge extraction ──────────────────────────────────────────────

/**
 * For each file, extract its imports via tree-sitter, resolve each import path
 * to files present in the symbol index, then add edges from every symbol in the
 * importing file to every symbol in the imported file.
 *
 * Resolution strategy (language-agnostic):
 *   1. Relative paths (start with "." or "/") — resolve against the importing
 *      file's directory, then match with/without extension or as index file.
 *   2. Package/module paths — strip the workspace module prefix if detectable,
 *      then match the remaining path segments as a suffix against known paths.
 *      Fallback: match the last segment as a directory name.
 *
 * Import extraction is driven by tree-sitter queries via the loader.
 */
async function buildEdgesFromImports(
  symbols: ClassifiedSymbol[],
  symbolsByFile: Map<string, ClassifiedSymbol[]>,
  adjacency: Map<string, Set<string>>,
  loader: TreeSitterQueryLoader,
  token: vscode.CancellationToken,
): Promise<void> {
  const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri
  if (!wsRoot) return

  const allFilePaths = [...symbolsByFile.keys()]

  // Detect the Go module path prefix (e.g. "github.com/org/project") so it can
  // be stripped from import paths before suffix matching.
  const goModPrefix = await detectGoModulePrefix(wsRoot)

  const processedFiles = new Set<string>()
  let totalEdges = 0

  for (const sym of symbols) {
    if (token.isCancellationRequested) break
    if (processedFiles.has(sym.filePath)) continue
    processedFiles.add(sym.filePath)

    try {
      const fileUri = vscode.Uri.joinPath(wsRoot, sym.filePath)
      const bytes = await vscode.workspace.fs.readFile(fileUri)
      const text = Buffer.from(bytes).toString('utf8')

      const rawImports = await loader.extractImports(text, sym.vscodeLangId)
      if (!rawImports.length) continue

      const srcSymbols = symbolsByFile.get(sym.filePath) ?? []
      if (!srcSymbols.length) continue

      for (const rawImport of rawImports) {
        const matchedFiles = resolveImport(rawImport, sym.filePath, allFilePaths, goModPrefix)
        for (const matchedFile of matchedFiles) {
          const dstSymbols = symbolsByFile.get(matchedFile) ?? []
          for (const srcSym of srcSymbols) {
            for (const dstSym of dstSymbols) {
              const srcRef = symbolRef(srcSym)
              const dstRef = symbolRef(dstSym)
              if (srcRef === dstRef) continue
              if (!adjacency.has(srcRef)) adjacency.set(srcRef, new Set())
              if (!adjacency.get(srcRef)!.has(dstRef)) {
                adjacency.get(srcRef)!.add(dstRef)
                totalEdges++
              }
            }
          }
        }
      }
    } catch (e) {
      logger.debug('RelationshipMapper', 'import edge extraction failed', {
        filePath: sym.filePath,
        error: String(e),
      })
    }
  }

  logger.info('RelationshipMapper', 'import-based edges extracted', {
    files: processedFiles.size,
    edges: totalEdges,
  })
}

/**
 * Resolve a raw import string to matching file paths in the symbol index.
 *
 * @param rawImport   The import path as captured by tree-sitter (may have quotes) or regex (no quotes)
 * @param fromFile    Workspace-relative path of the importing file
 * @param allPaths    All workspace-relative file paths that have symbols
 * @param goModPrefix Optional Go module path prefix to strip
 */
function resolveImport(
  rawImport: string,
  fromFile: string,
  allPaths: string[],
  goModPrefix: string | null,
): string[] {
  // Strip surrounding quotes (Go imports.scm captures the full string literal)
  const importPath = rawImport.replace(/^['"`]|['"`]$/g, '')
  return resolveImportPath(importPath, fromFile, allPaths, goModPrefix)
}

export function resolveImportPath(
  importPath: string,
  fromFile: string,
  allPaths: string[],
  goModPrefix: string | null,
): string[] {
  // Skip clearly external imports (stdlib-style or known external prefixes)
  if (isExternalImport(importPath)) return []

  const fromDir = fromFile.split('/').slice(0, -1).join('/')

  // ── Relative imports (TypeScript/JavaScript/Python with leading dot) ──────
  if (importPath.startsWith('.')) {
    const resolved = posixResolve(fromDir, importPath)
    return allPaths.filter((fp) =>
      fp === resolved ||
      fp.startsWith(resolved + '.') ||       // ./foo → foo.ts / foo.go
      fp.startsWith(resolved + '/index.'),   // ./foo → foo/index.ts
    )
  }

  // ── Go / absolute module imports ──────────────────────────────────────────
  let importRelPath = importPath

  // Strip the Go module prefix if we detected one
  if (goModPrefix && importPath.startsWith(goModPrefix)) {
    importRelPath = importPath.slice(goModPrefix.length).replace(/^\//, '')
  }

  // Direct suffix match: importRelPath might be the exact relative dir
  const suffixMatches = allPaths.filter((fp) => {
    const fpDir = fp.split('/').slice(0, -1).join('/')
    return fpDir === importRelPath ||
      fpDir.startsWith(importRelPath + '/') ||
      fp.startsWith(importRelPath + '/')
  })
  if (suffixMatches.length) return suffixMatches

  // Fallback: match last path segment as directory name
  const lastSegment = importRelPath.split('/').pop() ?? ''
  if (!lastSegment) return []
  return allPaths.filter((fp) => {
    const parts = fp.split('/')
    // Must appear as a directory component, not just the filename
    return parts.slice(0, -1).some((p) => p === lastSegment)
  })
}

/**
 * Returns true for imports that are definitely external / standard-library
 * and will never match a file in the symbol index.
 */
export function isExternalImport(importPath: string): boolean {
  // Go stdlib: single word, no slashes (e.g. "fmt", "os", "context")
  if (!importPath.includes('/') && !importPath.startsWith('.')) return true
  // Common external prefixes
  if (
    importPath.startsWith('node:') ||
    importPath.startsWith('bun:') ||
    importPath.startsWith('@types/') ||
    importPath.startsWith('std/')
  ) return true
  return false
}

/**
 * Resolve a POSIX relative path (e.g. "../services/foo") against a base dir.
 * Handles ".." components and normalises the result.
 */
export function posixResolve(baseDir: string, relPath: string): string {
  const parts = baseDir ? baseDir.split('/') : []
  for (const seg of relPath.split('/')) {
    if (seg === '..') parts.pop()
    else if (seg !== '.') parts.push(seg)
  }
  return parts.join('/')
}

/**
 * Reads go.mod from the workspace root and extracts the module path.
 * Returns null if go.mod is not found or unreadable.
 */
async function detectGoModulePrefix(wsRoot: vscode.Uri): Promise<string | null> {
  try {
    const goModUri = vscode.Uri.joinPath(wsRoot, 'go.mod')
    const bytes = await vscode.workspace.fs.readFile(goModUri)
    const text = Buffer.from(bytes).toString('utf8')
    const match = text.match(/^module\s+(\S+)/m)
    return match ? match[1] : null
  } catch {
    return null
  }
}

// ── Regex-based import extraction (fallback) ──────────────────────────────────

// Go
const GO_IMPORT_BLOCK = /import\s+\(([^)]+)\)/gs
const GO_IMPORT_QUOTED_IN_BLOCK = /"([^"]+)"/g
const GO_IMPORT_SINGLE = /^import\s+"([^"]+)"/gm
// TypeScript / JavaScript
const TS_JS_STATIC = /^import\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]/gm
const TS_JS_DYNAMIC = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/gm
const TS_JS_REQUIRE = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/gm
// Python
const PY_IMPORT = /^import\s+([\w.]+)/gm
const PY_FROM = /^from\s+([\w.]+)\s+import/gm
// Rust
const RUST_USE = /^use\s+([\w:]+)/gm

/**
 * Regex-based import extraction used as fallback when tree-sitter is unavailable.
 * Returns import paths WITHOUT surrounding quotes.
 */
export function extractImportsWithRegex(text: string, vscodeLangId: string): string[] {
  const paths: string[] = []

  if (vscodeLangId === 'go') {
    // Import blocks: import ( "path1" "path2" )
    GO_IMPORT_BLOCK.lastIndex = 0
    let block: RegExpExecArray | null
    while ((block = GO_IMPORT_BLOCK.exec(text)) !== null) {
      GO_IMPORT_QUOTED_IN_BLOCK.lastIndex = 0
      let q: RegExpExecArray | null
      while ((q = GO_IMPORT_QUOTED_IN_BLOCK.exec(block[1])) !== null) {
        paths.push(q[1])
      }
    }
    // Single imports: import "path"
    GO_IMPORT_SINGLE.lastIndex = 0
    let single: RegExpExecArray | null
    while ((single = GO_IMPORT_SINGLE.exec(text)) !== null) {
      if (!paths.includes(single[1])) paths.push(single[1])
    }
  } else if (vscodeLangId === 'typescript' || vscodeLangId === 'typescriptreact' ||
             vscodeLangId === 'javascript' || vscodeLangId === 'javascriptreact') {
    for (const re of [TS_JS_STATIC, TS_JS_DYNAMIC, TS_JS_REQUIRE]) {
      re.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = re.exec(text)) !== null) {
        if (!paths.includes(m[1])) paths.push(m[1])
      }
    }
  } else if (vscodeLangId === 'python') {
    for (const re of [PY_IMPORT, PY_FROM]) {
      re.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = re.exec(text)) !== null) {
        if (!paths.includes(m[1])) paths.push(m[1])
      }
    }
  } else if (vscodeLangId === 'rust') {
    RUST_USE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = RUST_USE.exec(text)) !== null) {
      if (!paths.includes(m[1])) paths.push(m[1])
    }
  }

  return paths
}

// ── Platonic filter ────────────────────────────────────────────────────────────

function applyPlatonicFilter(
  adjacency: Map<string, Set<string>>,
  inbound: Map<string, Set<string>>,
  symbolsByRef: Map<string, ClassifiedSymbol>,
): Map<string, string> {
  const edgeLabels = new Map<string, string>()
  let changed = true

  while (changed) {
    changed = false
    for (const [nodeRef, dsts] of [...adjacency.entries()]) {
      if (dsts.size !== 1) continue

      const ins = inbound.get(nodeRef)
      if (!ins || ins.size !== 1) continue

      const sym = symbolsByRef.get(nodeRef)
      if (!sym) continue
      if (SIDE_EFFECT_ROLES.has(sym.role)) continue

      const callerRef = [...ins][0]
      const calleeRef = [...dsts][0]

      if (callerRef === calleeRef) continue

      adjacency.get(callerRef)?.delete(nodeRef)
      adjacency.get(callerRef)?.add(calleeRef)
      inbound.get(calleeRef)?.delete(nodeRef)
      inbound.get(calleeRef)?.add(callerRef)
      adjacency.delete(nodeRef)
      inbound.delete(nodeRef)

      edgeLabels.set(`${callerRef}::${calleeRef}`, sym.name)
      changed = true
      break
    }
  }

  return edgeLabels
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function buildInboundIndex(adjacency: Map<string, Set<string>>): Map<string, Set<string>> {
  const inbound = new Map<string, Set<string>>()
  for (const [src, dsts] of adjacency) {
    for (const dst of dsts) {
      if (!inbound.has(dst)) inbound.set(dst, new Set())
      inbound.get(dst)!.add(src)
    }
  }
  return inbound
}

function findOwningSymbol(
  symbols: ClassifiedSymbol[],
  line: number,
): ClassifiedSymbol | null {
  if (!symbols?.length) return null
  let best: ClassifiedSymbol | null = null
  for (const sym of symbols) {
    if (sym.startLine <= line) best = sym
    else break
  }
  return best
}

// Suppress unused warning — kept for potential future callee-based augmentation
void findOwningSymbol
void path
