import { EventEmitter } from 'events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(), existsSync: vi.fn(), autoStart: true,
  watch: { initialize: vi.fn(), start: vi.fn(), stop: vi.fn(), dispose: vi.fn(), getStatus: vi.fn() },
  listDiagrams: vi.fn(),
}))
vi.mock('vscode', () => ({
  workspace: { getConfiguration: () => ({ get: (key: string, fallback: unknown) => key === 'autoStartWatch' ? mocks.autoStart : fallback }) },
  window: { createOutputChannel: () => ({ appendLine: vi.fn() }), showErrorMessage: vi.fn(), showWarningMessage: vi.fn() },
}))
vi.mock('child_process', () => ({ spawn: mocks.spawn }))
vi.mock('fs', () => ({ existsSync: mocks.existsSync }))
vi.mock('http', () => ({ get: (_url: string, callback: (response: unknown) => void) => {
  callback({ statusCode: 200, resume: vi.fn() })
  return { on: () => ({ setTimeout: vi.fn() }) }
} }))
vi.mock('../watch/WatchService', () => ({ WatchService: vi.fn(function() { return mocks.watch }) }))
vi.mock('../api/ExtensionApiClient', () => ({ ExtensionApiClient: vi.fn(function() { return { listDiagrams: mocks.listDiagrams } }) }))
import { LocalDataSource } from './LocalDataSource'

let ds: LocalDataSource
let child: EventEmitter & { kill: ReturnType<typeof vi.fn>; stdout: EventEmitter; stderr: EventEmitter; exitCode: null; signalCode: null }
beforeEach(() => {
  vi.clearAllMocks()
  mocks.autoStart = true
  mocks.existsSync.mockReturnValue(true)
  mocks.listDiagrams.mockResolvedValue([{ id: 1 }])
  child = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(), stderr: new EventEmitter(), exitCode: null, signalCode: null,
    kill: vi.fn(() => { queueMicrotask(() => child.emit('close', 0)); return true }),
  })
  mocks.spawn.mockReturnValue(child)
  ds = new LocalDataSource('/custom/tld', '/workspace', '127.0.0.1', 1234)
})
afterEach(async () => { await ds.disconnect() })

describe('local server and index lifecycle', () => {
  it('runs a foreground server with the selected CLI ahead of PATH', async () => {
    await ds.connect()
    expect(mocks.spawn).toHaveBeenCalledWith('/custom/tld', [
      'serve', '--foreground', '--workspace', '/workspace', '--host', '127.0.0.1', '--port', '1234',
    ], expect.objectContaining({ env: expect.objectContaining({ PATH: expect.stringMatching(/^\/custom[:;]/) }) }))
    expect(mocks.watch.start).toHaveBeenCalledOnce()
  })

  it('honors autoStartWatch=false without disabling diagrams or monitoring', async () => {
    mocks.autoStart = false
    await ds.connect()
    expect(mocks.watch.initialize).toHaveBeenCalledOnce()
    expect(mocks.watch.start).not.toHaveBeenCalled()
    await expect(ds.listDiagrams()).resolves.toEqual([{ id: 1 }])
  })

  it('keeps the API server and client alive when indexing stops', async () => {
    await ds.connect()
    await ds.stopWatch()
    expect(mocks.watch.stop).toHaveBeenCalledOnce()
    expect(child.kill).not.toHaveBeenCalled()
    expect(ds.getWatchService()).toBe(mocks.watch)
    await expect(ds.listDiagrams()).resolves.toEqual([{ id: 1 }])
  })

  it('disposes monitoring and waits for its own server to close on disconnect', async () => {
    await ds.connect()
    await ds.disconnect()
    expect(mocks.watch.dispose).toHaveBeenCalledOnce()
    expect(child.kill).toHaveBeenCalledOnce()
    expect(ds.getWatchService()).toBeUndefined()
  })
})
