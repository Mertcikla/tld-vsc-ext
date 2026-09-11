import * as vscode from 'vscode'
import { logger } from '../logger'
import type { WatchEvent } from '../datasource/DataSource'
import type { WatchService } from './WatchService'

type LspServerStatus = {
  language?: string
  command?: string
  state?: string
  last_error?: string
}

type LspStatusData = {
  enabled?: boolean
  servers?: LspServerStatus[]
  summary?: {
    requested?: number
    available?: number
    active?: number
    unavailable?: number
    failed?: number
    memory_limited?: number
  }
}

const DEGRADED_STATES = new Set(['unavailable', 'failed', 'memory_limited'])

/**
 * Surfaces degraded LSP state as a prominent VS Code warning. The CLI can run
 * without language servers, but reference resolution and connector generation
 * are materially worse, so this must not pass silently inside the extension.
 */
export class LspStatusNotifier {
  private notified = false
  private readonly subscription: { dispose: () => void }

  constructor(private readonly watchService: WatchService) {
    this.subscription = watchService.onEvent((event) => this.handle(event))
  }

  private handle(event: WatchEvent): void {
    if (event.type !== 'lsp.status') return
    const status = event.data as LspStatusData | undefined
    if (!status?.enabled) return

    const summary = status.summary
    const degraded = (summary?.unavailable ?? 0) + (summary?.failed ?? 0) + (summary?.memory_limited ?? 0)
    if (degraded <= 0) return

    const languages = (status.servers ?? [])
      .filter((server) => server.state != null && DEGRADED_STATES.has(server.state))
      .map((server) => server.language)
      .filter((language): language is string => Boolean(language))

    logger.warn('LspStatusNotifier', 'Language servers degraded', {
      degraded,
      requested: summary?.requested,
      available: summary?.available,
      languages,
    })

    if (this.notified) return
    this.notified = true

    const languageList = languages.length > 0 ? languages.join(', ') : `${degraded} language(s)`
    void vscode.window
      .showWarningMessage(
        `tlDiagram needs language servers to analyze your code accurately. Missing or unhealthy: ${languageList}. ` +
          'Without them, diagram connectors and code-to-diagram links will be incomplete or missing.',
        'Show Logs',
        'Documentation',
      )
      .then((choice) => {
        if (choice === 'Show Logs') void vscode.commands.executeCommand('tldiagram.showLogs')
        if (choice === 'Documentation') void vscode.commands.executeCommand('tldiagram.openDocs')
      })
  }

  dispose(): void {
    this.subscription.dispose()
  }
}
