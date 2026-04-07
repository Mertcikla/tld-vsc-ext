import * as vscode from 'vscode'
import { logger } from '../logger'
import type { ExtensionApiClient } from '../api/ExtensionApiClient'
import type { PlanObject, PlanEdge, PlanDiagram } from '../../../frontend/src/gen/diag/v1/diagram_service_pb'

function typeNodeKey(item: vscode.TypeHierarchyItem): string {
  return `${item.uri.toString()}::${item.name}::${item.selectionRange.start.line}`
}

function relativeFilePath(uri: vscode.Uri): string {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri
  return workspaceRoot && uri.fsPath.startsWith(workspaceRoot.fsPath + '/')
    ? uri.fsPath.slice(workspaceRoot.fsPath.length + 1)
    : uri.fsPath
}

export async function buildTypeHierarchyDiagram(
  client: ExtensionApiClient,
  rootItem: vscode.TypeHierarchyItem,
  orgId: string,
  maxDepth: number,
  token: vscode.CancellationToken,
  onProgress: (message: string) => void,
): Promise<number> {
  logger.info('TypeHierarchyBuilder', 'Starting type hierarchy build', { name: rootItem.name, maxDepth })

  onProgress('Resolving type hierarchy…')

  let supertypes: vscode.TypeHierarchyItem[] = []
  let subtypes: vscode.TypeHierarchyItem[] = []

  try {
    supertypes = await vscode.commands.executeCommand<vscode.TypeHierarchyItem[]>(
      'vscode.provideSupertypes',
      rootItem,
    ) ?? []
  } catch (e) {
    logger.warn('TypeHierarchyBuilder', 'provideSupertypes failed', { error: String(e) })
  }

  if (!token.isCancellationRequested) {
    try {
      subtypes = await vscode.commands.executeCommand<vscode.TypeHierarchyItem[]>(
        'vscode.provideSubtypes',
        rootItem,
      ) ?? []
    } catch (e) {
      logger.warn('TypeHierarchyBuilder', 'provideSubtypes failed', { error: String(e) })
    }
  }

  if (token.isCancellationRequested) throw new vscode.CancellationError()

  // Layout: supertypes at y=-rowH, root at y=0, subtypes at y=rowH
  // Each row distributed horizontally
  const COL_W = 220
  const ROW_H = 180

  const allItems = [...supertypes, rootItem, ...subtypes]
  const totalWidth = (allItems.length - 1) * COL_W
  const centerX = Math.floor(totalWidth / 2)

  const nodes: Array<{ ref: string; item: vscode.TypeHierarchyItem; x: number; y: number }> = []

  supertypes.forEach((item, i) => {
    nodes.push({ ref: typeNodeKey(item), item, x: i * COL_W, y: -ROW_H })
  })

  nodes.push({ ref: typeNodeKey(rootItem), item: rootItem, x: centerX, y: 0 })

  subtypes.forEach((item, i) => {
    nodes.push({ ref: typeNodeKey(item), item, x: i * COL_W, y: ROW_H })
  })

  logger.info('TypeHierarchyBuilder', 'Layout computed', {
    supertypes: supertypes.length,
    subtypes: subtypes.length,
  })

  onProgress(`Building diagram with ${nodes.length} nodes…`)

  const DIAG_REF = 'th'
  const rootRef = typeNodeKey(rootItem)

  const planObjects: PlanObject[] = nodes.map((n) => ({
    ref: n.ref,
    name: n.item.name,
    type: 'component',
    filePath: relativeFilePath(n.item.uri),
    technologyLinks: [],
    tags: [],
    placements: [{ diagramRef: DIAG_REF, positionX: n.x, positionY: n.y }],
  } as unknown as PlanObject))

  const planEdges: PlanEdge[] = [
    // supertype -> root (inheritance: supertype is parent)
    ...supertypes.map((s) => ({
      diagramRef: DIAG_REF,
      sourceObjectRef: typeNodeKey(s),
      targetObjectRef: rootRef,
    } as unknown as PlanEdge)),
    // root -> subtypes
    ...subtypes.map((s) => ({
      diagramRef: DIAG_REF,
      sourceObjectRef: rootRef,
      targetObjectRef: typeNodeKey(s),
    } as unknown as PlanEdge)),
  ]

  const planDiagram: PlanDiagram = {
    ref: DIAG_REF,
    name: `Type Hierarchy: ${rootItem.name}`,
  } as unknown as PlanDiagram

  const diagramId = await client.applyPlan({
    orgId,
    diagrams: [planDiagram],
    objects: planObjects,
    edges: planEdges,
  })

  logger.info('TypeHierarchyBuilder', 'Type hierarchy diagram built', { diagramId })
  return diagramId
}
