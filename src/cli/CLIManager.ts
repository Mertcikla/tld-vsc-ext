import * as cp from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'
import { logger } from '../logger'

export class CLIManager {
  private detectedPath: string | null = null

  async detect(): Promise<string | null> {
    const cliPath = vscode.workspace.getConfiguration('tldiagram').get<string>('cliPath', '')

    if (cliPath) {
      if (fs.existsSync(cliPath)) {
        this.detectedPath = cliPath
        logger.info('CLIManager', 'Using configured CLI path', { path: cliPath })
        return cliPath
      }
      logger.warn('CLIManager', 'Configured CLI path not found', { path: cliPath })
    }

    // Check bundled binary
    const bundledPath = this.getBundledPath()
    if (bundledPath && fs.existsSync(bundledPath)) {
      this.detectedPath = bundledPath
      logger.info('CLIManager', 'Using bundled CLI', { path: bundledPath })
      return bundledPath
    }

    // Check PATH
    const pathBinary = await this.findOnPath()
    if (pathBinary) {
      this.detectedPath = pathBinary
      logger.info('CLIManager', 'Found CLI on PATH', { path: pathBinary })
      return pathBinary
    }

    return null
  }

  private getBundledPath(): string | null {
    const platform = process.platform
    const arch = process.arch === 'arm64' ? 'arm64' : 'amd64'
    const ext = platform === 'win32' ? '.exe' : ''
    const name = `tld-${platform}-${arch}${ext}`

    // Check in extension's bin directory
    const possiblePaths = [
      path.join(__dirname, '..', 'bin', name),
      path.join(vscode.extensions.getExtension('tldiagram-com.tldiagram')?.extensionPath ?? '', 'bin', name),
    ]

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) return p
    }
    return null
  }

  private findOnPath(): Promise<string | null> {
    return new Promise((resolve) => {
      const proc = cp.spawn('which', ['tld'], { stdio: ['ignore', 'pipe', 'pipe'] })
      let stdout = ''
      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
      proc.on('close', (code) => {
        resolve(code === 0 && stdout.trim() ? stdout.trim() : null)
      })
      proc.on('error', () => resolve(null))
    })
  }

  async getVersion(): Promise<string | null> {
    const binary = this.detectedPath || 'tld'
    return new Promise((resolve) => {
      const proc = cp.spawn(binary, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] })
      let stdout = ''
      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
      proc.on('close', (code) => {
        resolve(code === 0 ? stdout.trim() : null)
      })
      proc.on('error', () => resolve(null))
    })
  }

  async downloadLatest(): Promise<void> {
    const platform = process.platform
    const arch = process.arch === 'arm64' ? 'arm64' : 'amd64'
    const ext = platform === 'win32' ? '.exe' : ''
    const name = `tld-${platform}-${arch}${ext}`

    const storagePath = path.join(
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd(),
      '.tld',
    )

    if (!fs.existsSync(storagePath)) {
      fs.mkdirSync(storagePath, { recursive: true })
    }

    const downloadUrl = `https://github.com/tldiagram/tld/releases/latest/download/${name}`

    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Downloading tld CLI...', cancellable: false },
      async () => {
        try {
          const dest = path.join(storagePath, `tld${ext}`)
          const result = await this.fetchFile(downloadUrl, dest)
          if (result) {
            if (platform !== 'win32') {
              fs.chmodSync(dest, 0o755)
            }
            this.detectedPath = dest
            vscode.window.showInformationMessage(`tld CLI downloaded to ${dest}`)
            logger.info('CLIManager', 'Downloaded CLI', { path: dest })
          } else {
            throw new Error('Download failed')
          }
        } catch (e: any) {
          logger.error('CLIManager', 'Download failed', { error: String(e) })
          throw new Error(`Failed to download tld CLI: ${e.message}`)
        }
      },
    )
  }

  private async fetchFile(url: string, dest: string): Promise<boolean> {
    const { get } = await import('http')
    const { get: getHttps } = await import('https')

    return new Promise((resolve) => {
      const client = url.startsWith('https:') ? getHttps : get
      const req = client(url, { headers: { 'User-Agent': 'tlDiagram-VSCode' } }, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          const redirectUrl = res.headers.location
          if (redirectUrl) {
            this.fetchFile(redirectUrl, dest).then(resolve)
            return
          }
        }
        if (res.statusCode !== 200) {
          resolve(false)
          return
        }
        const file = fs.createWriteStream(dest)
        res.pipe(file)
        file.on('finish', () => {
          file.close()
          resolve(true)
        })
      })
      req.on('error', () => resolve(false))
      req.setTimeout(60000, () => {
        req.destroy()
        resolve(false)
      })
    })
  }
}
