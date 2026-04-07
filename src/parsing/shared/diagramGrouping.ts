import type { ArchitecturalRole } from './roles'

export interface GroupableArchitecturalSymbol {
  name: string
  filePath: string
  startLine: number
  role: ArchitecturalRole
}

export interface ArchitecturalSymbolEdge {
  srcRef: string
  dstRef: string
}

export interface DiagramGroupingConfig {
  groupingStrategy: 'folder' | 'role' | 'hybrid'
  targetObjectsPerDiagram: number
  maxObjectsPerDiagram: number
  minObjectsPerDiagram: number
  includeUtilities: boolean
}

export interface SharedDiagramGroup<TSymbol extends GroupableArchitecturalSymbol> {
  ref: string
  name: string
  symbols: TSymbol[]
  centralityScores: Map<string, number>
  representative: TSymbol
}

const ROLE_NAMES: Record<ArchitecturalRole, string> = {
  api_entry: 'API Layer',
  service: 'Services',
  repository: 'Data Layer',
  data_exit: 'Data Access',
  model: 'Models',
  utility: 'Utilities',
  external: 'External',
  unknown: 'Other',
}

export function architecturalSymbolRef(symbol: Pick<GroupableArchitecturalSymbol, 'filePath' | 'name' | 'startLine'>): string {
  return `${symbol.filePath}::${symbol.name}::${symbol.startLine}`
}

export function groupArchitecturalSymbols<TSymbol extends GroupableArchitecturalSymbol>(
  symbols: TSymbol[],
  edges: ArchitecturalSymbolEdge[],
  config: DiagramGroupingConfig,
): SharedDiagramGroup<TSymbol>[] {
  const filtered = config.includeUtilities
    ? symbols
    : symbols.filter((symbol) => symbol.role !== 'utility')

  if (filtered.length === 0) return []

  let rawGroups: Map<string, TSymbol[]>
  if (config.groupingStrategy === 'role') rawGroups = groupByRole(filtered)
  else if (config.groupingStrategy === 'folder') rawGroups = groupByFolder(filtered)
  else rawGroups = groupByHybrid(filtered)

  let groups = new Map<string, TSymbol[]>()
  for (const [key, groupSymbols] of rawGroups) {
    if (groupSymbols.length > config.maxObjectsPerDiagram) {
      const split = splitGroup(key, groupSymbols, config)
      for (const [splitKey, splitSymbols] of split) groups.set(splitKey, splitSymbols)
    } else {
      groups.set(key, groupSymbols)
    }
  }

  groups = mergeSmallGroups(groups, edges, config)

  const result: SharedDiagramGroup<TSymbol>[] = []
  for (const [key, groupSymbols] of groups) {
    if (groupSymbols.length === 0) continue
    const centrality = computeCentrality(groupSymbols, edges)
    result.push({
      ref: sanitizeRef(`grp_${key}`),
      name: groupDisplayName(key),
      symbols: groupSymbols,
      centralityScores: centrality,
      representative: pickRepresentative(groupSymbols, centrality),
    })
  }

  return result
}

function groupByFolder<TSymbol extends GroupableArchitecturalSymbol>(symbols: TSymbol[]): Map<string, TSymbol[]> {
  const groups = new Map<string, TSymbol[]>()
  for (const symbol of symbols) {
    const parts = symbol.filePath.split('/')
    const key = parts.length > 2
      ? parts.slice(0, 2).join('_')
      : parts.length > 1
      ? parts[0]
      : 'root'
    const current = groups.get(key) ?? []
    current.push(symbol)
    groups.set(key, current)
  }
  return groups
}

function groupByRole<TSymbol extends GroupableArchitecturalSymbol>(symbols: TSymbol[]): Map<string, TSymbol[]> {
  const groups = new Map<string, TSymbol[]>()
  for (const symbol of symbols) {
    const current = groups.get(symbol.role) ?? []
    current.push(symbol)
    groups.set(symbol.role, current)
  }
  return groups
}

function groupByHybrid<TSymbol extends GroupableArchitecturalSymbol>(symbols: TSymbol[]): Map<string, TSymbol[]> {
  const folderGroups = groupByFolder(symbols)
  if (folderGroups.size <= 1) return groupByRole(symbols)
  if (folderGroups.size === 1) {
    const deepGroups = new Map<string, TSymbol[]>()
    for (const symbol of symbols) {
      const parts = symbol.filePath.split('/')
      const key = parts.length > 3 ? parts.slice(0, 3).join('_') : parts.slice(0, 2).join('_')
      const current = deepGroups.get(key) ?? []
      current.push(symbol)
      deepGroups.set(key, current)
    }
    if (deepGroups.size > 1) return deepGroups
    return groupByRole(symbols)
  }
  return folderGroups
}

function splitGroup<TSymbol extends GroupableArchitecturalSymbol>(
  key: string,
  symbols: TSymbol[],
  config: Pick<DiagramGroupingConfig, 'maxObjectsPerDiagram' | 'targetObjectsPerDiagram'>,
): Map<string, TSymbol[]> {
  if (symbols.length <= config.maxObjectsPerDiagram) {
    return new Map([[key, symbols]])
  }

  const subDirMap = new Map<string, TSymbol[]>()
  for (const symbol of symbols) {
    const parts = symbol.filePath.split('/')
    const subKey = parts.length > 3 ? parts[2] : parts.length > 2 ? parts[1] : 'root'
    const current = subDirMap.get(subKey) ?? []
    current.push(symbol)
    subDirMap.set(subKey, current)
  }

  if (subDirMap.size > 1) {
    const result = new Map<string, TSymbol[]>()
    for (const [subKey, subSymbols] of subDirMap) {
      const nested = splitGroup(`${key}_${subKey}`, subSymbols, config)
      for (const [nestedKey, nestedSymbols] of nested) result.set(nestedKey, nestedSymbols)
    }
    return result
  }

  const roleMap = groupByRole(symbols)
  if (roleMap.size > 1) {
    const result = new Map<string, TSymbol[]>()
    for (const [role, roleSymbols] of roleMap) result.set(`${key}_${role}`, roleSymbols)
    return result
  }

  const tempCentrality = computeCentralityRaw(symbols, new Set<string>(), [])
  const sorted = [...symbols].sort(
    (a, b) => (tempCentrality.get(architecturalSymbolRef(b)) ?? 0) - (tempCentrality.get(architecturalSymbolRef(a)) ?? 0),
  )
  const firstChunk = sorted.slice(0, config.targetObjectsPerDiagram)
  const secondChunk = sorted.slice(config.targetObjectsPerDiagram)
  const result = new Map<string, TSymbol[]>()
  result.set(`${key}_primary`, firstChunk)
  if (secondChunk.length > 0) result.set(`${key}_secondary`, secondChunk)
  return result
}

function mergeSmallGroups<TSymbol extends GroupableArchitecturalSymbol>(
  groups: Map<string, TSymbol[]>,
  edges: ArchitecturalSymbolEdge[],
  config: Pick<DiagramGroupingConfig, 'minObjectsPerDiagram' | 'maxObjectsPerDiagram'>,
): Map<string, TSymbol[]> {
  let changed = true
  while (changed) {
    changed = false
    const smallKey = findSmallKey(groups, config.minObjectsPerDiagram)
    if (!smallKey) break

    const smallSymbols = groups.get(smallKey) ?? []
    let bestKey: string | null = null
    let bestScore = -1

    for (const [candidateKey, candidateSymbols] of groups) {
      if (candidateKey === smallKey) continue
      if (candidateSymbols.length + smallSymbols.length > config.maxObjectsPerDiagram) continue
      const score = countCrossEdges(smallSymbols, candidateSymbols, edges)
      if (score > bestScore) {
        bestScore = score
        bestKey = candidateKey
      }
    }

    if (!bestKey) {
      let minSize = Number.POSITIVE_INFINITY
      for (const [candidateKey, candidateSymbols] of groups) {
        if (candidateKey === smallKey) continue
        if (candidateSymbols.length < minSize) {
          minSize = candidateSymbols.length
          bestKey = candidateKey
        }
      }
    }

    if (!bestKey) break
    groups.set(bestKey, [...(groups.get(bestKey) ?? []), ...smallSymbols])
    groups.delete(smallKey)
    changed = true
  }

  return groups
}

function findSmallKey<TSymbol extends GroupableArchitecturalSymbol>(
  groups: Map<string, TSymbol[]>,
  min: number,
): string | null {
  for (const [key, symbols] of groups) {
    if (symbols.length < min) return key
  }
  return null
}

function countCrossEdges<TSymbol extends GroupableArchitecturalSymbol>(
  a: TSymbol[],
  b: TSymbol[],
  edges: ArchitecturalSymbolEdge[],
): number {
  const aRefs = new Set(a.map(architecturalSymbolRef))
  const bRefs = new Set(b.map(architecturalSymbolRef))
  let count = 0
  for (const edge of edges) {
    if ((aRefs.has(edge.srcRef) && bRefs.has(edge.dstRef)) || (bRefs.has(edge.srcRef) && aRefs.has(edge.dstRef))) {
      count++
    }
  }
  return count
}

function computeCentrality<TSymbol extends GroupableArchitecturalSymbol>(
  symbols: TSymbol[],
  edges: ArchitecturalSymbolEdge[],
): Map<string, number> {
  return computeCentralityRaw(symbols, new Set(symbols.map(architecturalSymbolRef)), edges)
}

function computeCentralityRaw<TSymbol extends GroupableArchitecturalSymbol>(
  symbols: TSymbol[],
  refs: Set<string>,
  edges: ArchitecturalSymbolEdge[],
): Map<string, number> {
  const scores = new Map<string, number>()
  for (const symbol of symbols) {
    scores.set(architecturalSymbolRef(symbol), 0)
  }

  for (const edge of edges) {
    if (refs.has(edge.srcRef)) scores.set(edge.srcRef, (scores.get(edge.srcRef) ?? 0) + 1)
    if (refs.has(edge.dstRef)) scores.set(edge.dstRef, (scores.get(edge.dstRef) ?? 0) + 1)
  }

  for (const symbol of symbols) {
    const key = architecturalSymbolRef(symbol)
    let score = scores.get(key) ?? 0
    if (symbol.role === 'api_entry') score *= 2
    else if (symbol.role === 'repository') score = Math.round(score * 1.5)
    scores.set(key, score)
  }

  return scores
}

function pickRepresentative<TSymbol extends GroupableArchitecturalSymbol>(
  symbols: TSymbol[],
  centrality: Map<string, number>,
): TSymbol {
  const roleTieBreak: Record<ArchitecturalRole, number> = {
    api_entry: 5,
    service: 4,
    repository: 3,
    data_exit: 2,
    model: 1,
    utility: 0,
    external: 0,
    unknown: 0,
  }

  return symbols.reduce((best, symbol) => {
    const bestScore = (centrality.get(architecturalSymbolRef(best)) ?? 0) * 100 + (roleTieBreak[best.role] ?? 0)
    const symbolScore = (centrality.get(architecturalSymbolRef(symbol)) ?? 0) * 100 + (roleTieBreak[symbol.role] ?? 0)
    return symbolScore > bestScore ? symbol : best
  })
}

function sanitizeRef(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
}

function groupDisplayName(key: string): string {
  if (key in ROLE_NAMES) return ROLE_NAMES[key as ArchitecturalRole]

  return key
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' / ')
}