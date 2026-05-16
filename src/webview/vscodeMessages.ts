export interface WorkspaceSymbol {
  name: string
  kind: string
  filePath: string
  startLine: number
}

export type WebviewToExtensionMessage =
  | { type: 'ready' }
  | {
      type: 'open-file'
      filePath: string
      startLine?: number
      symbolName?: string
      symbolKind?: string
    }
  | { type: 'request-workspace-files'; requestId: string; pattern: string }
  | { type: 'request-symbol-list-for-file'; requestId: string; filePath: string }
  | { type: 'diagram-loaded'; diagramId: number; elements: Array<{ id?: number; name?: string }> }
  | { type: 'request-file-content'; requestId: string; filePath: string; startLine: number }
