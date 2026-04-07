import {
  architecturalSymbolRef,
  type ArchitecturalSymbolEdge,
  type GroupableArchitecturalSymbol,
  type SharedDiagramGroup,
} from './diagramGrouping'

export interface ArchitectureArtifactCounts {
  diagrams: number
  objects: number
  edges: number
  links: number
}

export function countArchitectureArtifacts<TSymbol extends GroupableArchitecturalSymbol>(
  groups: Array<Pick<SharedDiagramGroup<TSymbol>, 'ref' | 'symbols'>>,
  edges: ArchitecturalSymbolEdge[],
  externalLibraryCount: number,
  includeExternalLibraries: boolean,
): ArchitectureArtifactCounts {
  const hasExternal = includeExternalLibraries && externalLibraryCount > 0
  const diagrams = 1 + groups.length + (hasExternal ? 1 : 0)

  let objects = groups.length
  for (const group of groups) objects += group.symbols.length
  if (hasExternal) {
    objects += 1
    objects += externalLibraryCount
  }

  const symbolToGroup = new Map<string, string>()
  for (const group of groups) {
    for (const symbol of group.symbols) symbolToGroup.set(architecturalSymbolRef(symbol), group.ref)
  }

  const rootEdges = new Set<string>()
  const detailEdges = new Set<string>()
  for (const edge of edges) {
    const sourceGroup = symbolToGroup.get(edge.srcRef)
    const targetGroup = symbolToGroup.get(edge.dstRef)
    if (!sourceGroup || !targetGroup) continue
    if (sourceGroup !== targetGroup) rootEdges.add(`${sourceGroup}::${targetGroup}`)
    else detailEdges.add(`${sourceGroup}::${edge.srcRef}::${edge.dstRef}`)
  }

  return {
    diagrams,
    objects,
    edges: rootEdges.size + detailEdges.size,
    links: groups.length + (hasExternal ? 1 : 0),
  }
}