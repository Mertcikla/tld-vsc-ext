import { describe, expect, it, vi, beforeEach } from 'vitest'

function mockVSCode(): void {
  vi.doMock('vscode', () => ({
    workspace: {
      getConfiguration: () => ({
        get: (_key: string, fallback: unknown) => fallback,
      }),
    },
    window: {
      createOutputChannel: () => ({
        appendLine: vi.fn(),
        show: vi.fn(),
        dispose: vi.fn(),
      }),
    },
  }))
}

describe('WatchService', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('sends watch.stop before closing the websocket', async () => {
    mockVSCode()
    const { WatchService } = await import('./WatchService')
    const service = new WatchService('http://127.0.0.1:18080', '/repo')
    const ws = {
      send: vi.fn(),
      close: vi.fn(),
    }
    ;(service as any).ws = ws

    await service.stop()

    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: 'watch.stop' }))
    expect(ws.close).toHaveBeenCalled()
    expect(service.getStatus()).toEqual({ active: false })
  })
})
