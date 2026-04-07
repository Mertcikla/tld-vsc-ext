import * as vscode from 'vscode'
import { logger } from '../logger'
import { indexFolder } from './FolderIndexer'
import { collectExternalLibraries, detectGoModulePath } from './ImportParser'
import { RoleClassifier, DEFAULT_IMPORT_ROLE_MAP } from './RoleClassifier'
import { TreeSitterQueryLoader } from './TreeSitterQueryLoader'
import { buildRelationshipGraph } from './RelationshipMapper'
import { groupSymbols } from './DiagramGrouper'
import { buildArchitecturePlan } from './ArchitecturePlanBuilder'
import { SOURCE_GLOB } from './symbolMapping'
import type { ExtensionApiClient } from '../api/ExtensionApiClient'
import type { ArchitecturalRole, CustomRolePattern } from './RoleClassifier'
import type { GrouperConfig } from './DiagramGrouper'

// ── Config types ──────────────────────────────────────────────────────────────

export interface ArchitectureAnalysisConfig {
  abstractionLevel: 'overview' | 'standard' | 'detailed'
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

// ── Presets ───────────────────────────────────────────────────────────────────

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

// ── Analyzer ──────────────────────────────────────────────────────────────────

export class ArchitectureAnalyzer {
  constructor(
    private readonly client: ExtensionApiClient,
    private readonly orgId: string,
    private readonly config: ArchitectureAnalysisConfig,
    private readonly extensionUri: vscode.Uri,
  ) {}

  /**
   * Runs the full analysis pipeline for the given folder URI.
   * Returns the root diagram ID (the top-level "Architecture" diagram).
   * Throws CancellationError if cancelled; cleans up partial diagrams on error.
   */
  async analyze(
    folderUri: vscode.Uri,
    token: vscode.CancellationToken,
    onProgress: (message: string) => void,
  ): Promise<number> {
    const projectName = folderUri.fsPath.split('/').pop()?.split('\\').pop() ?? 'Project'
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri

    // ── Phase 1: Index symbols ─────────────────────────────────────────────
    onProgress('Indexing symbols…')
    logger.info('ArchitectureAnalyzer', 'Phase 1: indexing', { folder: folderUri.fsPath })
    const rawSymbols = await indexFolder(folderUri, token, (done, total) => {
      onProgress(`Indexing… ${done}/${total} files`)
    })

    if (token.isCancellationRequested) throw new vscode.CancellationError()
    if (rawSymbols.length === 0) {
      throw new Error('No indexable symbols found in this folder.')
    }

    // Filter by minSymbolKinds
    const CLASSES_ONLY = new Set([
      vscode.SymbolKind.Class,
      vscode.SymbolKind.Struct,
      vscode.SymbolKind.Interface,
      vscode.SymbolKind.Module,
    ])
    const filteredSymbols = this.config.minSymbolKinds === 'classes'
      ? rawSymbols.filter((s) => CLASSES_ONLY.has(s.kind))
      : rawSymbols

    logger.info('ArchitectureAnalyzer', 'Phase 1 done', { raw: rawSymbols.length, filtered: filteredSymbols.length })

    // ── Phase 2: Detect external libraries ───────────────────────────────
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

    // ── Phase 3: Classify symbols ─────────────────────────────────────────
    onProgress('Classifying architectural roles…')
    logger.info('ArchitectureAnalyzer', 'Phase 3: classification')

    const loader = new TreeSitterQueryLoader(this.extensionUri, workspaceRoot)
    const importFingerprint = RoleClassifier.buildImportFingerprint(
      externalLibraries,
      this.config.importRoleMap,
    )
    const classifier = new RoleClassifier(loader, this.config.customRolePatterns, importFingerprint, this.config.disablePathHeuristics)
    const classified = await classifier.classifyAll(filteredSymbols, token)

    logger.info('ArchitectureAnalyzer', 'Phase 3 done', {
      classified: classified.length,
      roleCounts: countRoles(classified),
    })

    if (token.isCancellationRequested) throw new vscode.CancellationError()

    // ── Phase 4: Build relationship graph ─────────────────────────────────
    onProgress('Mapping call relationships…')
    logger.info('ArchitectureAnalyzer', 'Phase 4: relationship mapping')
    const graph = await buildRelationshipGraph(
      classified,
      loader,
      {
        callHierarchyDepth: this.config.callHierarchyDepth,
        collapseIntermediates: this.config.collapseIntermediates,
      },
      token,
    )

    logger.info('ArchitectureAnalyzer', 'Phase 4 done', { edges: graph.edges.length })
    if (token.isCancellationRequested) throw new vscode.CancellationError()

    // ── Phase 5: Group into diagram buckets ───────────────────────────────
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

    // ── Phase 6: Build plan ───────────────────────────────────────────────
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

    // ── Phase 7: Submit ───────────────────────────────────────────────────
    onProgress(`Uploading plan (${plan.diagrams.length} diagrams, ${plan.objects.length} objects)…`)
    logger.info('ArchitectureAnalyzer', 'Phase 7: submitting plan')

    // Cast to proto types — field names match exactly
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
    return rootDiagramId
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function countRoles(symbols: Array<{ role: string }>): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const s of symbols) counts[s.role] = (counts[s.role] ?? 0) + 1
  return counts
}
