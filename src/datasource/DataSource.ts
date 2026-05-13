import type * as vscode from 'vscode'
import type { Diagram, DiagElementData } from '../api/ExtensionApiClient'

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

export interface DiffResult {
  changed: boolean
  scan: any
  representation: any
  diffs: any[]
}

export interface SyncStatus {
  localChanges: number
  needsPush: boolean
  needsPull: boolean
}

export interface DataSource {
  mode: 'local' | 'cloud'

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

  isWatchAvailable(): boolean
  startWatch(path: string): Promise<void>
  stopWatch(): Promise<void>
  getWatchStatus(): WatchStatus | null
  onWatchEvent(listener: (event: WatchEvent) => void): vscode.Disposable

  exportToCloud(): Promise<void>
  importFromCloud(): Promise<void>
  diffWithCloud(): Promise<DiffResult>
  getSyncStatus(): Promise<SyncStatus>
}
