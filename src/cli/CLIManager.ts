import * as cp from 'child_process'
import * as fs from 'fs'
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

    // Check PATH
    const pathBinary = await this.findOnPath()
    if (pathBinary) {
      this.detectedPath = pathBinary
      logger.info('CLIManager', 'Found CLI on PATH', { path: pathBinary })
      return pathBinary
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
