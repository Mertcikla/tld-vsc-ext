import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.hoisted(() => ({
  repositories: {
    listRepositories: vi.fn(), getWatchStatus: vi.fn(), startWatch: vi.fn(), stopWatch: vi.fn(), addRepository: vi.fn(),
  },
  codeIndex: { getLiveImpact: vi.fn() },
}))
vi.mock('vscode', () => ({
  workspace: { getConfiguration: () => ({ get: (_key: string, fallback: unknown) => fallback }) },
  window: { createOutputChannel: () => ({ appendLine: vi.fn() }) },
}))
vi.mock('@connectrpc/connect', () => ({ createClient: (service: string) => service === 'repositories' ? rpc.repositories : rpc.codeIndex }))
vi.mock('@connectrpc/connect-web', () => ({ createConnectTransport: vi.fn() }))
vi.mock('@buf/tldiagramcom_diagram.bufbuild_es/codeindex/v1/codeindex_pb', () => ({
  RepositoryService: 'repositories', CodeIndexService: 'index', ChangeKind: { ADDED: 1, MODIFIED: 2, REMOVED: 3 },
}))
import { WatchService } from './WatchService'

const repo = { id: 'repo', root: '/repo', latestSnapshotId: 'base' }
const status = { running: false, repoRoot: '/repo', snapshotId: 'base', contentFingerprint: '', lastScanUnix: 0n }
let service: WatchService
beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  rpc.repositories.listRepositories.mockResolvedValue({ repositories: [repo] })
  rpc.repositories.getWatchStatus.mockResolvedValue(status)
  rpc.repositories.startWatch.mockResolvedValue({ ...status, running: true })
  rpc.repositories.stopWatch.mockResolvedValue(status)
  rpc.codeIndex.getLiveImpact.mockResolvedValue({})
  service = new WatchService('http://localhost:1234', '/repo')
})
afterEach(() => { service.dispose(); vi.useRealTimers() })

describe('repository watch RPC lifecycle', () => {
  it('monitors without starting or stopping a watcher', async () => {
    await service.initialize()
    service.dispose()
    expect(rpc.repositories.startWatch).not.toHaveBeenCalled()
    expect(rpc.repositories.stopWatch).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('starts the matching checkout, rather than the first repository', async () => {
    rpc.repositories.listRepositories.mockResolvedValue({ repositories: [{ ...repo, id: 'other', root: '/other' }, repo] })
    await service.start()
    expect(rpc.repositories.startWatch).toHaveBeenCalledWith({ repositoryId: 'repo', materialize: true })
  })

  it('does not duplicate a running external watcher', async () => {
    rpc.repositories.getWatchStatus.mockResolvedValue({ ...status, running: true })
    await service.start()
    expect(rpc.repositories.startWatch).not.toHaveBeenCalled()
    expect(service.getStatus().active).toBe(true)
  })

  it('registers a new repository before starting its watcher', async () => {
    rpc.repositories.listRepositories.mockResolvedValueOnce({ repositories: [] })
    rpc.repositories.addRepository.mockImplementation(async function* () {
      yield { event: { case: 'repository', value: repo } }
    })
    await service.start()
    expect(rpc.repositories.addRepository).toHaveBeenCalledWith({ path: '/repo', materialize: true })
    expect(rpc.repositories.startWatch).toHaveBeenCalledWith({ repositoryId: 'repo', materialize: true })
  })

  it('stops watching while retaining status monitoring', async () => {
    rpc.repositories.getWatchStatus.mockResolvedValue({ ...status, running: true })
    await service.initialize()
    await service.stop()
    expect(rpc.repositories.stopWatch).toHaveBeenCalledWith({ id: 'repo' })
    expect(service.getStatus().active).toBe(false)
    expect(vi.getTimerCount()).toBe(1)
  })

  it('refreshes changes after a new scan and ignores unchanged context files', async () => {
    const listener = vi.fn()
    service.onEvent(listener)
    await service.initialize()
    listener.mockClear()
    rpc.repositories.getWatchStatus.mockResolvedValue({ ...status, running: true, contentFingerprint: 'changed', lastScanUnix: 2n })
    rpc.codeIndex.getLiveImpact.mockResolvedValue({ scene: { files: [
      { path: 'src/added.ts', change: 1 }, { path: 'src/edited.ts', change: 2 },
      { path: 'src/deleted.ts', change: 3 }, { path: 'src/context.ts', change: 0 },
    ] } })
    await vi.advanceTimersByTimeAsync(2000)
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      type: 'representation.updated', data: { diffs: [
        { repositoryId: 'repo', filePath: 'src/added.ts', name: 'src/added.ts', resource_type: 'file', change_type: 'added' },
        { repositoryId: 'repo', filePath: 'src/edited.ts', name: 'src/edited.ts', resource_type: 'file', change_type: 'modified' },
        { repositoryId: 'repo', filePath: 'src/deleted.ts', name: 'src/deleted.ts', resource_type: 'file', change_type: 'removed' },
      ] },
    }))
    listener.mockClear()
    await vi.advanceTimersByTimeAsync(2000)
    expect(listener).not.toHaveBeenCalled()
  })
})
