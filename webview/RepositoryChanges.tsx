import React, { useEffect, useState } from 'react'
import { api, RepositoryChangeCanvas, type RepositoryImpact } from './core'
import type { RepositoryChangeTarget } from '../src/webview/vscodeMessages'

declare global {
  interface Window {
    __TLD_REPOSITORY_CHANGE__?: RepositoryChangeTarget
  }
}

export default function RepositoryChanges({ initialTarget }: { initialTarget: RepositoryChangeTarget }) {
  const [target, setTarget] = useState(initialTarget)
  const [focusRequest, setFocusRequest] = useState(0)
  const [diagram, setDiagram] = useState<RepositoryImpact | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      const msg = event.data
      if (msg?.type !== 'focus-repository-change' || typeof msg.repositoryId !== 'string' || typeof msg.filePath !== 'string') return
      setTarget({ repositoryId: msg.repositoryId, filePath: msg.filePath })
      // A second click on the same change should focus it again after panning.
      setFocusRequest((request) => request + 1)
    }
    window.addEventListener('message', receive)
    window.__TLD_VSCODE_API__?.postMessage({ type: 'ready' })
    return () => window.removeEventListener('message', receive)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    setDiagram(null)
    const poll = async () => {
      try {
        const result = await api.repositories.liveImpact(target.repositoryId, controller.signal)
        if (controller.signal.aborted) return
        setDiagram((old) => result.diagram?.version === old?.version ? old : result.diagram)
        setError(result.error)
        if (result.diagram) window.__TLD_VSCODE_API__?.postMessage({
          type: 'repository-change-loaded', repositoryId: target.repositoryId,
        })
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : String(error))
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(poll, 2000)
      }
    }
    void poll()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [target.repositoryId])

  return <div style={{ display: 'flex', flexDirection: 'column', height: 'var(--app-viewport-height, 100vh)', minHeight: 0, background: 'var(--bg-canvas)' }}>
    {error && <p style={{ padding: 12, color: 'var(--vscode-errorForeground, #fc8181)' }}>{error}</p>}
    <RepositoryChangeCanvas
      key={`${target.repositoryId}:${focusRequest}`}
      diagram={diagram}
      selectedPath={target.filePath}
      emptyMessage="Waiting for the watcher to prepare the live change map."
    />
  </div>
}
