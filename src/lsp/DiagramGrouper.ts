import { logger } from '../logger'
import type { ClassifiedSymbol } from './RoleClassifier'
import type { RelationshipGraph } from './RelationshipMapper'

export interface DiagramGroup {
  ref: string
  name: string
  symbols: ClassifiedSymbol[]
  centralityScores: Map<string, number>
  representative: ClassifiedSymbol
}

export interface GrouperConfig {
  groupingStrategy: 'folder' | 'role' | 'hybrid'
  targetObjectsPerDiagram: number
  maxObjectsPerDiagram: number
  minObjectsPerDiagram: number
  includeUtilities: boolean
}

// Role-to-display-name mapping for role-based grouping
const ROLE_NAMES: Record<string, string> = {
  api_entry: 'API Layer',
  service: 'Services',
  repository: 'Data Layer',
  data_exit: 'Data Access',
  model: 'Models',
  utility: 'Utilities',
  external: 'External',
  unknown: 'Other',
}

/**
 * Groups ClassifiedSymbols into diagram-sized DiagramGroups.
 * Enforces min/max density constraints by splitting and merging.
 */
export function groupSymbols(
  symbols: ClassifiedSymbol[],
  graph: RelationshipGraph,
  config: GrouperConfig,
): DiagramGroup[] {
  // Filter utilities if not included
  const filtered = config.includeUtilities
    ? symbols
    : symbols.filter((s) => s.role !== 'utility')

  if (filtered.length === 0) return []

  // Step 1: Primary grouping
  let rawGroups: Map<string, ClassifiedSymbol[]>
  if (config.groupingStrategy === 'role') {
    rawGroups = groupByRole(filtered)
  } else if (config.groupingStrategy === 'folder') {
    rawGroups = groupByFolder(filtered)
  } else {
    rawGroups = groupByHybrid(filtered)
  }

  // Step 2: Split large groups
  let groups = new Map<string, ClassifiedSymbol[]>()
  for (const [key, syms] of rawGroups) {
    if (syms.length > config.maxObjectsPerDiagram) {
      const split = splitGroup(key, syms, config)
      for (const [k, v] of split) groups.set(k, v)
    } else {
      groups.set(key, syms)
    }
  }

  // Step 3: Merge small groups
  groups = mergeSmallGroups(groups, graph, config)

  // Step 4: Convert to DiagramGroup with centrality
  const result: DiagramGroup[] = []
  for (const [key, syms] of groups) {
    if (syms.length === 0) continue
    const centrality = computeCentrality(syms, graph)
    const representative = pickRepresentative(syms, centrality)
    result.push({
      ref: sanitizeRef(`grp_${key}`),
      name: groupDisplayName(key),
      symbols: syms,
      centralityScores: centrality,
      representative,
    })
  }

  logger.info('DiagramGrouper', 'grouping complete', {
    groups: result.length,
    counts: result.map((g) => ({ name: g.name, n: g.symbols.length })),
  })

  return result
}

// ── Grouping strategies ────────────────────────────────────────────────────────

function groupByFolder(symbols: ClassifiedSymbol[]): Map<string, ClassifiedSymbol[]> {
  const groups = new Map<string, ClassifiedSymbol[]>()
  for (const sym of symbols) {
    const parts = sym.filePath.split('/')
    // Use top-2 directory segments: src/handlers → "src_handlers", handlers/user → "handlers_user"
    const key = parts.length > 2
      ? parts.slice(0, 2).join('_')
      : parts.length > 1
      ? parts[0]
      : 'root'
    const arr = groups.get(key) ?? []
    arr.push(sym)
    groups.set(key, arr)
  }
  return groups
}

function groupByRole(symbols: ClassifiedSymbol[]): Map<string, ClassifiedSymbol[]> {
  const groups = new Map<string, ClassifiedSymbol[]>()
  for (const sym of symbols) {
    const key = sym.role
    const arr = groups.get(key) ?? []
    arr.push(sym)
    groups.set(key, arr)
  }
  return groups
}

function groupByHybrid(symbols: ClassifiedSymbol[]): Map<string, ClassifiedSymbol[]> {
  const folderGroups = groupByFolder(symbols)

  // If we only get 1 group from folder grouping, fall back to role grouping
  if (folderGroups.size <= 1) {
    return groupByRole(symbols)
  }

  // If all symbols land in a single top-level dir like "src", go one level deeper
  if (folderGroups.size === 1) {
    const deepGroups = new Map<string, ClassifiedSymbol[]>()
    for (const sym of symbols) {
      const parts = sym.filePath.split('/')
      const key = parts.length > 3 ? parts.slice(0, 3).join('_') : parts.slice(0, 2).join('_')
      const arr = deepGroups.get(key) ?? []
      arr.push(sym)
      deepGroups.set(key, arr)
    }
    if (deepGroups.size > 1) return deepGroups
    // Still one group — fall back to role
    return groupByRole(symbols)
  }

  return folderGroups
}

// ── Split ─────────────────────────────────────────────────────────────────────

function splitGroup(
  key: string,
  symbols: ClassifiedSymbol[],
  config: GrouperConfig,
): Map<string, ClassifiedSymbol[]> {
  if (symbols.length <= config.maxObjectsPerDiagram) {
    return new Map([[key, symbols]])
  }

  // Attempt 1: sub-directory split
  const subDirMap = new Map<string, ClassifiedSymbol[]>()
  for (const sym of symbols) {
    const parts = sym.filePath.split('/')
    const subKey = parts.length > 3 ? parts[2] : parts.length > 2 ? parts[1] : 'root'
    const arr = subDirMap.get(subKey) ?? []
    arr.push(sym)
    subDirMap.set(subKey, arr)
  }

  if (subDirMap.size > 1) {
    const result = new Map<string, ClassifiedSymbol[]>()
    for (const [subKey, subSyms] of subDirMap) {
      const subResult = splitGroup(`${key}_${subKey}`, subSyms, config)
      for (const [k, v] of subResult) result.set(k, v)
    }
    return result
  }

  // Attempt 2: role-based split within same directory
  const roleMap = groupByRole(symbols)
  if (roleMap.size > 1) {
    const result = new Map<string, ClassifiedSymbol[]>()
    for (const [role, roleSyms] of roleMap) {
      result.set(`${key}_${role}`, roleSyms)
    }
    return result
  }

  // Attempt 3: centrality split (top target N, rest)
  const tempCentrality = computeCentralityRaw(symbols, new Set<string>(), [])
  const sorted = [...symbols].sort((a, b) => (tempCentrality.get(symbolKey(b)) ?? 0) - (tempCentrality.get(symbolKey(a)) ?? 0))
  const chunk1 = sorted.slice(0, config.targetObjectsPerDiagram)
  const chunk2 = sorted.slice(config.targetObjectsPerDiagram)
  const result = new Map<string, ClassifiedSymbol[]>()
  result.set(`${key}_primary`, chunk1)
  if (chunk2.length > 0) result.set(`${key}_secondary`, chunk2)
  return result
}

// ── Merge ─────────────────────────────────────────────────────────────────────

function mergeSmallGroups(
  groups: Map<string, ClassifiedSymbol[]>,
  graph: RelationshipGraph,
  config: GrouperConfig,
): Map<string, ClassifiedSymbol[]> {
  let changed = true
  while (changed) {
    changed = false
    const smallKey = findSmallKey(groups, config.minObjectsPerDiagram)
    if (!smallKey) break

    const smallSyms = groups.get(smallKey)!
    let bestKey: string | null = null
    let bestScore = -1

    for (const [candidateKey, candidateSyms] of groups) {
      if (candidateKey === smallKey) continue
      if (candidateSyms.length + smallSyms.length > config.maxObjectsPerDiagram) continue
      const score = countCrossEdges(smallSyms, candidateSyms, graph)
      if (score > bestScore) {
        bestScore = score
        bestKey = candidateKey
      }
    }

    // If no candidate within size budget, find any smallest group
    if (!bestKey) {
      let minSize = Infinity
      for (const [candidateKey, candidateSyms] of groups) {
        if (candidateKey === smallKey) continue
        if (candidateSyms.length < minSize) {
          minSize = candidateSyms.length
          bestKey = candidateKey
        }
      }
    }

    if (bestKey) {
      const merged = [...groups.get(bestKey)!, ...smallSyms]
      groups.set(bestKey, merged)
      groups.delete(smallKey)
      changed = true
    } else {
      break
    }
  }
  return groups
}

function findSmallKey(
  groups: Map<string, ClassifiedSymbol[]>,
  min: number,
): string | null {
  for (const [key, syms] of groups) {
    if (syms.length < min) return key
  }
  return null
}

function countCrossEdges(
  a: ClassifiedSymbol[],
  b: ClassifiedSymbol[],
  graph: RelationshipGraph,
): number {
  const aRefs = new Set(a.map(symbolKey))
  const bRefs = new Set(b.map(symbolKey))
  let count = 0
  for (const edge of graph.edges) {
    if ((aRefs.has(edge.srcRef) && bRefs.has(edge.dstRef)) ||
        (bRefs.has(edge.srcRef) && aRefs.has(edge.dstRef))) {
      count++
    }
  }
  return count
}

// ── Centrality ────────────────────────────────────────────────────────────────

function computeCentrality(
  symbols: ClassifiedSymbol[],
  graph: RelationshipGraph,
): Map<string, number> {
  const refs = new Set(symbols.map(symbolKey))
  const scores = computeCentralityRaw(symbols, refs, graph.edges)
  return scores
}

function computeCentralityRaw(
  symbols: ClassifiedSymbol[],
  refs: Set<string>,
  edges: Array<{ srcRef: string; dstRef: string }>,
): Map<string, number> {
  const scores = new Map<string, number>()
  for (const sym of symbols) {
    scores.set(symbolKey(sym), 0)
  }

  for (const edge of edges) {
    const srcInGroup = refs.has(edge.srcRef)
    const dstInGroup = refs.has(edge.dstRef)
    if (srcInGroup) scores.set(edge.srcRef, (scores.get(edge.srcRef) ?? 0) + 1)
    if (dstInGroup) scores.set(edge.dstRef, (scores.get(edge.dstRef) ?? 0) + 1)
  }

  // Role bonuses
  for (const sym of symbols) {
    const key = symbolKey(sym)
    let score = scores.get(key) ?? 0
    if (sym.role === 'api_entry') score *= 2
    else if (sym.role === 'repository') score = Math.round(score * 1.5)
    scores.set(key, score)
  }

  return scores
}

function pickRepresentative(
  symbols: ClassifiedSymbol[],
  centrality: Map<string, number>,
): ClassifiedSymbol {
  const ROLE_TIEBREAK: Record<string, number> = {
    api_entry: 5,
    service: 4,
    repository: 3,
    data_exit: 2,
    model: 1,
    utility: 0,
    external: 0,
    unknown: 0,
  }

  return symbols.reduce((best, sym) => {
    const bScore = (centrality.get(symbolKey(best)) ?? 0) * 100 + (ROLE_TIEBREAK[best.role] ?? 0)
    const sScore = (centrality.get(symbolKey(sym)) ?? 0) * 100 + (ROLE_TIEBREAK[sym.role] ?? 0)
    return sScore > bScore ? sym : best
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function symbolKey(sym: ClassifiedSymbol): string {
  return `${sym.filePath}::${sym.name}::${sym.startLine}`
}

function sanitizeRef(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
}

function groupDisplayName(key: string): string {
  // Role key → nice name
  if (ROLE_NAMES[key]) return ROLE_NAMES[key]

  // Path-derived key: src_handlers → "Src / Handlers"
  return key
    .split('_')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' / ')
}
