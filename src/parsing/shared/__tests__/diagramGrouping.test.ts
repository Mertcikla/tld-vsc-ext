import { describe, expect, it } from 'vitest'
import {
  architecturalSymbolRef,
  groupArchitecturalSymbols,
  type ArchitecturalSymbolEdge,
  type GroupableArchitecturalSymbol,
} from '../diagramGrouping'

type TestSymbol = GroupableArchitecturalSymbol

const PROFILE = {
  diagrams: { min: 1, max: 1 },
  objects: { min: 1, max: 1 },
  edges: { min: 1, max: 1 },
} as const

function createSymbol(name: string): TestSymbol {
  return {
    name,
    filePath: 'src/example.ts',
    startLine: name.length,
    role: 'service',
  }
}

function createEdge(source: TestSymbol, index: number): ArchitecturalSymbolEdge {
  return {
    srcRef: architecturalSymbolRef(source),
    dstRef: `ghost::${index}`,
  }
}

describe('groupArchitecturalSymbols scoring', () => {
  it('prefers symbols with edges over isolated symbols', () => {
    const isolated = createSymbol('isolated')
    const connected = createSymbol('connected')

    const groups = groupArchitecturalSymbols(
      [isolated, connected],
      [createEdge(connected, 1)],
      {
        groupingStrategy: 'role',
        includeUtilities: true,
        abstractionTargets: PROFILE,
      },
    )

    expect(groups).toHaveLength(1)
    expect(groups[0].symbols.map((symbol) => symbol.name)).toEqual(['connected'])
  })

  it('drops symbols with more than 15 edges', () => {
    const hub = createSymbol('hub')
    const supported = createSymbol('supported')

    const edges: ArchitecturalSymbolEdge[] = [
      ...Array.from({ length: 16 }, (_, index) => createEdge(hub, index)),
      createEdge(supported, 99),
    ]

    const groups = groupArchitecturalSymbols(
      [hub, supported],
      edges,
      {
        groupingStrategy: 'role',
        includeUtilities: true,
        abstractionTargets: {
          diagrams: { min: 1, max: 1 },
          objects: { min: 2, max: 2 },
          edges: { min: 1, max: 1 },
        },
      },
    )

    expect(groups).toHaveLength(1)
    expect(groups[0].symbols.map((symbol) => symbol.name)).toEqual(['supported'])
  })
})