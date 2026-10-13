import { EventEmitter } from 'events'
import * as fs from 'fs'
import * as path from 'path'
import { createClient } from '@connectrpc/connect'
import { createConnectTransport } from '@connectrpc/connect-web'
import { CodeIndexService, RepositoryService, ChangeKind, type Repository, type WatchStatus as RepositoryWatchStatus } from '@buf/tldiagramcom_diagram.bufbuild_es/codeindex/v1/codeindex_pb'
import { logger } from '../logger'
import type { WatchEvent, WatchStatus } from '../datasource/DataSource'

export interface WatchDiff {
  repositoryId: string
  filePath: string
  change_type: 'added' | 'modified' | 'removed'
  resource_type: string
  name: string
}

function canonicalPath(value: string): string {
  try { return fs.realpathSync(value) } catch { return path.resolve(value) }
}

/** v2.4.3 exposes repository watch state over ConnectRPC, not /api/watch/ws. */
export class WatchService {
  private readonly repositories
  private readonly codeIndex
  private readonly events = new EventEmitter()
  private timer: ReturnType<typeof setTimeout> | undefined
  private controller: AbortController | undefined
  private currentStatus: WatchStatus = { active: false }
  private lastError = ''
  private fingerprint: string | undefined
  private repoPath: string

  constructor(baseUrl: string, repoPath: string) {
    this.repoPath = canonicalPath(repoPath)
    const transport = createConnectTransport({ baseUrl: `${baseUrl}/api` })
    this.repositories = createClient(RepositoryService, transport)
    this.codeIndex = createClient(CodeIndexService, transport)
  }

  async initialize(): Promise<void> {
    this.dispose()
    this.controller = new AbortController()
    await this.requestStatus()
    this.schedulePoll()
  }

  private emit(type: string, data?: unknown, message?: string): void {
    this.events.emit('event', { type, data, message, at: new Date().toISOString() } satisfies WatchEvent)
  }

  private async repository(): Promise<Repository | undefined> {
    const { repositories } = await this.repositories.listRepositories({}, { signal: this.controller?.signal })
    // A VS Code workspace can be a subdirectory of a registered checkout.
    return repositories.filter((repo) => {
      const root = canonicalPath(repo.root)
      return root === this.repoPath || this.repoPath.startsWith(root + path.sep)
    }).sort((a, b) => b.root.length - a.root.length)[0]
  }

  async start(repoPath = this.repoPath): Promise<void> {
    this.repoPath = canonicalPath(repoPath)
    let repo = await this.repository()
    if (!repo) {
      for await (const event of this.repositories.addRepository({ path: this.repoPath, materialize: true })) {
        if (event.event.case === 'repository') repo = event.event.value
      }
    }
    if (!repo) throw new Error('Indexing did not register the repository')
    const status = await this.repositories.getWatchStatus({ id: repo.id })
    if (!status.running) {
      this.updateStatus(await this.repositories.startWatch({ repositoryId: repo.id, materialize: true }))
    } else {
      this.updateStatus(status)
    }
    this.fingerprint = undefined
    await this.requestStatus()
  }

  async stop(): Promise<void> {
    const repo = await this.repository()
    if (repo) this.updateStatus(await this.repositories.stopWatch({ id: repo.id }))
    else this.updateStatus(undefined)
  }

  getStatus(): WatchStatus { return this.currentStatus }

  onEvent(listener: (event: WatchEvent) => void): { dispose: () => void } {
    this.events.on('event', listener)
    return { dispose: () => { this.events.off('event', listener) } }
  }

  private updateStatus(status: RepositoryWatchStatus | undefined): void {
    const active = status?.running ?? false
    const changed = active !== this.currentStatus.active
    this.currentStatus = { active, repository: status?.repoRoot }
    const error = active ? status?.error ?? '' : ''
    if (changed || (this.lastError && !error)) this.emit(active ? 'watch.started' : 'watch.stopped')
    if (error && error !== this.lastError) this.emit('watch.error', undefined, error)
    this.lastError = error
  }

  async requestStatus(): Promise<WatchStatus> {
    const repo = await this.repository()
    if (!repo) {
      this.updateStatus(undefined)
      return this.currentStatus
    }
    const status = await this.repositories.getWatchStatus({ id: repo.id }, { signal: this.controller?.signal })
    this.updateStatus(status)
    const fingerprint = [repo.id, repo.latestSnapshotId, status.snapshotId, status.contentFingerprint, status.lastScanUnix].join(':')
    if (fingerprint !== this.fingerprint) {
      // Fetch before recording the fingerprint so a transient failure is retried.
      const diffs = await this.requestDiff(repo.id)
      this.fingerprint = fingerprint
      this.emit('representation.updated', { diffs })
    }
    return this.currentStatus
  }

  async requestDiff(repositoryId?: string): Promise<WatchDiff[]> {
    const id = repositoryId ?? (await this.repository())?.id
    if (!id) return []
    const impact = await this.codeIndex.getLiveImpact({ id }, { signal: this.controller?.signal })
    return (impact.scene?.files ?? []).flatMap((file): WatchDiff[] => {
      const change = file.change === ChangeKind.ADDED ? 'added'
        : file.change === ChangeKind.REMOVED ? 'removed'
        : file.change === ChangeKind.MODIFIED ? 'modified' : undefined
      return change ? [{ repositoryId: id, filePath: file.path, change_type: change, resource_type: 'file', name: file.path }] : []
    })
  }

  private schedulePoll(controller = this.controller): void {
    if (!controller || controller.signal.aborted || controller !== this.controller) return
    this.timer = setTimeout(async () => {
      try { await this.requestStatus() } catch (error) {
        if (!this.controller?.signal.aborted) logger.warn('WatchService', 'Watch status refresh failed', { error: String(error) })
      } finally { this.schedulePoll(controller) }
    }, 2000)
    this.timer.unref()
  }

  /** Disposing a status subscriber must not stop the repository's watcher. */
  dispose(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = undefined
    this.controller?.abort()
    this.controller = undefined
  }
}
