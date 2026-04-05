import { createClient, ConnectError } from '@connectrpc/connect'
import { createConnectTransport } from '@connectrpc/connect-web'
import { toJson } from '@bufbuild/protobuf'

// Using relative imports to the local gen files — no BSR package needed in the extension host.
// esbuild resolves these at build time.
import {
  DiagramService,
  CreateDiagramResponseSchema,
  RenameDiagramResponseSchema,
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
  }

  async getMe(): Promise<ValidatedUser> {
    // AuthService.GetMe only works with session cookies, not API keys.
    // Validate by calling a resource endpoint instead — ListDiagrams proves
    // the key is valid and returns org-scoped data.
    try {
      await this.diagramClient.listDiagrams({})
      // Key is valid; return a minimal user object (we don't get user/org info this way)
      return { username: 'API Key', orgName: '', orgId: '' }
    } catch (e) {
      if (e instanceof ConnectError) throw new Error(e.message)
      throw e
    }
  }

  async listDiagrams(): Promise<Diagram[]> {
    const res = await this.diagramClient.listDiagrams({})
    return (res.diagrams ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description ?? null,
      level_label: d.levelLabel ?? null,
      level: d.level,
      created_at: d.createdAt ? new Date(Number(d.createdAt.seconds) * 1000).toISOString() : new Date().toISOString(),
      updated_at: d.updatedAt ? new Date(Number(d.updatedAt.seconds) * 1000).toISOString() : new Date().toISOString(),
      parent_diagram_id: d.parentDiagramId ?? null,
    }))
  }

  async createDiagram(name: string, parentDiagramId?: number): Promise<Diagram> {
    const res = await this.diagramClient.createDiagram({ name, parentDiagramId })
    const json = j<{ diagram: Diagram }>(CreateDiagramResponseSchema, res)
    return json.diagram
  }

  async renameDiagram(id: number, name: string): Promise<Diagram> {
    const res = await this.diagramClient.renameDiagram({ diagramId: id, name })
    const json = j<{ diagram: Diagram }>(RenameDiagramResponseSchema, res)
    return json.diagram
  }

  async deleteDiagram(orgId: string, id: number): Promise<void> {
    await this.diagramClient.deleteDiagram({ orgId, diagramId: id })
  }
}
