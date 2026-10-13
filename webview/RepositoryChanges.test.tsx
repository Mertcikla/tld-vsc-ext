import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const apiMock = vi.hoisted(() => ({ liveImpact: vi.fn() }))
vi.mock('./core', () => ({ api: { repositories: apiMock }, RepositoryChangeCanvas: (props: object) => React.createElement('change-canvas', props) }))
import RepositoryChanges from './RepositoryChanges'

let renderer: ReactTestRenderer
let receive: (event: { data: unknown }) => void
const postMessage = vi.fn()
beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  apiMock.liveImpact.mockResolvedValue({ diagram: { version: '1', repositoryId: 'repo-A' }, error: '' })
  vi.stubGlobal('window', {
    addEventListener: (_type: string, listener: typeof receive) => { receive = listener },
    removeEventListener: vi.fn(), __TLD_VSCODE_API__: { postMessage },
  })
})
afterEach(() => { act(() => renderer?.unmount()); vi.useRealTimers(); vi.unstubAllGlobals() })

it('loads live changes and gives the shared canvas the selected file to focus', async () => {
  await act(async () => { renderer = create(<RepositoryChanges initialTarget={{ repositoryId: 'repo-A', filePath: 'src/a.ts' }} />) })
  const canvas = renderer.root.findByType('change-canvas')
  expect(canvas.props.selectedPath).toBe('src/a.ts')
  expect(canvas.props.diagram.repositoryId).toBe('repo-A')
  expect(apiMock.liveImpact).toHaveBeenCalledWith('repo-A', expect.any(AbortSignal))
  expect(postMessage).toHaveBeenCalledWith({ type: 'ready' })
})

it('refocuses the same file on repeated clicks and updates selection in the reused tab', async () => {
  await act(async () => { renderer = create(<RepositoryChanges initialTarget={{ repositoryId: 'repo-A', filePath: 'src/a.ts' }} />) })
  const first = renderer.root.findByType('change-canvas')
  await act(async () => { receive({ data: { type: 'focus-repository-change', repositoryId: 'repo-A', filePath: 'src/a.ts' } }) })
  expect(renderer.root.findByType('change-canvas')).not.toBe(first)
  await act(async () => { receive({ data: { type: 'focus-repository-change', repositoryId: 'repo-A', filePath: 'src/deleted.ts' } }) })
  expect(renderer.root.findByType('change-canvas').props.selectedPath).toBe('src/deleted.ts')
  await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
  expect(apiMock.liveImpact).toHaveBeenCalledTimes(2)
  act(() => renderer.unmount())
  expect(vi.getTimerCount()).toBe(0)
})
