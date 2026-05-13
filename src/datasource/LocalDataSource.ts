import * as cp from 'child_process'
import * as http from 'http'
import * as vscode from 'vscode'
import { logger } from '../logger'
import { ExtensionApiClient, type Diagram, type DiagElementData } from '../api/ExtensionApiClient'
import type { DataSource, WatchEvent, WatchStatus, DiffResult, SyncStatus } from './DataSource'

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

async function findTldBinary(): Promise<string | null> {
  return new Promise((resolve) => {
    const proc = cp.spawn('which', ['tld'], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    proc.on('close', (code) => {
      if (code === 0 && stdout.trim()) {
        resolve(stdout.trim())
      } else {
        resolve(null)
      }
    })
    proc.on('error', () => resolve(null))
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

function createWatchService(baseUrl: string, repoPath: string): {
  startWatch(path: string): Promise<void>
  stopWatch(): Promise<void>
  getWatchStatus(): WatchStatus | null
  onWatchEvent(listener: (event: WatchEvent) => void): vscode.Disposable
} {
  let watchService: any
  try {
    const { WatchService } = require('../watch/WatchService')
    watchService = new WatchService(baseUrl, repoPath)
  } catch {
    watchService = null
  }

  return {
    async startWatch(path: string) {
      if (watchService) await watchService.start()
    },
    async stopWatch() {
      if (watchService) await watchService.stop()
    },
    getWatchStatus(): WatchStatus | null {
      return watchService?.getStatus() ?? null
    },
    onWatchEvent(listener: (event: WatchEvent) => void): vscode.Disposable {
      if (watchService) {
        const sub = watchService.onEvent(listener)
        return new vscode.Disposable(() => sub.dispose())
      }
      return new vscode.Disposable(() => {})
    },
  }
}

export class LocalDataSource implements DataSource {
  readonly mode = 'local' as const

  private client: ExtensionApiClient | null = null
  private serveProcess: cp.ChildProcess | null = null
  private port: number = 0
  private host: string = '127.0.0.1'
  private watchService: ReturnType<typeof createWatchService> | null = null

  async connect(): Promise<void> {
    const tldPath = await findTldBinary()
    if (!tldPath) {
      throw new Error(
        'tld CLI not found on PATH. Install tlDiagram CLI or switch to cloud mode.'
      )
    }

    const port = await getFreePort()
    logger.info('LocalDataSource', 'Starting tld serve', { tldPath, port })

    this.serveProcess = cp.spawn(tldPath, [
      'serve',
      '--foreground',
      '--host', this.host,
      '--port', String(port),
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    })

    let stderr = ''
    this.serveProcess.stderr?.on('data', (d: Buffer) => { stderr += d.toString() })
    this.serveProcess.stdout?.on('data', (d: Buffer) => {
      logger.trace('LocalDataSource', 'tld serve stdout', { line: d.toString().trim() })
    })

    this.serveProcess.on('exit', (code) => {
      logger.info('LocalDataSource', 'tld serve exited', { code })
      this.serveProcess = null
    })

    const baseUrl = `http://${this.host}:${port}`
    try {
      await waitForReady(baseUrl)
    } catch (e) {
      logger.error('LocalDataSource', 'tld serve failed to start', {
        error: String(e),
        stderr: stderr.slice(-500),
      })
      this.killServe()
      throw new Error(`tld serve failed to start: ${stderr.slice(-200)}`)
    }

    this.port = port
    this.client = new ExtensionApiClient(baseUrl, '')
    this.watchService = createWatchService(baseUrl, vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '.')
    logger.info('LocalDataSource', 'Connected', { baseUrl })
  }

  disconnect(): void {
    this.watchService?.stopWatch()
    this.watchService = null
    this.killServe()
    this.client = null
    logger.info('LocalDataSource', 'Disconnected')
  }

  private killServe(): void {
    if (this.serveProcess) {
      this.serveProcess.kill()
      this.serveProcess = null
      this.port = 0
    }
  }

  get baseUrl(): string {
    return `http://${this.host}:${this.port}`
  }

  private ensureClient(): ExtensionApiClient {
    if (!this.client) throw new Error('Not connected to local server')
    return this.client
  }

  listDiagrams(): Promise<Diagram[]> {
    return this.ensureClient().listDiagrams()
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
    return this.ensureClient().listElements()
  }

  createElement(props: { name: string; type?: string; filePath?: string }): Promise<{ id: number }> {
    return this.ensureClient().createElement(props)
  }

  addElementToDiagram(diagramId: number, objectId: number, x: number, y: number): Promise<void> {
    return this.ensureClient().addElementToDiagram(diagramId, objectId, x, y)
  }

  listElementPlacements(elementId: number): Promise<{ view_id: number; view_name: string }[]> {
    return this.ensureClient().listElementPlacements(elementId)
  }

  isWatchAvailable(): boolean {
    return true
  }

  async startWatch(path: string): Promise<void> {
    if (this.watchService) {
      await this.watchService.startWatch(path)
    }
  }

  async stopWatch(): Promise<void> {
    if (this.watchService) {
      await this.watchService.stopWatch()
    }
  }

  getWatchStatus(): WatchStatus | null {
    return this.watchService?.getWatchStatus() ?? null
  }

  onWatchEvent(listener: (event: WatchEvent) => void): vscode.Disposable {
    if (this.watchService) {
      return this.watchService.onWatchEvent(listener)
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
