import * as cp from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'
import { logger } from '../logger'

/**
 * Default locations used by the official installers. VS Code's process PATH is
 * captured at launch, so a CLI installed while VS Code is running will not be
 * found via PATH until the window is reloaded. Checking these directly lets the
 * extension pick up a freshly installed CLI without a restart.
 */
function installCandidates(): string[] {
  const home = os.homedir()
  if (process.platform === 'win32') {
    const candidates: string[] = []
    if (process.env.LOCALAPPDATA) {
      candidates.push(path.join(process.env.LOCALAPPDATA, 'tld', 'bin', 'tld.exe'))
    }
    candidates.push(path.join(home, '.tld', 'bin', 'tld.exe'))
    candidates.push(path.join(home, '.local', 'bin', 'tld.exe'))
    return candidates
  }
  return [
    path.join(home, '.tld', 'bin', 'tld'),
    path.join(home, '.local', 'bin', 'tld'),
    path.join(home, 'bin', 'tld'),
    '/usr/local/bin/tld',
    '/opt/homebrew/bin/tld',
  ]
}

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

    // Check PATH
    const pathBinary = await this.findOnPath()
    if (pathBinary) {
      this.detectedPath = pathBinary
      logger.info('CLIManager', 'Found CLI on PATH', { path: pathBinary })
      return pathBinary
    }

    // Fall back to well-known install locations (handles a stale process PATH
    // after installing while VS Code is running).
    for (const candidate of installCandidates()) {
      if (fs.existsSync(candidate)) {
        this.detectedPath = candidate
        logger.info('CLIManager', 'Found CLI in default install location', { path: candidate })
        return candidate
      }
    }

    return null
  }

  private findOnPath(): Promise<string | null> {
    return new Promise((resolve) => {
      const proc = process.platform === 'win32'
        ? cp.spawn('where', ['tld'], { stdio: ['ignore', 'pipe', 'pipe'] })
        : cp.spawn('which', ['tld'], { stdio: ['ignore', 'pipe', 'pipe'] })
      let stdout = ''
      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
      proc.on('close', (code) => {
        const first = stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean)
        resolve(code === 0 && first ? first : null)
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

}
