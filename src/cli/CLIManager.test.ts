import { describe, expect, it, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'

function mockVSCode(cliPath: string): void {
  vi.doMock('vscode', () => ({
    workspace: {
      getConfiguration: () => ({
        get: (key: string, fallback: unknown) => key === 'cliPath' ? cliPath : fallback,
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

function mockSpawn(stdout: string, code = 0): ReturnType<typeof vi.fn> {
  const spawn = vi.fn(() => {
    const proc = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter
      stderr: EventEmitter
    }
    proc.stdout = new EventEmitter()
    proc.stderr = new EventEmitter()
    process.nextTick(() => {
      if (stdout) proc.stdout.emit('data', Buffer.from(stdout))
      proc.emit('close', code)
    })
    return proc
  })
  vi.doMock('child_process', () => ({ spawn }))
  return spawn
}

describe('CLIManager', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('uses configured cliPath before PATH lookup', async () => {
    mockVSCode('/custom/tld')
    vi.doMock('fs', () => ({ existsSync: vi.fn(() => true) }))
    const spawn = mockSpawn('/path/tld\n')

    const { CLIManager } = await import('./CLIManager')
    const manager = new CLIManager()

    await expect(manager.detect()).resolves.toBe('/custom/tld')
    expect(spawn).not.toHaveBeenCalled()
  })

  it('returns null with a clear missing-CLI result when no configured path or PATH binary exists', async () => {
    mockVSCode('')
    vi.doMock('fs', () => ({ existsSync: vi.fn(() => false) }))
    mockSpawn('', 1)

    const { CLIManager } = await import('./CLIManager')
    const manager = new CLIManager()

    await expect(manager.detect()).resolves.toBeNull()
  })
})
