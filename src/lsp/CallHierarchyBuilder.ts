import * as vscode from 'vscode'
import { logger } from '../logger'
import type { ExtensionApiClient } from '../api/ExtensionApiClient'
import type { PlanObject, PlanEdge, PlanDiagram } from '../../../frontend/src/gen/diag/v1/diagram_service_pb'

export interface CallNode {
  item: vscode.CallHierarchyItem
  callees: CallNode[]
  depth: number
}

export function nodeKey(item: vscode.CallHierarchyItem): string {
  return `${item.uri.toString()}::${item.name}::${item.selectionRange.start.line}`
}

export async function resolveCallGraph(
  item: vscode.CallHierarchyItem,
  maxDepth: number,
  depth: number,
  visited: Set<string>,
  token: vscode.CancellationToken,
): Promise<CallNode> {
  const node: CallNode = { item, callees: [], depth }
  const key = nodeKey(item)

  if (depth >= maxDepth || visited.has(key)) return node
  visited.add(key)

  if (token.isCancellationRequested) return node

  let outgoing: vscode.CallHierarchyOutgoingCall[] = []
  try {
    outgoing = await vscode.commands.executeCommand<vscode.CallHierarchyOutgoingCall[]>(
      'vscode.provideOutgoingCalls',
      item,
    ) ?? []
  } catch (e) {
    logger.warn('CallHierarchyBuilder', 'provideOutgoingCalls failed', { error: String(e) })
    return node
  }

  for (const call of outgoing) {
    if (token.isCancellationRequested) break
    node.callees.push(await resolveCallGraph(call.to, maxDepth, depth + 1, visited, token))
  }

  return node
}

function computeLayout(
  root: CallNode,
  colW = 220,
  rowH = 160,
): Array<{ ref: string; item: vscode.CallHierarchyItem; x: number; y: number }> {
  // BFS to collect nodes by depth level, deduplicating by key
  const levels = new Map<number, vscode.CallHierarchyItem[]>()
  const seen = new Set<string>()
  const queue: CallNode[] = [root]

  while (queue.length > 0) {
    const node = queue.shift()!
    const key = nodeKey(node.item)
    if (seen.has(key)) continue
    seen.add(key)

    const level = levels.get(node.depth) ?? []
    level.push(node.item)
    levels.set(node.depth, level)

    node.callees.forEach((c) => queue.push(c))
  }

  const result: Array<{ ref: string; item: vscode.CallHierarchyItem; x: number; y: number }> = []
  for (const [depth, items] of [...levels.entries()].sort(([a], [b]) => a - b)) {
    items.forEach((item, i) => {
      result.push({ ref: nodeKey(item), item, x: i * colW, y: depth * rowH })
    })
  }
  return result
}

function collectEdges(
  node: CallNode,
  edgeSet: Set<string>,
  edges: Array<{ src: string; dst: string }>,
): void {
  for (const child of node.callees) {
    const src = nodeKey(node.item)
    const dst = nodeKey(child.item)
    const edgeKey = `${src}::${dst}`
    if (!edgeSet.has(edgeKey)) {
      edgeSet.add(edgeKey)
      edges.push({ src, dst })
    }
    collectEdges(child, edgeSet, edges)
  }
}

export async function buildCallGraphDiagram(
  client: ExtensionApiClient,
  rootItem: vscode.CallHierarchyItem,
  orgId: string,
  maxDepth: number,
  token: vscode.CancellationToken,
  onProgress: (message: string) => void,
): Promise<number> {
  logger.info('CallHierarchyBuilder', 'Starting call graph build', { name: rootItem.name, maxDepth })

  onProgress('Resolving call hierarchy…')
  const visited = new Set<string>()
  const root = await resolveCallGraph(rootItem, maxDepth, 0, visited, token)

  if (token.isCancellationRequested) throw new vscode.CancellationError()

  const nodes = computeLayout(root)
  logger.info('CallHierarchyBuilder', 'Layout computed', { nodeCount: nodes.length })

  const edgeSet = new Set<string>()
  const edgePairs: Array<{ src: string; dst: string }> = []
  collectEdges(root, edgeSet, edgePairs)

  onProgress(`Building diagram with ${nodes.length} nodes…`)

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri
  const DIAG_REF = 'cg'

  const planObjects: PlanObject[] = nodes.map((n) => {
    const relPath =
      workspaceRoot && n.item.uri.fsPath.startsWith(workspaceRoot.fsPath + '/')
        ? n.item.uri.fsPath.slice(workspaceRoot.fsPath.length + 1)
        : n.item.uri.fsPath
    return {
      ref: n.ref,
      name: n.item.name,
      type: 'component',
      filePath: relPath,
      technologyLinks: [],
      tags: [],
      placements: [{ diagramRef: DIAG_REF, positionX: n.x, positionY: n.y }],
    } as unknown as PlanObject
  })

  const planEdges: PlanEdge[] = edgePairs.map(({ src, dst }) => ({
    diagramRef: DIAG_REF,
    sourceObjectRef: src,
    targetObjectRef: dst,
  } as unknown as PlanEdge))

  const planDiagram: PlanDiagram = {
    ref: DIAG_REF,
    name: `Call Graph: ${rootItem.name}`,
  } as unknown as PlanDiagram

  const diagramId = await client.applyPlan({
    orgId,
    diagrams: [planDiagram],
    objects: planObjects,
    edges: planEdges,
  })

  logger.info('CallHierarchyBuilder', 'Call graph diagram built', { diagramId })
  return diagramId
}
