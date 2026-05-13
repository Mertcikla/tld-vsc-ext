import * as vscode from 'vscode'
import { logger } from '../logger'
import { ExtensionApiClient, type Diagram, type DiagElementData } from '../api/ExtensionApiClient'
import type { DataSource, WatchEvent, WatchStatus, DiffResult, SyncStatus } from './DataSource'

export class CloudDataSource implements DataSource {
  readonly mode = 'cloud' as const

  private client: ExtensionApiClient
  private orgId: string | undefined

  constructor(
    serverUrl: string,
    apiKey: string,
  ) {
    this.client = new ExtensionApiClient(serverUrl, apiKey)
  }

  async connect(): Promise<void> {
    const user = await this.client.getMe()
    this.orgId = user.orgId
    logger.info('CloudDataSource', 'Connected', { orgId: this.orgId })
  }

  disconnect(): void {
    this.orgId = undefined
    logger.info('CloudDataSource', 'Disconnected')
  }

  get serverUrl(): string {
    return vscode.workspace.getConfiguration('tldiagram').get<string>('serverUrl', 'https://tldiagram.com').replace(/\/$/, '')
  }

  listDiagrams(): Promise<Diagram[]> {
    return this.client.listDiagrams()
  }

  createDiagram(name: string, parentDiagramId?: number): Promise<Diagram> {
    return this.client.createDiagram(name, parentDiagramId)
  }

  renameDiagram(id: number, name: string): Promise<Diagram> {
    return this.client.renameDiagram(id, name)
  }

  async deleteDiagram(id: number): Promise<void> {
    if (!this.orgId) throw new Error('Not connected')
    await this.client.deleteDiagram(this.orgId, id)
  }

  listElements(): Promise<DiagElementData[]> {
    return this.client.listElements()
  }

  createElement(props: { name: string; type?: string; filePath?: string }): Promise<{ id: number }> {
    return this.client.createElement(props)
  }

  addElementToDiagram(diagramId: number, objectId: number, x: number, y: number): Promise<void> {
    return this.client.addElementToDiagram(diagramId, objectId, x, y)
  }

  listElementPlacements(elementId: number): Promise<{ view_id: number; view_name: string }[]> {
    return this.client.listElementPlacements(elementId)
  }

  isWatchAvailable(): boolean {
    return false
  }

  startWatch(_path: string): Promise<void> {
    throw new Error('Watch is not available in cloud mode')
  }

  stopWatch(): Promise<void> {
    throw new Error('Watch is not available in cloud mode')
  }

  getWatchStatus(): WatchStatus | null {
    return null
  }

  onWatchEvent(_listener: (event: WatchEvent) => void): vscode.Disposable {
    return new vscode.Disposable(() => {})
  }

  exportToCloud(): Promise<void> {
    throw new Error('Already in cloud mode')
  }

  importFromCloud(): Promise<void> {
    throw new Error('Already in cloud mode')
  }

  diffWithCloud(): Promise<DiffResult> {
    throw new Error('Already in cloud mode')
  }

  getSyncStatus(): Promise<SyncStatus> {
    return Promise.resolve({ localChanges: 0, needsPush: false, needsPull: false })
  }
}
