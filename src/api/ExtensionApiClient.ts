import { createClient, ConnectError } from '@connectrpc/connect'
import { createConnectTransport } from '@connectrpc/connect-web'
import { toJson } from '@bufbuild/protobuf'
import { logger } from '../logger'

// Using relative imports to the local gen files — no BSR package needed in the extension host.
// esbuild resolves these at build time.
import {
  WorkspaceService,
  CreateViewResponseSchema,
  UpdateViewResponseSchema,
  CreateElementResponseSchema,
  ApplyPlanResponseSchema,
  ListElementsResponseSchema,
  ListElementPlacementsResponseSchema,
  type PlanElement,
  type PlanConnector,
} from '../../../frontend/src/gen/diag/v1/workspace_service_pb'

import type { ValidatedUser } from '../auth/AuthManager'

export interface Diagram {
  id: number
  name: string
  description: string | null
  level_label: string | null
  level: number
  created_at: string
  updated_at: string
  parent_diagram_id: number | null
}

export interface DiagElementData {
  id: number
  name: string
  type: string
  technology?: string | null
  repo?: string | null
  branch?: string | null
  language?: string | null
  file_path?: string | null
}

function j<T>(schema: Parameters<typeof toJson>[0], msg: Parameters<typeof toJson>[1]): T {
  return toJson(schema, msg, { useProtoFieldName: true, emitDefaultValues: true }) as unknown as T
}

function normalizeElementType(kind?: string | null, type?: string | null): string {
  const normalizedKind = kind?.trim()
  if (normalizedKind) return normalizedKind

  const normalizedType = type?.trim()
  if (normalizedType) return normalizedType

  return 'Component'
}

export class ExtensionApiClient {
  private readonly workspaceClient

  constructor(
    serverUrl: string,
    apiKey: string,
  ) {
    const transport = createConnectTransport({
      baseUrl: serverUrl.replace(/\/$/, '') + '/api',
      fetch: (input, init) => {
        const headers = new Headers(init?.headers)
        headers.set('Authorization', `Bearer ${apiKey}`)
        return fetch(input, { ...init, headers })
      },
    })
    this.workspaceClient = createClient(WorkspaceService, transport)
    logger.debug('ExtensionApiClient', 'Client created', { baseUrl: serverUrl.replace(/\/$/, '') + '/api' })
  }

  async getMe(): Promise<ValidatedUser> {
    logger.debug('ExtensionApiClient', 'getMe: validating via listDiagrams')
    try {
      await this.workspaceClient.listViews({})
      logger.debug('ExtensionApiClient', 'getMe: success')
      return { username: 'API Key', orgName: '', orgId: '' }
    } catch (e) {
      logger.error('ExtensionApiClient', 'getMe: failed', { error: String(e) })
      if (e instanceof ConnectError) throw new Error(e.message)
      throw e
    }
  }

  async listDiagrams(): Promise<Diagram[]> {
    logger.debug('ExtensionApiClient', 'listDiagrams')
    const res = await this.workspaceClient.listViews({})
    const diagrams = (res.views ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description ?? null,
      level_label: d.levelLabel ?? null,
      level: d.level,
      created_at: d.createdAt ? new Date(Number(d.createdAt.seconds) * 1000).toISOString() : new Date().toISOString(),
      updated_at: d.updatedAt ? new Date(Number(d.updatedAt.seconds) * 1000).toISOString() : new Date().toISOString(),
      parent_diagram_id: d.parentDiagramId ?? null,
    }))
    logger.debug('ExtensionApiClient', 'listDiagrams: done', { count: diagrams.length })
    return diagrams
  }

  async listElements(): Promise<DiagElementData[]> {
    logger.debug('ExtensionApiClient', 'listElements')
    const res = await this.workspaceClient.listElements({ limit: 1000 })
    const json = j<{ elements: Array<{ id: number; name: string; type?: string | null; kind?: string | null; technology?: string | null; repo?: string | null; branch?: string | null; language?: string | null; file_path?: string | null }> }>(ListElementsResponseSchema, res)
    const elements = (json.elements ?? []).map((o) => ({
      id: o.id,
      name: o.name,
      type: normalizeElementType(o.kind, o.type),
      technology: o.technology ?? null,
      repo: o.repo ?? null,
      branch: o.branch ?? null,
      language: o.language ?? null,
      file_path: o.file_path ?? null,
    }))
    logger.debug('ExtensionApiClient', 'listElements: done', { count: elements.length })
    return elements
  }

  async listElementPlacements(elementId: number): Promise<{ view_id: number; view_name: string }[]> {
    logger.debug('ExtensionApiClient', 'listElementPlacements', { elementId })
    const res = await this.workspaceClient.listElementPlacements({ elementId })
    const json = j<{ placements: Array<{ view_id: number; view_name: string }> }>(ListElementPlacementsResponseSchema, res)
    return json.placements ?? []
  }

  async createDiagram(name: string, parentDiagramId?: number): Promise<Diagram> {
    logger.info('ExtensionApiClient', 'createDiagram', { name, parentDiagramId })
    const res = await this.workspaceClient.createView({ name, parentDiagramId })
    const json = j<{ view: Diagram }>(CreateViewResponseSchema, res)
    logger.info('ExtensionApiClient', 'createDiagram: created', { id: json.view.id, name: json.view.name })
    return json.view
  }

  async renameDiagram(id: number, name: string): Promise<Diagram> {
    logger.info('ExtensionApiClient', 'renameDiagram', { id, name })
    const res = await this.workspaceClient.updateView({ diagramId: id, name })
    const json = j<{ view: Diagram }>(UpdateViewResponseSchema, res)
    logger.debug('ExtensionApiClient', 'renameDiagram: done')
    return json.view
  }

  async deleteDiagram(orgId: string, id: number): Promise<void> {
    logger.info('ExtensionApiClient', 'deleteDiagram', { orgId, id })
    await this.workspaceClient.deleteView({ orgId, diagramId: id })
    logger.debug('ExtensionApiClient', 'deleteDiagram: done')
  }

  async createElement(props: {
    name: string
    type?: string
    filePath?: string
  }): Promise<{ id: number }> {
    logger.debug('ExtensionApiClient', 'createElement', { name: props.name, type: props.type })
    const res = await this.workspaceClient.createElement({
      name: props.name,
      type: props.type,
      filePath: props.filePath,
      technologyLinks: [],
      tags: [],
    })
    const json = j<{ element: { id: number } }>(CreateElementResponseSchema, res)
    logger.trace('ExtensionApiClient', 'createElement: created', { id: json.element.id })
    return { id: json.element.id }
  }

  async addElementToDiagram(diagramId: number, objectId: number, x: number, y: number): Promise<void> {
    logger.trace('ExtensionApiClient', 'addElementToDiagram', { diagramId, objectId, x, y })
    await this.workspaceClient.createPlacement({ diagramId, objectId, positionX: x, positionY: y })
  }

  async applyPlan(params: {
    orgId: string
    elements: PlanElement[]
    connectors: PlanConnector[]
  }): Promise<number> {
    logger.info('ExtensionApiClient', 'applyPlan', {
      elements: params.elements.length,
      connectors: params.connectors.length,
    })
    const res = await this.workspaceClient.applyWorkspacePlan({
      orgId: params.orgId,
      elements: params.elements,
      connectors: params.connectors,
    })
    const primaryViewRef = params.elements.find((element) => element.hasView)?.ref ?? params.elements[0]?.ref
    const json = j<{
      view_metadata: Record<string, { id: number }>
      element_metadata: Record<string, { id: number }>
    }>(ApplyPlanResponseSchema, res)
    if (!primaryViewRef) throw new Error('applyPlan: no elements supplied')
    const viewMeta = json.view_metadata?.[primaryViewRef]
    if (viewMeta?.id) {
      logger.info('ExtensionApiClient', 'applyPlan: complete', { viewId: viewMeta.id })
      return viewMeta.id
    }
    const elementMeta = json.element_metadata?.[primaryViewRef]
    if (!elementMeta?.id) throw new Error(`applyPlan: no metadata for ref "${primaryViewRef}"`)
    logger.info('ExtensionApiClient', 'applyPlan: complete without view metadata', { elementId: elementMeta.id })
    return elementMeta.id
  }

  /**
   * Applies a workspace plan and returns the server-assigned ids keyed by ref.
   */
  async applyPlanFull(params: {
    orgId: string
    elements: PlanElement[]
    connectors: PlanConnector[]
  }): Promise<{ elements: Record<string, number>; views: Record<string, number>; connectors: Record<string, number> }> {
    logger.info('ExtensionApiClient', 'applyPlanFull', {
      elements: params.elements.length,
      connectors: params.connectors.length,
    })
    const res = await this.workspaceClient.applyWorkspacePlan({
      orgId: params.orgId,
      elements: params.elements,
      connectors: params.connectors,
    })
    const json = j<{
      element_metadata: Record<string, { id: number }>
      view_metadata: Record<string, { id: number }>
      connector_metadata: Record<string, { id: number }>
    }>(ApplyPlanResponseSchema, res)
    const collect = (metadata: Record<string, { id: number }> | undefined): Record<string, number> => {
      const refToId: Record<string, number> = {}
      for (const [ref, meta] of Object.entries(metadata ?? {})) {
        if (meta?.id) refToId[ref] = meta.id
      }
      return refToId
    }
    const result = {
      elements: collect(json.element_metadata),
      views: collect(json.view_metadata),
      connectors: collect(json.connector_metadata),
    }
    logger.info('ExtensionApiClient', 'applyPlanFull: complete', {
      elementRefs: Object.keys(result.elements).length,
      viewRefs: Object.keys(result.views).length,
      connectorRefs: Object.keys(result.connectors).length,
    })
    return result
  }
}
