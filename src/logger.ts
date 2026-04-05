import * as vscode from 'vscode'

export type LogLevel = 'off' | 'error' | 'warn' | 'info' | 'debug' | 'trace'

const LEVELS: Record<LogLevel, number> = {
  off: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  trace: 5,
}

/**
 * Singleton logger backed by a VS Code OutputChannel ("tlDiagram").
 * Log level is read from `tldiagram.logLevel` and updated live on config changes.
 *
 * Usage:
 *   import { logger } from './logger'
 *   logger.info('WebviewManager', 'Opening diagram', { id: 42 })
 *   logger.debug('FolderIndexer', 'Batch done', { files: 5, symbols: 12 })
 */
class Logger {
  private channel: vscode.OutputChannel
  private level: number

  constructor() {
    this.channel = vscode.window.createOutputChannel('tlDiagram')
    this.level = this.readLevel()
  }

  /** Call once from activate() to hook config change events. */
  init(context: vscode.ExtensionContext): void {
    context.subscriptions.push(this.channel)
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('tldiagram.logLevel')) {
          const prev = this.level
          this.level = this.readLevel()
          if (this.level !== prev) {
            this.info('Logger', `Log level changed to "${this.levelName()}"`)
          }
        }
      }),
    )
    this.info('Logger', `Log level: "${this.levelName()}"`)
  }

  private readLevel(): number {
    const cfg = vscode.workspace
      .getConfiguration('tldiagram')
      .get<LogLevel>('logLevel', 'info')
    return LEVELS[cfg] ?? LEVELS.info
  }

  private levelName(): LogLevel {
    return (Object.entries(LEVELS).find(([, v]) => v === this.level)?.[0] as LogLevel) ?? 'info'
  }

  private write(levelLabel: string, component: string, message: string, data?: unknown): void {
    const ts = new Date().toISOString()
    const dataStr = data !== undefined ? ` ${JSON.stringify(data)}` : ''
    this.channel.appendLine(`[${ts}] [${levelLabel.padEnd(5)}] [${component}] ${message}${dataStr}`)
  }

  error(component: string, message: string, data?: unknown): void {
    if (this.level >= LEVELS.error) this.write('ERROR', component, message, data)
  }

  warn(component: string, message: string, data?: unknown): void {
    if (this.level >= LEVELS.warn) this.write('WARN ', component, message, data)
  }

  info(component: string, message: string, data?: unknown): void {
    if (this.level >= LEVELS.info) this.write('INFO ', component, message, data)
  }

  debug(component: string, message: string, data?: unknown): void {
    if (this.level >= LEVELS.debug) this.write('DEBUG', component, message, data)
  }

  trace(component: string, message: string, data?: unknown): void {
    if (this.level >= LEVELS.trace) this.write('TRACE', component, message, data)
  }

  /** Show the output panel. */
  show(): void {
    this.channel.show(true)
  }
}

export const logger = new Logger()
