import { kindToObjectType } from './symbolMapping'
import type { DiagramGroup } from './DiagramGrouper'
import type { ArchitecturalSymbolEdge } from '../parsing/shared/diagramGrouping'
import type { ExternalLibrary } from './ImportParser'
import type { ClassifiedSymbol } from './RoleClassifier'

// These mirror the proto PlanX types but are plain objects — the caller
// casts them to the proto types before calling applyPlanFull.
export interface PlanDiagramInput {
  ref: string
  name: string
  levelLabel?: string
  parentDiagramRef?: string
}

export interface PlanObjectInput {
  ref: string
  name: string
  type: string
  filePath?: string
  tags: string[]
  technologyLinks: []
  placements: Array<{ diagramRef: string; positionX: number; positionY: number }>
}

export interface PlanEdgeInput {
  diagramRef: string
  sourceObjectRef: string
  targetObjectRef: string
  label?: string
}

export interface PlanLinkInput {
  objectRef: string
  fromDiagramRef: string
  toDiagramRef: string
}

export interface ArchitecturePlan {
  diagrams: PlanDiagramInput[]
  objects: PlanObjectInput[]
  edges: PlanEdgeInput[]
  links: PlanLinkInput[]
}

const ROOT_REF = 'arch_root'
const EXTERNAL_REF = 'grp_external'
const GRID_COL_W = 240
const GRID_ROW_H = 160
const GRID_COLS = 5

/**
 * Converts DiagramGroups + relationship graph into an ArchitecturePlan
 * ready to submit via applyPlanFull.
 */
export function buildArchitecturePlan(
  groups: DiagramGroup[],
  selectedEdges: ArchitecturalSymbolEdge[],
  externalLibraries: Map<string, ExternalLibrary>,
  config: {
    levelLabel: string
    includeExternalLibraries: boolean
    projectName: string
  },
): ArchitecturePlan {
  const hasExternal = config.includeExternalLibraries && externalLibraries.size > 0

  // ── Diagrams ────────────────────────────────────────────────────────────────

  const diagrams: PlanDiagramInput[] = [
    {
      ref: ROOT_REF,
      name: `${config.projectName} Architecture`,
      levelLabel: config.levelLabel,
    },
    ...groups.map((g) => ({
      ref: g.ref,
      name: g.name,
      parentDiagramRef: ROOT_REF,
    })),
  ]

  if (hasExternal) {
    diagrams.push({
      ref: EXTERNAL_REF,
      name: 'External Dependencies',
      parentDiagramRef: ROOT_REF,
    })
  }

  // ── Layouts ─────────────────────────────────────────────────────────────────

  const rootLayout = computeRootLayout(groups, hasExternal)
  const groupLayouts = new Map<string, Map<string, { x: number; y: number }>>()
  for (const group of groups) {
    groupLayouts.set(group.ref, computeGroupLayout(group.symbols))
  }

  // ── Objects ─────────────────────────────────────────────────────────────────

  const objects: PlanObjectInput[] = []
  const clusterRefs = new Map<string, string>()  // groupRef → clusterObjectRef

  // 1. Cluster objects on root diagram (one per group)
  for (const group of groups) {
    const clusterRef = `cluster_${group.ref}`
    clusterRefs.set(group.ref, clusterRef)
    const pos = rootLayout.get(group.ref) ?? { x: 0, y: 0 }
    objects.push({
      ref: clusterRef,
      name: group.name,
      type: 'container',
      tags: ['cluster'],
      technologyLinks: [],
      placements: [{ diagramRef: ROOT_REF, positionX: pos.x, positionY: pos.y }],
    })
  }

  // 2. Detail objects on each group's diagram
  for (const group of groups) {
    const layout = groupLayouts.get(group.ref) ?? new Map()
    for (const sym of group.symbols) {
      const symRef = `${sym.filePath.replace(/[^a-z0-9]/gi, '_')}__${sym.name}`
      const pos = layout.get(symbolKey(sym)) ?? { x: 0, y: 0 }
      objects.push({
        ref: sanitizeRef(symRef),
        name: sym.name,
        type: kindToObjectType(sym.kind),
        filePath: sym.filePath,
        tags: [sym.role],
        technologyLinks: [],
        placements: [{ diagramRef: group.ref, positionX: pos.x, positionY: pos.y }],
      })
    }
  }

  // 3. External cluster object on root diagram
  if (hasExternal) {
    const extPos = rootLayout.get(EXTERNAL_REF) ?? { x: (groups.length % GRID_COLS) * GRID_COL_W, y: Math.floor(groups.length / GRID_COLS) * GRID_ROW_H }
    objects.push({
      ref: `cluster_${EXTERNAL_REF}`,
      name: 'External Dependencies',
      type: 'external_system',
      tags: ['cluster', 'external'],
      technologyLinks: [],
      placements: [{ diagramRef: ROOT_REF, positionX: extPos.x, positionY: extPos.y }],
    })

    // 4. Individual external library objects on the external diagram
    const libEntries = [...externalLibraries.values()]
    libEntries.forEach((lib, i) => {
      const x = (i % GRID_COLS) * GRID_COL_W
      const y = Math.floor(i / GRID_COLS) * GRID_ROW_H
      objects.push({
        ref: sanitizeRef(`ext_${lib.name}`),
        name: lib.name,
        type: 'external_system',
        tags: ['external'],
        technologyLinks: [],
        placements: [{ diagramRef: EXTERNAL_REF, positionX: x, positionY: y }],
      })
    })
  }

  // ── Edges ───────────────────────────────────────────────────────────────────

  // Build symbol-ref → group + object-ref lookup
  const symRefToGroupRef = new Map<string, string>()
  const symRefToObjRef = new Map<string, string>()
  for (const group of groups) {
    for (const sym of group.symbols) {
      const key = symbolKey(sym)
      const objRef = sanitizeRef(`${sym.filePath.replace(/[^a-z0-9]/gi, '_')}__${sym.name}`)
      symRefToGroupRef.set(key, group.ref)
      symRefToObjRef.set(key, objRef)
    }
  }

  const planEdges: PlanEdgeInput[] = []

  // Root-level edges: between cluster objects for cross-group dependencies
  const rootEdgeSet = new Set<string>()
  for (const edge of selectedEdges) {
    const srcGroupRef = symRefToGroupRef.get(edge.srcRef)
    const dstGroupRef = symRefToGroupRef.get(edge.dstRef)

    if (srcGroupRef && dstGroupRef && srcGroupRef !== dstGroupRef) {
      const srcCluster = clusterRefs.get(srcGroupRef)!
      const dstCluster = clusterRefs.get(dstGroupRef)!
      const edgeKey = `${srcCluster}::${dstCluster}`
      if (!rootEdgeSet.has(edgeKey)) {
        rootEdgeSet.add(edgeKey)
        planEdges.push({
          diagramRef: ROOT_REF,
          sourceObjectRef: srcCluster,
          targetObjectRef: dstCluster,
          ...(edge.label ? { label: edge.label } : {}),
        })
      }
    }
  }

  // Cross-group → external cluster edge
  if (hasExternal) {
    const extClusterRef = `cluster_${EXTERNAL_REF}`
    const externalLibNames = new Set([...externalLibraries.keys()].map((n) => sanitizeRef(`ext_${n}`)))
    const groupsWithExternalDeps = new Set<string>()

    for (const edge of selectedEdges) {
      const dstObjRef = symRefToObjRef.get(edge.dstRef)
      if (dstObjRef && externalLibNames.has(dstObjRef)) {
        const srcGroupRef = symRefToGroupRef.get(edge.srcRef)
        if (srcGroupRef) groupsWithExternalDeps.add(srcGroupRef)
      }
    }

    for (const groupRef of groupsWithExternalDeps) {
      const srcCluster = clusterRefs.get(groupRef)
      if (!srcCluster) continue
      const edgeKey = `${srcCluster}::${extClusterRef}`
      if (!rootEdgeSet.has(edgeKey)) {
        rootEdgeSet.add(edgeKey)
        planEdges.push({
          diagramRef: ROOT_REF,
          sourceObjectRef: srcCluster,
          targetObjectRef: extClusterRef,
        })
      }
    }
  }

  // Within-group edges: between detail objects on the group's diagram
  for (const group of groups) {
    const groupSymRefs = new Set(group.symbols.map(symbolKey))
    const groupEdgeSet = new Set<string>()

    for (const edge of selectedEdges) {
      const srcInGroup = groupSymRefs.has(edge.srcRef)
      const dstInGroup = groupSymRefs.has(edge.dstRef)

      if (srcInGroup && dstInGroup) {
        const srcObjRef = symRefToObjRef.get(edge.srcRef)
        const dstObjRef = symRefToObjRef.get(edge.dstRef)
        if (!srcObjRef || !dstObjRef) continue

        const edgeKey = `${srcObjRef}::${dstObjRef}`
        if (!groupEdgeSet.has(edgeKey)) {
          groupEdgeSet.add(edgeKey)
          planEdges.push({
            diagramRef: group.ref,
            sourceObjectRef: srcObjRef,
            targetObjectRef: dstObjRef,
            ...(edge.label ? { label: edge.label } : {}),
          })
        }
      }
    }
  }

  // ── Links (drill-down) ──────────────────────────────────────────────────────

  const links: PlanLinkInput[] = groups.map((g) => ({
    objectRef: clusterRefs.get(g.ref)!,
    fromDiagramRef: ROOT_REF,
    toDiagramRef: g.ref,
  }))

  if (hasExternal) {
    links.push({
      objectRef: `cluster_${EXTERNAL_REF}`,
      fromDiagramRef: ROOT_REF,
      toDiagramRef: EXTERNAL_REF,
    })
  }

  return { diagrams, objects, edges: planEdges, links }
}

// ── Layout ────────────────────────────────────────────────────────────────────

/**
 * Role-based lane layout for a group diagram:
 * api_entry → top lane, service → middle, repository/data_exit → bottom.
 * Other roles fill in between.
 */
function computeGroupLayout(symbols: ClassifiedSymbol[]): Map<string, { x: number; y: number }> {
  const LANE_ORDER: Record<string, number> = {
    api_entry: 0,
    service: 1,
    model: 2,
    repository: 3,
    data_exit: 3,
    utility: 4,
    external: 5,
    unknown: 6,
  }

  const lanes = new Map<number, ClassifiedSymbol[]>()
  for (const sym of symbols) {
    const lane = LANE_ORDER[sym.role] ?? 6
    const arr = lanes.get(lane) ?? []
    arr.push(sym)
    lanes.set(lane, arr)
  }

  const layout = new Map<string, { x: number; y: number }>()
  const sortedLanes = [...lanes.entries()].sort(([a], [b]) => a - b)
  let y = 0
  for (const [, syms] of sortedLanes) {
    syms.forEach((sym, i) => {
      layout.set(symbolKey(sym), { x: i * GRID_COL_W, y })
    })
    y += GRID_ROW_H
  }
  return layout
}

/** Square-ish grid layout for the root diagram cluster objects */
function computeRootLayout(
  groups: DiagramGroup[],
  hasExternal: boolean,
): Map<string, { x: number; y: number }> {
  const layout = new Map<string, { x: number; y: number }>()
  groups.forEach((g, i) => {
    layout.set(g.ref, {
      x: (i % GRID_COLS) * GRID_COL_W,
      y: Math.floor(i / GRID_COLS) * GRID_ROW_H,
    })
  })

  if (hasExternal) {
    // Pin external to bottom-right
    const cols = GRID_COLS
    const totalRows = Math.ceil(groups.length / cols)
    layout.set(EXTERNAL_REF, {
      x: (cols - 1) * GRID_COL_W,
      y: (totalRows + 1) * GRID_ROW_H,
    })
  }

  return layout
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function symbolKey(sym: ClassifiedSymbol): string {
  return `${sym.filePath}::${sym.name}::${sym.startLine}`
}

function sanitizeRef(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
}
