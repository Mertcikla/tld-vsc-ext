import * as path from 'path'
import * as vscode from 'vscode'
import { logger } from '../logger'
import type { DataSource } from '../datasource/DataSource'
import type { MessageRouter } from './MessageRouter'

type MarkdownEntry = {
  viewId: number
  path: string
  content: string
  ctime: number
  mtime: number
}

export type MarkdownDocumentSavedEvent = {
  viewId: number
  path: string
  isManaged: boolean
  content: string
  updatedAt: string
}

export class MarkdownDocumentService implements vscode.FileSystemProvider {
  private readonly entries = new Map<string, MarkdownEntry>()
  private dataSource: DataSource | undefined
  private readonly emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>()
  private readonly savedEmitter = new vscode.EventEmitter<MarkdownDocumentSavedEvent>()
  readonly onDidChangeFile = this.emitter.event
  readonly onDidSaveMarkdown = this.savedEmitter.event

  updateDataSource(dataSource: DataSource): void {
    this.dataSource = dataSource
  }

  registerRouter(router: MessageRouter): void {
    router.register('open-markdown', async (msg) => {
      if (msg.type !== 'open-markdown') return
      await this.openMarkdown({
        viewId: msg.viewId,
        path: msg.path,
        content: msg.content,
        viewColumn: msg.viewColumn,
      })
    })
  }

  async openMarkdown(params: {
    viewId: number
    path: string
    content?: string
    viewColumn?: 'active' | 'beside'
  }): Promise<void> {
    if (!this.dataSource) {
      vscode.window.showWarningMessage('tlDiagram is not connected yet.')
      return
    }

    const loaded = await this.dataSource.getViewMarkdown(params.viewId)
    const content = loaded?.content ?? params.content ?? ''
    const docPath = loaded?.markdown.path ?? params.path
    const uri = this.uriFor(params.viewId, docPath)
    const now = Date.now()
    this.entries.set(this.key(uri), {
      viewId: params.viewId,
      path: docPath,
      content,
      ctime: now,
      mtime: now,
    })

    logger.info('MarkdownDocumentService', 'open-markdown', {
      viewId: params.viewId,
      path: docPath,
      viewColumn: params.viewColumn,
    })

    this.emitter.fire([{ type: vscode.FileChangeType.Changed, uri }])
    const document = await vscode.workspace.openTextDocument(uri)
    const pos = new vscode.Position(0, 0)
    await vscode.window.showTextDocument(document, {
      viewColumn: params.viewColumn === 'beside' ? vscode.ViewColumn.Beside : undefined,
      selection: new vscode.Range(pos, pos),
      preserveFocus: false,
    })
  }

  watch(): vscode.Disposable {
    return new vscode.Disposable(() => {})
  }

  stat(uri: vscode.Uri): vscode.FileStat {
    const entry = this.getEntry(uri)
    return {
      type: vscode.FileType.File,
      ctime: entry.ctime,
      mtime: entry.mtime,
      size: Buffer.byteLength(entry.content, 'utf8'),
    }
  }

  readFile(uri: vscode.Uri): Uint8Array {
    return new TextEncoder().encode(this.getEntry(uri).content)
  }

  async writeFile(uri: vscode.Uri, content: Uint8Array): Promise<void> {
    const entry = this.getEntry(uri)
    if (!this.dataSource) throw vscode.FileSystemError.Unavailable(uri)

    const nextContent = new TextDecoder().decode(content)
    try {
      const updated = await this.dataSource.saveViewMarkdown(entry.viewId, nextContent)
      entry.path = updated.path
      entry.content = nextContent
      entry.mtime = Date.now()
      this.emitter.fire([{ type: vscode.FileChangeType.Changed, uri }])
      this.savedEmitter.fire({
        viewId: entry.viewId,
        path: updated.path,
        isManaged: updated.is_managed,
        content: nextContent,
        updatedAt: updated.updated_at,
      })
      logger.info('MarkdownDocumentService', 'save-markdown', {
        viewId: entry.viewId,
        path: updated.path,
      })
    } catch (error) {
      logger.error('MarkdownDocumentService', 'save-markdown failed', {
        viewId: entry.viewId,
        path: entry.path,
        error: String(error),
      })
      vscode.window.showErrorMessage(`Failed to save tlDiagram notes: ${String(error)}`)
      throw vscode.FileSystemError.Unavailable(uri)
    }
  }

  readDirectory(): [string, vscode.FileType][] {
    return []
  }

  createDirectory(uri: vscode.Uri): void {
    throw vscode.FileSystemError.NoPermissions(uri)
  }

  delete(uri: vscode.Uri): void {
    throw vscode.FileSystemError.NoPermissions(uri)
  }

  rename(oldUri: vscode.Uri): void {
    throw vscode.FileSystemError.NoPermissions(oldUri)
  }

  private uriFor(viewId: number, docPath: string): vscode.Uri {
    const basename = path.basename(docPath) || `view-${viewId}.md`
    return vscode.Uri.from({
      scheme: 'tldiagram-markdown',
      authority: String(viewId),
      path: `/${basename}`,
    })
  }

  private key(uri: vscode.Uri): string {
    return uri.toString()
  }

  private getEntry(uri: vscode.Uri): MarkdownEntry {
    const entry = this.entries.get(this.key(uri))
    if (!entry) throw vscode.FileSystemError.FileNotFound(uri)
    return entry
  }
}
