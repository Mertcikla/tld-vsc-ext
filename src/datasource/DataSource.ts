import type * as vscode from 'vscode'
import type { Diagram, DiagElementData, ViewMarkdownDocument } from '../api/ExtensionApiClient'

export interface WatchEvent {
  type: string
  repository_id?: number
  message?: string
  at: string
  data?: any
  phase?: string
  watcher_mode?: string
  languages?: string[]
  changed_files?: number
  warnings?: string[]
}

export interface WatchStatus {
  active: boolean
  repository?: string
  lock?: { pid: number; token: string }
  connected_clients?: number
}

export interface DataSource {
  mode: 'local'

  connect(): Promise<void>
  disconnect(): void

  listDiagrams(): Promise<Diagram[]>
  createDiagram(name: string, parentDiagramId?: number): Promise<Diagram>
  renameDiagram(id: number, name: string): Promise<Diagram>
  deleteDiagram(id: number): Promise<void>

  listElements(): Promise<DiagElementData[]>
  createElement(props: {
    name: string
    type?: string
    filePath?: string
  }): Promise<{ id: number }>
  addElementToDiagram(diagramId: number, objectId: number, x: number, y: number): Promise<void>
  listElementPlacements(elementId: number): Promise<{ view_id: number; view_name: string }[]>
  getViewMarkdown(viewId: number): Promise<{ markdown: ViewMarkdownDocument; content: string } | null>
  saveViewMarkdown(viewId: number, content: string): Promise<ViewMarkdownDocument>

  isWatchAvailable(): boolean
  startWatch(path: string): Promise<void>
  stopWatch(): Promise<void>
  getWatchStatus(): WatchStatus | null
  onWatchEvent(listener: (event: WatchEvent) => void): vscode.Disposable
}
