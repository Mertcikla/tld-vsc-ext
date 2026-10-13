import { beforeEach, expect, it, vi } from 'vitest'
import type * as vscode from 'vscode'

const mocks = vi.hoisted(() => ({ createPanel: vi.fn() }))
vi.mock('vscode', () => ({
  ViewColumn: { One: 1 },
  Uri: { joinPath: (...parts: string[]) => parts.join('/') },
  window: { createWebviewPanel: mocks.createPanel, createOutputChannel: () => ({ appendLine: vi.fn() }) },
  workspace: { getConfiguration: () => ({ get: (_: string, fallback: unknown) => fallback }) },
}))
vi.mock('./WorkspaceSymbolService', () => ({ WorkspaceSymbolService: class {} }))
import { WebviewManager } from './WebviewManager'

let receive: (message: unknown) => void
let close: () => void
let panel: {
  active: boolean; reveal: ReturnType<typeof vi.fn>; onDidDispose: ReturnType<typeof vi.fn>
  webview: { html: string; cspSource: string; asWebviewUri: (uri: string) => string; postMessage: ReturnType<typeof vi.fn>; onDidReceiveMessage: ReturnType<typeof vi.fn> }
}
let manager: WebviewManager
beforeEach(() => {
  vi.clearAllMocks()
  panel = {
    active: true, reveal: vi.fn(), onDidDispose: vi.fn((callback) => { close = callback }),
    webview: {
      html: '', cspSource: 'vscode-webview:', asWebviewUri: (uri) => uri, postMessage: vi.fn(),
      onDidReceiveMessage: vi.fn((callback) => { receive = callback; return { dispose: vi.fn() } }),
    },
  }
  mocks.createPanel.mockReturnValue(panel)
  manager = new WebviewManager('/extension' as unknown as vscode.Uri)
})

it('reuses one repository tab and sends the latest click after the webview is ready', async () => {
  await manager.openRepositoryChange({ repositoryId: 'repo', filePath: 'src/first.ts' })
  await manager.openRepositoryChange({ repositoryId: 'repo', filePath: 'src/latest.ts' })
  expect(mocks.createPanel).toHaveBeenCalledTimes(1)
  expect(panel.reveal).toHaveBeenCalled()
  expect(panel.webview.postMessage).not.toHaveBeenCalled()
  receive({ type: 'ready' })
  expect(panel.webview.postMessage).toHaveBeenLastCalledWith({ type: 'focus-repository-change', repositoryId: 'repo', filePath: 'src/latest.ts' })
  await manager.openRepositoryChange({ repositoryId: 'repo', filePath: 'src/latest.ts' })
  expect(panel.webview.postMessage).toHaveBeenCalledTimes(2)
})

it('retains repository identity and safely injects file names containing HTML', async () => {
  const target = { repositoryId: 'repo', filePath: 'src/</script><file>.ts' }
  await manager.openRepositoryChange(target)
  const payload = panel.webview.html.match(/window\.__TLD_REPOSITORY_CHANGE__ = (.*);/)![1]
  expect(payload).not.toContain('<')
  expect(JSON.parse(payload)).toEqual(target)
  receive({ type: 'repository-change-loaded', repositoryId: 'other' })
  expect(manager.getRepositoryChangeState('repo')?.loaded).toBe(false)
  receive({ type: 'repository-change-loaded', repositoryId: 'repo' })
  expect(manager.getRepositoryChangeState('repo')?.loaded).toBe(true)
})

it('creates a fresh tab after the previous repository tab closes', async () => {
  const target = { repositoryId: 'repo', filePath: 'src/file.ts' }
  await manager.openRepositoryChange(target)
  close()
  expect(manager.getRepositoryChangeState('repo')).toBeUndefined()
  await manager.openRepositoryChange(target)
  expect(mocks.createPanel).toHaveBeenCalledTimes(2)
})

it('allows packaged lazy modules and supplies the same nonce to Vite preload links', async () => {
  await manager.openRepositoryChange({ repositoryId: 'repo', filePath: 'src/file.ts' })
  const html = panel.webview.html
  const scriptPolicy = html.match(/script-src ([^;]+);/)![1]
  const nonce = html.match(/<script nonce="([^"]+)"/)![1]
  expect(scriptPolicy).toContain(panel.webview.cspSource)
  expect(scriptPolicy).toContain(`'nonce-${nonce}'`)
  expect(scriptPolicy).not.toContain("'unsafe-inline'")
  expect(scriptPolicy).not.toContain("'unsafe-eval'")
  expect(html).toContain(`<meta property="csp-nonce" nonce="${nonce}">`)
})
