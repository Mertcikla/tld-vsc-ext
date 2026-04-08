import { logger } from '../logger'
import {
  groupArchitecturalSymbols,
  type DiagramGroupingConfig,
  type SharedDiagramGroup,
} from '../parsing/shared/diagramGrouping'
import type { ClassifiedSymbol } from './RoleClassifier'
import type { RelationshipGraph } from './RelationshipMapper'

export type DiagramGroup = SharedDiagramGroup<ClassifiedSymbol>

export interface GrouperConfig extends DiagramGroupingConfig {}

/**
 * Groups ClassifiedSymbols into score-ranked DiagramGroups.
 * The shared selector trims the result to the requested abstraction targets.
 */
export function groupSymbols(
  symbols: ClassifiedSymbol[],
  graph: RelationshipGraph,
  config: GrouperConfig,
): DiagramGroup[] {
  const result = groupArchitecturalSymbols(symbols, graph.edges, config)

  logger.info('DiagramGrouper', 'grouping complete', {
    groups: result.length,
    counts: result.map((g) => ({ name: g.name, n: g.symbols.length })),
  })

  return result
}
