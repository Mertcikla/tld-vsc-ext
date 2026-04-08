import { abstractionTargetMidpoint, type AbstractionSelectionProfile } from './abstractionTargets'
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
  includeUtilities: boolean
  abstractionTargets: AbstractionSelectionProfile
}

export interface SharedDiagramGroup<TSymbol extends GroupableArchitecturalSymbol> {
  ref: string
  name: string
  symbols: TSymbol[]
  centralityScores: Map<string, number>
  representative: TSymbol
}

type ScoredGroup<TSymbol extends GroupableArchitecturalSymbol> = {
  key: string
  score: number
  scoredSymbols: Array<{ symbol: TSymbol; score: number }>
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

  const symbolScores = computeSymbolScores(filtered, edges)
  const scoredGroups = [...rawGroups.entries()]
    .map(([key, groupSymbols]) => {
      const scoredSymbols = groupSymbols
        .map((symbol) => ({
          symbol,
          score: symbolScores.get(architecturalSymbolRef(symbol)) ?? Number.NEGATIVE_INFINITY,
        }))
        .filter(({ score }) => Number.isFinite(score))
        .sort(compareSymbolScores)

      if (scoredSymbols.length === 0) return null

      const score = scoredSymbols.reduce((total, item) => total + item.score, 0) / Math.sqrt(scoredSymbols.length)
      return { key, score, scoredSymbols }
    })
    .filter((entry): entry is ScoredGroup<TSymbol> => entry !== null)

  if (scoredGroups.length === 0) return []

  const diagramTarget = Math.min(
    scoredGroups.length,
    Math.max(1, abstractionTargetMidpoint(config.abstractionTargets.diagrams)),
  )
  const objectTarget = Math.max(
    diagramTarget,
    Math.min(
      filtered.length,
      abstractionTargetMidpoint(config.abstractionTargets.objects),
    ),
  )

  const selectedGroups = scoredGroups
    .sort(compareGroupScores)
    .slice(0, diagramTarget)

  const budgets = allocateSymbolBudgets(selectedGroups, objectTarget)

  const result: SharedDiagramGroup<TSymbol>[] = []
  for (const group of selectedGroups) {
    const budget = budgets.get(group.key) ?? 0
    const selectedSymbols = group.scoredSymbols.slice(0, budget).map((entry) => entry.symbol)
    if (selectedSymbols.length === 0) continue

    const centrality = new Map<string, number>()
    for (const entry of group.scoredSymbols.slice(0, budget)) {
      centrality.set(architecturalSymbolRef(entry.symbol), entry.score)
    }

    result.push({
      ref: sanitizeRef(`grp_${group.key}`),
      name: groupDisplayName(group.key),
      symbols: selectedSymbols,
      centralityScores: centrality,
      representative: pickRepresentative(selectedSymbols, centrality),
    })
  }

  return result.sort((a, b) => compareGroupScores(
    { key: a.ref, score: groupScoreFromSymbols(a.symbols, a.centralityScores) },
    { key: b.ref, score: groupScoreFromSymbols(b.symbols, b.centralityScores) },
  ))
}

export function selectTopArchitecturalEdges<TSymbol extends GroupableArchitecturalSymbol>(
  groups: SharedDiagramGroup<TSymbol>[],
  edges: ArchitecturalSymbolEdge[],
  profile: AbstractionSelectionProfile,
): ArchitecturalSymbolEdge[] {
  const target = Math.min(edges.length, Math.max(1, abstractionTargetMidpoint(profile.edges)))
  const scoreByRef = new Map<string, number>()
  const selectedRefs = new Set<string>()

  for (const group of groups) {
    for (const symbol of group.symbols) {
      const ref = architecturalSymbolRef(symbol)
      selectedRefs.add(ref)
      scoreByRef.set(ref, group.centralityScores.get(ref) ?? 0)
    }
  }

  const scoredEdges: Array<{ edge: ArchitecturalSymbolEdge; score: number }> = []
  for (const edge of edges) {
    if (!selectedRefs.has(edge.srcRef) || !selectedRefs.has(edge.dstRef)) continue
    const score = (scoreByRef.get(edge.srcRef) ?? 0) + (scoreByRef.get(edge.dstRef) ?? 0)
    if (!Number.isFinite(score)) continue
    scoredEdges.push({ edge, score })
  }

  scoredEdges.sort((a, b) => b.score - a.score || a.edge.srcRef.localeCompare(b.edge.srcRef) || a.edge.dstRef.localeCompare(b.edge.dstRef))
  return scoredEdges.slice(0, target).map(({ edge }) => edge)
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

function computeSymbolScores<TSymbol extends GroupableArchitecturalSymbol>(
  symbols: TSymbol[],
  edges: ArchitecturalSymbolEdge[],
): Map<string, number> {
  const refs = new Set(symbols.map(architecturalSymbolRef))
  const degreeMap = new Map<string, { incoming: number; outgoing: number }>()

  for (const symbol of symbols) {
    degreeMap.set(architecturalSymbolRef(symbol), { incoming: 0, outgoing: 0 })
  }

  for (const edge of edges) {
    const source = degreeMap.get(edge.srcRef)
    const target = degreeMap.get(edge.dstRef)
    if (source) source.outgoing++
    if (target) target.incoming++
    if (!refs.has(edge.srcRef) || !refs.has(edge.dstRef)) continue
  }

  const scores = new Map<string, number>()
  for (const symbol of symbols) {
    const ref = architecturalSymbolRef(symbol)
    const { incoming, outgoing } = degreeMap.get(ref) ?? { incoming: 0, outgoing: 0 }
    const degree = incoming + outgoing
    scores.set(ref, scoreSymbol(symbol, degree, incoming, outgoing))
  }

  return scores
}

function scoreSymbol(
  symbol: Pick<GroupableArchitecturalSymbol, 'role'>,
  degree: number,
  incoming: number,
  outgoing: number,
): number {
  const roleWeights: Record<ArchitecturalRole, number> = {
    api_entry: 90,
    service: 75,
    repository: 68,
    data_exit: 58,
    model: 44,
    utility: 18,
    external: 12,
    unknown: 30,
  }

  let score = roleWeights[symbol.role] + degree * 10 + Math.min(incoming, outgoing) * 4

  if (degree === 0) {
    score *= 0.1
  } else if (degree > 5 && degree <= 15) {
    const excess = degree - 5
    const multiplier = 0.9 - (excess / 10) * 0.8
    score *= Math.max(0.05, multiplier)
  } else if (degree > 15) {
    return Number.NEGATIVE_INFINITY
  }

  return score
}

function compareGroupScores(
  a: { score: number; key: string },
  b: { score: number; key: string },
): number {
  return b.score - a.score || a.key.localeCompare(b.key)
}

function compareSymbolScores(
  a: { score: number; symbol: GroupableArchitecturalSymbol },
  b: { score: number; symbol: GroupableArchitecturalSymbol },
): number {
  return b.score - a.score
    || a.symbol.role.localeCompare(b.symbol.role)
    || a.symbol.filePath.localeCompare(b.symbol.filePath)
    || a.symbol.name.localeCompare(b.symbol.name)
}

function allocateSymbolBudgets<TSymbol extends GroupableArchitecturalSymbol>(
  groups: Array<{ key: string; score: number; scoredSymbols: Array<{ symbol: TSymbol; score: number }> }>,
  objectTarget: number,
): Map<string, number> {
  const budgets = new Map<string, number>()
  if (groups.length === 0 || objectTarget <= 0) return budgets

  const capacity = groups.reduce((total, group) => total + group.scoredSymbols.length, 0)
  let remaining = Math.min(objectTarget, capacity)
  const ordered = [...groups].sort(compareGroupScores)

  for (const group of ordered) {
    if (remaining <= 0) break
    budgets.set(group.key, 1)
    remaining--
  }

  while (remaining > 0) {
    let progressed = false
    for (const group of ordered) {
      const current = budgets.get(group.key) ?? 0
      if (current >= group.scoredSymbols.length) continue
      budgets.set(group.key, current + 1)
      remaining--
      progressed = true
      if (remaining === 0) break
    }

    if (!progressed) break
  }

  return budgets
}

function groupScoreFromSymbols<TSymbol extends GroupableArchitecturalSymbol>(
  symbols: TSymbol[],
  scores: Map<string, number>,
): number {
  if (symbols.length === 0) return Number.NEGATIVE_INFINITY
  let total = 0
  for (const symbol of symbols) {
    total += scores.get(architecturalSymbolRef(symbol)) ?? 0
  }
  return total / Math.sqrt(symbols.length)
}

function computeCentrality<TSymbol extends GroupableArchitecturalSymbol>(
  symbols: TSymbol[],
  edges: ArchitecturalSymbolEdge[],
): Map<string, number> {
  return computeSymbolScores(symbols, edges)
}

function computeCentralityRaw<TSymbol extends GroupableArchitecturalSymbol>(
  symbols: TSymbol[],
  refs: Set<string>,
  edges: ArchitecturalSymbolEdge[],
): Map<string, number> {
  const selected = symbols.filter((symbol) => refs.has(architecturalSymbolRef(symbol)))
  return computeSymbolScores(selected, edges)
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