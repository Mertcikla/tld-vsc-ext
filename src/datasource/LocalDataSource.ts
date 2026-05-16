import * as cp from 'child_process'
import * as http from 'http'
import * as vscode from 'vscode'
import { logger } from '../logger'
import { ExtensionApiClient, type Diagram, type DiagElementData } from '../api/ExtensionApiClient'
import type { DataSource, WatchEvent, WatchStatus, DiffResult, SyncStatus } from './DataSource'
import { WatchService } from '../watch/WatchService'

const LOCAL_WORKSPACE_ID = '11111111-1111-1111-1111-111111111111'

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = http.createServer()
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') {
        server.close(() => reject(new Error('Could not find free port')))
        return
      }
      const port = addr.port
      server.close(() => resolve(port))
    })
    server.on('error', reject)
  })
}

function waitForReady(baseUrl: string, maxRetries = 30, intervalMs = 500): Promise<void> {
  return new Promise((resolve, reject) => {
    let attempts = 0
    const check = () => {
      attempts++
      http.get(`${baseUrl}/api/ready`, (res) => {
        if (res.statusCode === 200) {
          res.resume()
          resolve()
        } else {
          res.resume()
          retry()
        }
      }).on('error', (e) => {
        logger.trace('LocalDataSource', 'waitForReady attempt failed', { attempt: attempts, error: e.message })
        retry()
      })
    }
    const retry = () => {
      if (attempts >= maxRetries) {
        reject(new Error(`tld serve did not become ready after ${maxRetries} attempts`))
        return
      }
      setTimeout(check, intervalMs)
    }
    check()
  })
}

export class LocalDataSource implements DataSource {
  readonly mode = 'local' as const

  private client: ExtensionApiClient | null = null
  private watchProcess: cp.ChildProcess | null = null
  private port: number = 0
  private watchService: WatchService | null = null
  private reconnectPromise: Promise<void> | null = null

  constructor(
    private readonly tldPath: string,
    private readonly workspaceRoot: string,
    private readonly host: string = '127.0.0.1',
    private readonly configuredPort: number = 0,
  ) {}

  async connect(): Promise<void> {
    const port = this.configuredPort > 0 ? this.configuredPort : await getFreePort()
    logger.info('LocalDataSource', 'Starting tld watch', {
      tldPath: this.tldPath,
      workspaceRoot: this.workspaceRoot,
      host: this.host,
      port,
    })

    this.watchProcess = cp.spawn(this.tldPath, [
      'watch',
      this.workspaceRoot,
      '--host', this.host,
      '--port', String(port),
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
      cwd: this.workspaceRoot,
    })

    let stderr = ''
    this.watchProcess.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString()
      logger.trace('LocalDataSource', 'tld watch stderr', { line: d.toString().trim() })
    })
    this.watchProcess.stdout?.on('data', (d: Buffer) => {
      logger.trace('LocalDataSource', 'tld watch stdout', { line: d.toString().trim() })
    })

    this.watchProcess.on('exit', (code) => {
      logger.info('LocalDataSource', 'tld watch exited', { code })
      this.watchProcess = null
    })

    const baseUrl = `http://${this.host}:${port}`
    try {
      await waitForReady(baseUrl)
    } catch (e) {
      logger.error('LocalDataSource', 'tld watch failed to start', {
        error: String(e),
        stderr: stderr.slice(-500),
      })
      this.killWatch()
      throw new Error(`tld watch failed to start: ${stderr.slice(-200)}`)
    }

    this.port = port
    this.client = new ExtensionApiClient(baseUrl, '')
    this.watchService = new WatchService(baseUrl, this.workspaceRoot)
    await this.watchService.start()
    logger.info('LocalDataSource', 'Connected', { baseUrl })
  }

  disconnect(): void {
    void this.watchService?.stop()
    this.watchService = null
    this.killWatch()
    this.client = null
    logger.info('LocalDataSource', 'Disconnected')
  }

  private killWatch(): void {
    if (this.watchProcess) {
      this.watchProcess.kill()
      this.watchProcess = null
      this.port = 0
    }
  }

  get baseUrl(): string {
    return `http://${this.host}:${this.port}`
  }

  getWatchService(): WatchService | undefined {
    return this.watchService ?? undefined
  }

  private ensureClient(): ExtensionApiClient {
    if (!this.client) throw new Error('Not connected to local server')
    return this.client
  }

  private isTransientLocalServerError(error: unknown): boolean {
    const message = String(error)
    return message.includes('fetch failed')
      || message.includes('ECONNREFUSED')
      || message.includes('socket hang up')
      || message.includes('Failed to fetch')
  }

  private async restart(): Promise<void> {
    if (!this.reconnectPromise) {
      this.reconnectPromise = (async () => {
        logger.warn('LocalDataSource', 'Restarting local tld watch server')
        try {
          await this.watchService?.stop()
        } catch (e) {
          logger.warn('LocalDataSource', 'Failed to stop watch service during restart', { error: String(e) })
        }
        this.watchService = null
        this.client = null
        this.killWatch()
        await this.connect()
      })().finally(() => {
        this.reconnectPromise = null
      })
    }
    await this.reconnectPromise
  }

  private async withReconnect<T>(operation: (client: ExtensionApiClient) => Promise<T>): Promise<T> {
    try {
      return await operation(this.ensureClient())
    } catch (error) {
      if (!this.isTransientLocalServerError(error)) throw error
      logger.warn('LocalDataSource', 'Local server request failed; retrying after restart', { error: String(error) })
      await this.restart()
      return operation(this.ensureClient())
    }
  }

  listDiagrams(): Promise<Diagram[]> {
    return this.withReconnect((client) => client.listDiagrams())
  }

  createDiagram(name: string, parentDiagramId?: number): Promise<Diagram> {
    return this.ensureClient().createDiagram(name, parentDiagramId)
  }

  renameDiagram(id: number, name: string): Promise<Diagram> {
    return this.ensureClient().renameDiagram(id, name)
  }

  async deleteDiagram(id: number): Promise<void> {
    await this.ensureClient().deleteDiagram(LOCAL_WORKSPACE_ID, id)
  }

  listElements(): Promise<DiagElementData[]> {
    return this.withReconnect((client) => client.listElements())
  }

  createElement(props: { name: string; type?: string; filePath?: string }): Promise<{ id: number }> {
    return this.ensureClient().createElement(props)
  }

  addElementToDiagram(diagramId: number, objectId: number, x: number, y: number): Promise<void> {
    return this.ensureClient().addElementToDiagram(diagramId, objectId, x, y)
  }

  listElementPlacements(elementId: number): Promise<{ view_id: number; view_name: string }[]> {
    return this.withReconnect((client) => client.listElementPlacements(elementId))
  }

  isWatchAvailable(): boolean {
    return true
  }

  async startWatch(path: string): Promise<void> {
    if (!this.watchProcess || !this.watchService) {
      await this.connect()
      return
    }
    if (this.watchService) {
      await this.watchService.start()
    }
  }

  async stopWatch(): Promise<void> {
    if (this.watchService) {
      await this.watchService.stop()
    }
    this.watchService = null
    this.client = null
    this.killWatch()
  }

  getWatchStatus(): WatchStatus | null {
    return this.watchService?.getStatus() ?? null
  }

  onWatchEvent(listener: (event: WatchEvent) => void): vscode.Disposable {
    if (this.watchService) {
      const sub = this.watchService.onEvent(listener)
      return new vscode.Disposable(() => sub.dispose())
    }
    return new vscode.Disposable(() => {})
  }

  exportToCloud(): Promise<void> {
    throw new Error('Not connected to cloud. Connect to cloud first for hybrid mode.')
  }

  importFromCloud(): Promise<void> {
    throw new Error('Not connected to cloud. Connect to cloud first for hybrid mode.')
  }

  diffWithCloud(): Promise<DiffResult> {
    return Promise.resolve({ changed: false, scan: {}, representation: {}, diffs: [] })
  }

  getSyncStatus(): Promise<SyncStatus> {
    return Promise.resolve({ localChanges: 0, needsPush: false, needsPull: false })
  }
}
