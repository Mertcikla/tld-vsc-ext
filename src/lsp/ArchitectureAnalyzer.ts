import * as vscode from 'vscode'
import { logger } from '../logger'
import type { ExtensionApiClient } from '../api/ExtensionApiClient'
import { indexFolder } from '../parsing/lsp/LspSymbolIndexer'
import {
  createAutoFallbackResolution,
  createParserResolution,
} from '../parsing/shared/parserMode'
import type {
  ArchitectureAnalysisRunResult,
  ArchitectureParserMode,
  IndexedSymbol,
  ParserResolution,
} from '../parsing/shared/types'
import { TreeSitterQueryLoader } from '../parsing/treesitter/TreeSitterQueryLoader'
import { indexFolderWithTreeSitter } from '../parsing/treesitter/TreeSitterSymbolIndexer'
import { buildArchitecturePlan } from './ArchitecturePlanBuilder'
import type { GrouperConfig } from './DiagramGrouper'
import { groupSymbols } from './DiagramGrouper'
import { collectExternalLibraries, detectGoModulePath } from './ImportParser'
import { buildRelationshipGraph } from './RelationshipMapper'
import { DEFAULT_IMPORT_ROLE_MAP } from '../parsing/shared/defaultImportRoleMap'
import type { ArchitecturalRole } from '../parsing/shared/roles'
import { RoleClassifier } from './RoleClassifier'
import type { CustomRolePattern } from './RoleClassifier'
import { SOURCE_GLOB } from './symbolMapping'

export interface ArchitectureAnalysisConfig {
  abstractionLevel: 'overview' | 'standard' | 'detailed'
  parserMode: ArchitectureParserMode
  showParserWarnings: boolean
  targetObjectsPerDiagram: number
  maxObjectsPerDiagram: number
  minObjectsPerDiagram: number
  callHierarchyDepth: number
  groupingStrategy: 'folder' | 'role' | 'hybrid'
  collapseIntermediates: boolean
  includeExternalLibraries: boolean
  includeUtilities: boolean
  minSymbolKinds: 'classes' | 'all'
  disablePathHeuristics?: boolean
  importRoleMap: Record<string, ArchitecturalRole>
  customRolePatterns: CustomRolePattern[]
}

export const PRESETS: Record<'overview' | 'standard' | 'detailed', Partial<ArchitectureAnalysisConfig>> = {
  overview: {
    callHierarchyDepth: 1,
    collapseIntermediates: true,
    includeUtilities: false,
    minSymbolKinds: 'classes',
    targetObjectsPerDiagram: 8,
    maxObjectsPerDiagram: 12,
    minObjectsPerDiagram: 2,
  },
  standard: {
    callHierarchyDepth: 2,
    collapseIntermediates: true,
    includeUtilities: false,
    minSymbolKinds: 'classes',
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
}

const BASE_CONFIG: ArchitectureAnalysisConfig = {
  abstractionLevel: 'standard',
  parserMode: 'auto',
  showParserWarnings: true,
  targetObjectsPerDiagram: 10,
  maxObjectsPerDiagram: 15,
  minObjectsPerDiagram: 3,
  callHierarchyDepth: 2,
  groupingStrategy: 'hybrid',
  collapseIntermediates: true,
  includeExternalLibraries: true,
  includeUtilities: false,
  minSymbolKinds: 'classes',
  importRoleMap: DEFAULT_IMPORT_ROLE_MAP,
  customRolePatterns: [],
}

export function resolveConfig(overrides: Partial<ArchitectureAnalysisConfig>): ArchitectureAnalysisConfig {
  const level = overrides.abstractionLevel ?? BASE_CONFIG.abstractionLevel
  const preset = PRESETS[level] ?? {}
  return { ...BASE_CONFIG, ...preset, ...overrides }
}

export class ArchitectureAnalyzer {
  constructor(
    private readonly client: ExtensionApiClient,
    private readonly orgId: string,
    private readonly config: ArchitectureAnalysisConfig,
    private readonly extensionUri: vscode.Uri,
  ) {}

  async analyze(
    folderUri: vscode.Uri,
    token: vscode.CancellationToken,
    onProgress: (message: string) => void,
  ): Promise<number> {
    const result = await this.analyzeDetailed(folderUri, token, onProgress)
    return result.rootDiagramId
  }

  async analyzeDetailed(
    folderUri: vscode.Uri,
    token: vscode.CancellationToken,
    onProgress: (message: string) => void,
  ): Promise<ArchitectureAnalysisRunResult> {
    const projectName = folderUri.fsPath.split('/').pop()?.split('\\').pop() ?? 'Project'
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri
    const treeSitterLoader = new TreeSitterQueryLoader(this.extensionUri, workspaceRoot)

    onProgress('Indexing symbols…')
    logger.info('ArchitectureAnalyzer', 'Phase 1: indexing', { folder: folderUri.fsPath })
    const { rawSymbols, parserResolution } = await this.indexSymbols(
      folderUri,
      token,
      treeSitterLoader,
      (done, total) => {
        onProgress(`Indexing… ${done}/${total} files`)
      },
    )

    if (parserResolution.didFallback) {
      logger.warn('ArchitectureAnalyzer', 'Parser fallback applied', parserResolution)
    } else {
      logger.info('ArchitectureAnalyzer', 'Parser selected', parserResolution)
    }

    if (token.isCancellationRequested) throw new vscode.CancellationError()
    if (rawSymbols.length === 0) {
      throw new Error('No indexable symbols found in this folder.')
    }

    const filteredSymbols = this.filterIndexedSymbols(rawSymbols)
    logger.info('ArchitectureAnalyzer', 'Phase 1 done', {
      raw: rawSymbols.length,
      filtered: filteredSymbols.length,
      parserMode: parserResolution.resolvedMode,
    })

    onProgress('Detecting external libraries…')
    logger.info('ArchitectureAnalyzer', 'Phase 2: import parsing')
    let externalLibraries = new Map<string, import('./ImportParser').ExternalLibrary>()

    try {
      const srcUris = await vscode.workspace.findFiles(
        new vscode.RelativePattern(folderUri, SOURCE_GLOB),
        null,
      )
      const fileEntries = srcUris.map((u) => ({
        uri: u,
        relPath: workspaceRoot && u.fsPath.startsWith(workspaceRoot.fsPath + '/')
          ? u.fsPath.slice(workspaceRoot.fsPath.length + 1)
          : u.fsPath,
      }))
      const goModPath = await detectGoModulePath(folderUri)
      externalLibraries = await collectExternalLibraries(fileEntries, goModPath, token)
      logger.info('ArchitectureAnalyzer', 'Phase 2 done', { externalLibs: externalLibraries.size })
    } catch (e) {
      logger.warn('ArchitectureAnalyzer', 'import parsing failed (non-fatal)', { error: String(e) })
    }

    if (token.isCancellationRequested) throw new vscode.CancellationError()

    onProgress('Classifying architectural roles…')
    logger.info('ArchitectureAnalyzer', 'Phase 3: classification')
    const importFingerprint = RoleClassifier.buildImportFingerprint(
      externalLibraries,
      this.config.importRoleMap,
    )
    const classifier = new RoleClassifier(
      parserResolution.resolvedMode === 'treesitter' ? treeSitterLoader : null,
      this.config.customRolePatterns,
      importFingerprint,
      this.config.disablePathHeuristics,
    )
    const classified = await classifier.classifyAll(filteredSymbols, token)

    logger.info('ArchitectureAnalyzer', 'Phase 3 done', {
      classified: classified.length,
      roleCounts: countRoles(classified),
    })

    if (token.isCancellationRequested) throw new vscode.CancellationError()

    onProgress('Mapping call relationships…')
    logger.info('ArchitectureAnalyzer', 'Phase 4: relationship mapping')
    const graph = await buildRelationshipGraph(
      classified,
      parserResolution.resolvedMode === 'treesitter' ? treeSitterLoader : null,
      {
        parserMode: parserResolution.resolvedMode,
        callHierarchyDepth: this.config.callHierarchyDepth,
        collapseIntermediates: this.config.collapseIntermediates,
      },
      token,
    )

    logger.info('ArchitectureAnalyzer', 'Phase 4 done', { edges: graph.edges.length })
    if (token.isCancellationRequested) throw new vscode.CancellationError()

    onProgress('Grouping into diagrams…')
    logger.info('ArchitectureAnalyzer', 'Phase 5: grouping')
    const grouperConfig: GrouperConfig = {
      groupingStrategy: this.config.groupingStrategy,
      targetObjectsPerDiagram: this.config.targetObjectsPerDiagram,
      maxObjectsPerDiagram: this.config.maxObjectsPerDiagram,
      minObjectsPerDiagram: this.config.minObjectsPerDiagram,
      includeUtilities: this.config.includeUtilities,
    }
    const groups = groupSymbols(classified, graph, grouperConfig)

    if (groups.length === 0) {
      throw new Error('No symbol groups found. Try "Detailed" level or a different folder.')
    }

    logger.info('ArchitectureAnalyzer', 'Phase 5 done', { groups: groups.length })

    onProgress('Assembling plan…')
    logger.info('ArchitectureAnalyzer', 'Phase 6: plan assembly')
    const plan = buildArchitecturePlan(groups, graph, externalLibraries, {
      levelLabel: this.config.abstractionLevel.charAt(0).toUpperCase() + this.config.abstractionLevel.slice(1),
      includeExternalLibraries: this.config.includeExternalLibraries,
      projectName,
    })

    logger.info('ArchitectureAnalyzer', 'Phase 6 done', {
      diagrams: plan.diagrams.length,
      objects: plan.objects.length,
      edges: plan.edges.length,
      links: plan.links.length,
    })

    onProgress(`Uploading plan (${plan.diagrams.length} diagrams, ${plan.objects.length} objects)…`)
    logger.info('ArchitectureAnalyzer', 'Phase 7: submitting plan')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const refToId = await this.client.applyPlanFull({
      orgId: this.orgId,
      diagrams: plan.diagrams as any,
      objects: plan.objects as any,
      edges: plan.edges as any,
      links: plan.links as any,
    })

    const rootDiagramId = refToId['arch_root']
    if (!rootDiagramId) {
      throw new Error('Plan submitted but root diagram ID not returned — check server logs.')
    }

    logger.info('ArchitectureAnalyzer', 'Analysis complete', { rootDiagramId })
    return {
      rootDiagramId,
      parser: parserResolution,
    }
  }

  private filterIndexedSymbols(rawSymbols: IndexedSymbol[]): IndexedSymbol[] {
    const classesOnly = new Set([
      vscode.SymbolKind.Class,
      vscode.SymbolKind.Struct,
      vscode.SymbolKind.Interface,
      vscode.SymbolKind.Module,
    ])

    return this.config.minSymbolKinds === 'classes'
      ? rawSymbols.filter((s) => classesOnly.has(s.kind))
      : rawSymbols
  }

  private async indexSymbols(
    folderUri: vscode.Uri,
    token: vscode.CancellationToken,
    treeSitterLoader: TreeSitterQueryLoader,
    onProgress: (done: number, total: number) => void,
  ): Promise<{ rawSymbols: IndexedSymbol[]; parserResolution: ParserResolution }> {
    const requestedMode = this.config.parserMode
    const tryLsp = async (): Promise<IndexedSymbol[]> => indexFolder(folderUri, token, onProgress)
    const tryTreeSitter = async (): Promise<IndexedSymbol[]> => indexFolderWithTreeSitter(folderUri, token, onProgress)

    if (requestedMode === 'treesitter') {
      const treeSitterAvailable = await treeSitterLoader.isAvailable()
      if (treeSitterAvailable) {
        const treeSitterSymbols = await tryTreeSitter()
        if (treeSitterSymbols.length > 0) {
          return {
            rawSymbols: treeSitterSymbols,
            parserResolution: createParserResolution('treesitter', 'treesitter'),
          }
        }
      }

      const rawSymbols = await tryLsp()
      return {
        rawSymbols,
        parserResolution: createParserResolution(
          'treesitter',
          'lsp',
          treeSitterAvailable
            ? 'Tree-sitter indexing returned no indexable symbols.'
            : `Tree-sitter is unavailable.${treeSitterLoader.getInitError() ? ` ${treeSitterLoader.getInitError()}` : ''}`,
        ),
      }
    }

    try {
      const lspSymbols = await tryLsp()
      if (lspSymbols.length > 0) {
        return {
          rawSymbols: lspSymbols,
          parserResolution: createParserResolution(requestedMode, 'lsp'),
        }
      }
    } catch (e) {
      logger.warn('ArchitectureAnalyzer', 'LSP indexing failed', { error: String(e) })
    }

    const treeSitterAvailable = await treeSitterLoader.isAvailable()
    if (treeSitterAvailable) {
      const treeSitterSymbols = await tryTreeSitter()
      if (treeSitterSymbols.length > 0) {
        return {
          rawSymbols: treeSitterSymbols,
          parserResolution: requestedMode === 'auto'
            ? createAutoFallbackResolution('treesitter', 'LSP indexing returned no indexable symbols.')
            : createParserResolution('lsp', 'treesitter', 'LSP indexing returned no indexable symbols.'),
        }
      }
    }

    return {
      rawSymbols: [],
      parserResolution: createParserResolution(
        requestedMode,
        'lsp',
        treeSitterAvailable ? 'Both parsers returned no indexable symbols.' : 'Tree-sitter is unavailable and LSP indexing returned no symbols.',
      ),
    }
  }
}

function countRoles(symbols: Array<{ role: string }>): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const s of symbols) counts[s.role] = (counts[s.role] ?? 0) + 1
  return counts
}