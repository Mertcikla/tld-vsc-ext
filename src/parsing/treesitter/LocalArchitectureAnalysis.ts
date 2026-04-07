import * as fs from 'node:fs'
import * as path from 'node:path'
import { globSync } from 'glob'
import { countArchitectureArtifacts } from '../shared/architectureMetrics'
import { DEFAULT_IMPORT_ROLE_MAP } from '../shared/defaultImportRoleMap'
import {
  groupArchitecturalSymbols,
  type SharedDiagramGroup,
} from '../shared/diagramGrouping'
import {
  collectExternalLibrariesFromSources,
  detectGoModulePathFromText,
  type ExternalLibrary,
} from '../shared/externalLibraries'
import { resolveImportPath } from '../shared/imports'
import { matchArchitecturalRoleHeuristics } from '../shared/roleHeuristics'
import type { ArchitecturalRole } from '../shared/roles'
import {
  extractTreeSitterImports,
  matchTreeSitterRole,
  runTreeSitterQueryMatches,
} from './queryCore'
import { createCachedTreeSitterQueryTextResolver, type TreeSitterQueryTextResolver } from './queryTextResolver'
import type { KreuzbergModule } from './runtime'
import { prepareTreeSitterSource } from './source'
import type { ArchitectureParserMode, ResolvedArchitectureParserMode } from '../shared/types'

type LocalArchitecturalRole = ArchitecturalRole

type LocalSymbol = {
  name: string
  kind: string
  filePath: string
  startLine: number
}

type ClassifiedLocalSymbol = LocalSymbol & {
  role: LocalArchitecturalRole
  vscodeLangId: string
}

type SymbolEdge = {
  srcRef: string
  dstRef: string
}

export interface LocalArchitectureAnalysisOptions {
  repo: string
  level?: 'overview' | 'standard' | 'detailed'
  parserMode?: ArchitectureParserMode
  includeExternalLibraries?: boolean
  groupingStrategy?: 'folder' | 'role' | 'hybrid'
  disablePathHeuristics?: boolean
}

export interface LocalArchitectureAnalysisResult {
  repo: string
  level: 'overview' | 'standard' | 'detailed'
  parserMode: ResolvedArchitectureParserMode
  filesScanned: number
  indexedSymbols: number
  classifiedSymbols: number
  groups: number
  diagrams: number
  objects: number
  edges: number
  links: number
}

const SOURCE_GLOB = '**/*.{ts,tsx,js,jsx,go,py,rs,java,kt,swift,cpp,cc,cxx,c,h,hpp,cs,rb,vue}'
const DEFAULT_EXCLUDES = ['**/node_modules/**', '**/dist/**', '**/build/**', '**/out/**', '**/.git/**', '**/vendor/**', '**/target/**', '**/tmp/**']

const PRESETS = {
  overview: {
    callHierarchyDepth: 1,
    collapseIntermediates: true,
    includeUtilities: false,
    minSymbolKinds: 'all',
    targetObjectsPerDiagram: 8,
    maxObjectsPerDiagram: 12,
    minObjectsPerDiagram: 2,
  },
  standard: {
    callHierarchyDepth: 2,
    collapseIntermediates: true,
    includeUtilities: false,
    minSymbolKinds: 'all',
    targetObjectsPerDiagram: 10,
    maxObjectsPerDiagram: 15,
    minObjectsPerDiagram: 3,
  },
  detailed: {
    callHierarchyDepth: 3,
    collapseIntermediates: false,
    includeUtilities: true,
    minSymbolKinds: 'all',
    targetObjectsPerDiagram: 12,
    maxObjectsPerDiagram: 18,
    minObjectsPerDiagram: 3,
  },
} as const

let packPromise: Promise<KreuzbergModule> | null = null

function getTreeSitterPack(): Promise<KreuzbergModule> {
  if (!packPromise) {
    packPromise = (async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pack = require('@kreuzberg/tree-sitter-language-pack') as KreuzbergModule
      pack.download?.(['typescript', 'javascript', 'go', 'python', 'rust', 'java', 'csharp', 'ruby', 'cpp'])
      return pack
    })()
  }

  return packPromise
}

function toRel(repoRoot: string, absPath: string): string {
  return path.relative(repoRoot, absPath).split(path.sep).join('/')
}

function createLocalQueryTextResolver(repoRoot: string): TreeSitterQueryTextResolver {
  return createCachedTreeSitterQueryTextResolver(async (langId, queryName) => {
    const override = path.join(repoRoot, '.tldiagram', 'queries', langId, `${queryName}.scm`)
    if (fs.existsSync(override)) return fs.readFileSync(override, 'utf8')

    const builtin = path.join(__dirname, '..', '..', 'queries', langId, `${queryName}.scm`)
    if (fs.existsSync(builtin)) return fs.readFileSync(builtin, 'utf8')

    return null
  })
}

function kindBucket(structureKind: string | undefined): string | null {
  const kind = String(structureKind ?? '').toLowerCase()
  if (kind.includes('class')) return 'class'
  if (kind.includes('interface')) return 'interface'
  if (kind.includes('module') || kind.includes('namespace') || kind.includes('package')) return 'module'
  if (kind.includes('struct')) return 'struct'
  if (kind.includes('enum')) return 'enum'
  if (kind.includes('function') || kind.includes('method') || kind.includes('constructor')) return 'function'
  return null
}

async function classifyRole(
  pack: KreuzbergModule,
  sym: LocalSymbol,
  fileText: string,
  lang: string,
  importRole: LocalArchitecturalRole | undefined,
  resolveQueryText: TreeSitterQueryTextResolver,
  disablePathHeuristics: boolean,
): Promise<LocalArchitecturalRole> {
  if (lang && fileText) {
    const matchedRole = await matchTreeSitterRole(pack, fileText, lang, sym.startLine, resolveQueryText)
    if (matchedRole) return matchedRole
  }

  if (importRole) return importRole

  const heuristicMatch = matchArchitecturalRoleHeuristics(sym.name, sym.filePath, disablePathHeuristics)
  if (heuristicMatch) return heuristicMatch.role

  return 'unknown'
}

function importRoleFingerprint(externalLibraries: Map<string, ExternalLibrary>): Map<string, LocalArchitecturalRole> {
  const fingerprint = new Map<string, LocalArchitecturalRole>()
  for (const [libraryName, library] of externalLibraries) {
    const lower = libraryName.toLowerCase()
    let role: LocalArchitecturalRole | null = null
    for (const [pattern, value] of Object.entries(DEFAULT_IMPORT_ROLE_MAP)) {
      if (lower.includes(pattern)) {
        role = value as LocalArchitecturalRole
        break
      }
    }
    if (!role) continue
    for (const filePath of library.importedBy) fingerprint.set(filePath, role)
  }
  return fingerprint
}

function symbolRef(sym: LocalSymbol): string {
  return `${sym.filePath}::${sym.name}::${sym.startLine}`
}

function applyPlatonicFilter(edges: SymbolEdge[], symbols: ClassifiedLocalSymbol[]): SymbolEdge[] {
  const adjacency = new Map<string, Set<string>>()
  const inbound = new Map<string, Set<string>>()
  const sideEffectRoles = new Set(['api_entry', 'repository', 'data_exit', 'external'])
  const symbolsByRef = new Map(symbols.map((sym) => [symbolRef(sym), sym]))

  for (const edge of edges) {
    if (!adjacency.has(edge.srcRef)) adjacency.set(edge.srcRef, new Set())
    adjacency.get(edge.srcRef)?.add(edge.dstRef)
    if (!inbound.has(edge.dstRef)) inbound.set(edge.dstRef, new Set())
    inbound.get(edge.dstRef)?.add(edge.srcRef)
  }

  let changed = true
  while (changed) {
    changed = false
    for (const [nodeRef, targets] of [...adjacency.entries()]) {
      if (targets.size !== 1) continue
      const sources = inbound.get(nodeRef)
      if (!sources || sources.size !== 1) continue
      const symbol = symbolsByRef.get(nodeRef)
      if (!symbol || sideEffectRoles.has(symbol.role)) continue

      const sourceRef = [...sources][0]
      const targetRef = [...targets][0]
      if (sourceRef === targetRef) continue

      adjacency.get(sourceRef)?.delete(nodeRef)
      adjacency.get(sourceRef)?.add(targetRef)
      inbound.get(targetRef)?.delete(nodeRef)
      inbound.get(targetRef)?.add(sourceRef)
      adjacency.delete(nodeRef)
      inbound.delete(nodeRef)
      changed = true
      break
    }
  }

  const result: SymbolEdge[] = []
  const seen = new Set<string>()
  for (const [source, targets] of adjacency) {
    for (const target of targets) {
      const key = `${source}::${target}`
      if (seen.has(key)) continue
      seen.add(key)
      result.push({ srcRef: source, dstRef: target })
    }
  }

  return result
}

export async function analyzeLocalArchitecture(
  options: LocalArchitectureAnalysisOptions,
): Promise<LocalArchitectureAnalysisResult> {
  const repoRoot = path.resolve(options.repo)
  const level = options.level ?? 'standard'
  const requestedParserMode = options.parserMode ?? 'treesitter'

  if (requestedParserMode === 'lsp') {
    throw new Error('Local benchmark runner does not support parserMode=lsp outside the VS Code host. Use parserMode=treesitter for the local path.')
  }

  const preset = PRESETS[level]
  const includeExternalLibraries = options.includeExternalLibraries ?? true
  const groupingStrategy = options.groupingStrategy ?? 'hybrid'
  const disablePathHeuristics = options.disablePathHeuristics ?? false
  const pack = await getTreeSitterPack()
  const resolveQueryText = createLocalQueryTextResolver(repoRoot)

  const files = globSync(SOURCE_GLOB, {
    cwd: repoRoot,
    nodir: true,
    ignore: DEFAULT_EXCLUDES,
    absolute: true,
  })

  const fileData = new Map<string, { text: string; lang: string }>()
  const sourceEntries: Array<{ filePath: string; text: string; language: string }> = []
  const symbols: LocalSymbol[] = []
  let goModulePath: string | undefined

  const goModPath = path.join(repoRoot, 'go.mod')
  if (fs.existsSync(goModPath)) {
    goModulePath = detectGoModulePathFromText(fs.readFileSync(goModPath, 'utf8'))
  }

  for (const absPath of files) {
    const relPath = toRel(repoRoot, absPath)
    const rawText = fs.readFileSync(absPath, 'utf8')
    const prepared = prepareTreeSitterSource(relPath, rawText)
    if (!prepared) continue

    fileData.set(relPath, prepared)
    sourceEntries.push({
      filePath: relPath,
      text: prepared.text,
      language: prepared.lang,
    })

    let parsedSymbols = 0
    try {
      const structure = pack.process(prepared.text, { language: prepared.lang, structure: true }).structure ?? []
      for (const item of structure) {
        const kind = kindBucket(item.kind)
        const name = item.name
        if (!kind || !name) continue
        symbols.push({
          name,
          kind,
          filePath: relPath,
          startLine: item.span?.startRow ?? 0,
        })
        parsedSymbols++
      }
    } catch {
      // Skip files that Kreuzberg fails to parse.
    }

    if (parsedSymbols === 0 && prepared.lang === 'cpp') {
      const matches = runTreeSitterQueryMatches(
        pack,
        prepared.text,
        prepared.lang,
        'cpp_fallback',
        [
          '(class_specifier name: (type_identifier) @name) @class',
          '(struct_specifier name: (type_identifier) @name) @struct',
          '(function_definition declarator: (function_declarator declarator: (identifier) @name)) @func',
        ].join('\n'),
      )
      for (const match of matches) {
        let name = ''
        let startLine = 0
        for (const capture of match.captures ?? []) {
          if (capture.name === 'name' && capture.text) name = capture.text
          if (capture.node) startLine = capture.node.startRow ?? capture.node.row ?? 0
        }
        if (name) symbols.push({ name, kind: 'class', filePath: relPath, startLine })
      }
    }
  }

  const externalLibraries = collectExternalLibrariesFromSources(
    sourceEntries,
    goModulePath,
  )

  const classesOnly = new Set(['class', 'struct', 'interface', 'module'])
  const filteredSymbols = preset.minSymbolKinds === 'classes'
    ? symbols.filter((sym) => classesOnly.has(sym.kind))
    : symbols
  const importFingerprint = importRoleFingerprint(externalLibraries)

  const classified: ClassifiedLocalSymbol[] = []
  for (const sym of filteredSymbols) {
    const file = fileData.get(sym.filePath)
    classified.push({
      ...sym,
      role: await classifyRole(
        pack,
        sym,
        file?.text ?? '',
        file?.lang ?? '',
        importFingerprint.get(sym.filePath),
        resolveQueryText,
        disablePathHeuristics,
      ),
      vscodeLangId: file?.lang ?? '',
    })
  }

  const symbolsByFile = new Map<string, ClassifiedLocalSymbol[]>()
  for (const sym of classified) {
    const current = symbolsByFile.get(sym.filePath) ?? []
    current.push(sym)
    symbolsByFile.set(sym.filePath, current)
  }

  let edges: SymbolEdge[] = []
  if (preset.callHierarchyDepth > 0) {
    const edgeSet = new Set<string>()
    const allPaths = [...symbolsByFile.keys()]
    for (const [filePath, sourceSymbols] of symbolsByFile.entries()) {
      const file = fileData.get(filePath)
      if (!file) continue

      const imports = await extractTreeSitterImports(pack, file.text, file.lang, resolveQueryText)
      for (const rawImport of imports) {
        const importPath = String(rawImport).replace(/^['"`]|['"`]$/g, '')
        for (const targetFile of resolveImportPath(importPath, filePath, allPaths, goModulePath ?? null)) {
          const targetSymbols = symbolsByFile.get(targetFile) ?? []
          for (const source of sourceSymbols) {
            for (const target of targetSymbols) {
              const sourceRef = symbolRef(source)
              const targetRef = symbolRef(target)
              if (sourceRef === targetRef) continue
              const key = `${sourceRef}::${targetRef}`
              if (edgeSet.has(key)) continue
              edgeSet.add(key)
              edges.push({ srcRef: sourceRef, dstRef: targetRef })
            }
          }
        }
      }
    }
  }

  if (preset.collapseIntermediates) {
    edges = applyPlatonicFilter(edges, classified)
  }

  const groups = groupArchitecturalSymbols(classified, edges, {
    groupingStrategy,
    targetObjectsPerDiagram: preset.targetObjectsPerDiagram,
    maxObjectsPerDiagram: preset.maxObjectsPerDiagram,
    minObjectsPerDiagram: preset.minObjectsPerDiagram,
    includeUtilities: preset.includeUtilities,
  })

  const counts = countArchitectureArtifacts(
    groups as Array<Pick<SharedDiagramGroup<ClassifiedLocalSymbol>, 'ref' | 'symbols'>>,
    edges,
    externalLibraries.size,
    includeExternalLibraries,
  )
  return {
    repo: repoRoot,
    level,
    parserMode: 'treesitter',
    filesScanned: files.length,
    indexedSymbols: symbols.length,
    classifiedSymbols: classified.length,
    groups: groups.length,
    ...counts,
  }
}