import { createClient, ConnectError } from '@connectrpc/connect'
import { createConnectTransport } from '@connectrpc/connect-web'
import { toJson } from '@bufbuild/protobuf'
import { logger } from '../logger'

// Using relative imports to the local gen files — no BSR package needed in the extension host.
// esbuild resolves these at build time.
import {
  DiagramService,
  CreateDiagramResponseSchema,
  RenameDiagramResponseSchema,
  CreateObjectResponseSchema,
} from '../../../frontend/src/gen/diag/v1/diagram_service_pb'

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

function j<T>(schema: Parameters<typeof toJson>[0], msg: Parameters<typeof toJson>[1]): T {
  return toJson(schema, msg, { useProtoFieldName: true, emitDefaultValues: true }) as unknown as T
}

export class ExtensionApiClient {
  private readonly diagramClient

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
    this.diagramClient = createClient(DiagramService, transport)
    logger.debug('ExtensionApiClient', 'Client created', { baseUrl: serverUrl.replace(/\/$/, '') + '/api' })
  }

  async getMe(): Promise<ValidatedUser> {
    logger.debug('ExtensionApiClient', 'getMe: validating via listDiagrams')
    try {
      await this.diagramClient.listDiagrams({})
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
    const res = await this.diagramClient.listDiagrams({})
    const diagrams = (res.diagrams ?? []).map((d) => ({
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

  async createDiagram(name: string, parentDiagramId?: number): Promise<Diagram> {
    logger.info('ExtensionApiClient', 'createDiagram', { name, parentDiagramId })
    const res = await this.diagramClient.createDiagram({ name, parentDiagramId })
    const json = j<{ diagram: Diagram }>(CreateDiagramResponseSchema, res)
    logger.info('ExtensionApiClient', 'createDiagram: created', { id: json.diagram.id, name: json.diagram.name })
    return json.diagram
  }

  async renameDiagram(id: number, name: string): Promise<Diagram> {
    logger.info('ExtensionApiClient', 'renameDiagram', { id, name })
    const res = await this.diagramClient.renameDiagram({ diagramId: id, name })
    const json = j<{ diagram: Diagram }>(RenameDiagramResponseSchema, res)
    logger.debug('ExtensionApiClient', 'renameDiagram: done')
    return json.diagram
  }

  async deleteDiagram(orgId: string, id: number): Promise<void> {
    logger.info('ExtensionApiClient', 'deleteDiagram', { orgId, id })
    await this.diagramClient.deleteDiagram({ orgId, diagramId: id })
    logger.debug('ExtensionApiClient', 'deleteDiagram: done')
  }

  async createObject(props: {
    name: string
    type?: string
    filePath?: string
  }): Promise<{ id: number }> {
    logger.debug('ExtensionApiClient', 'createObject', { name: props.name, type: props.type })
    const res = await this.diagramClient.createObject({
      name: props.name,
      type: props.type,
      filePath: props.filePath,
      technologyLinks: [],
      tags: [],
    })
    const json = j<{ object: { id: number } }>(CreateObjectResponseSchema, res)
    logger.trace('ExtensionApiClient', 'createObject: created', { id: json.object.id })
    return { id: json.object.id }
  }

  async addObjectToDiagram(diagramId: number, objectId: number, x: number, y: number): Promise<void> {
    logger.trace('ExtensionApiClient', 'addObjectToDiagram', { diagramId, objectId, x, y })
    await this.diagramClient.addObjectToDiagram({ diagramId, objectId, positionX: x, positionY: y })
  }
}
