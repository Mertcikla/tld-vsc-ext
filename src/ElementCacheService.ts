import * as vscode from 'vscode'
import { logger } from './logger'
import type { ExtensionApiClient, DiagElementData } from './api/ExtensionApiClient'
import type { GitContextService } from './GitContextService'

export class ElementCacheService {
  private _onDidChange = new vscode.EventEmitter<void>()
  readonly onDidChange = this._onDidChange.event

  private elements: DiagElementData[] = []
  private fileIndex: Map<string, DiagElementData[]> = new Map()

  constructor(
    private client: ExtensionApiClient,
    private gitService: GitContextService
  ) {}

  updateClient(client: ExtensionApiClient) {
    this.client = client
  }

  async refresh(): Promise<void> {
    try {
      logger.debug('ElementCacheService', 'Refreshing cache')
      const allElements = await this.client.listElements()
      this.elements = allElements

      const repoInfo = await this.gitService.getRepoInfo()
      
      this.fileIndex.clear()

      for (const el of allElements) {
        if (!el.file_path) continue

        // Check if it's GitHub-linked
        if (el.repo || el.branch) {
          if (!repoInfo) continue
          if (el.repo && el.repo !== repoInfo.repo) continue
          if (el.branch && el.branch !== repoInfo.branch) continue
        }

        // It matches the workspace context (or it's a pure workspace link without repo/branch)
        // Extract the file path before the anchor
        const anchorIdx = el.file_path.indexOf('#')
        const relPath = anchorIdx !== -1 ? el.file_path.substring(0, anchorIdx) : el.file_path

        const existing = this.fileIndex.get(relPath) || []
        existing.push(el)
        this.fileIndex.set(relPath, existing)
      }

      logger.info('ElementCacheService', 'Refresh complete', {
        totalElements: allElements.length,
        indexedFiles: this.fileIndex.size
      })
      this._onDidChange.fire()
    } catch (e) {
      logger.error('ElementCacheService', 'Failed to refresh cache', { error: String(e) })
    }
  }

  getElementsForFile(relPath: string): DiagElementData[] {
    return this.fileIndex.get(relPath) || []
  }

  getElementsForSymbol(relPath: string, symbolName: string): DiagElementData[] {
    const fileElements = this.getElementsForFile(relPath)
    return fileElements.filter(el => {
      if (!el.file_path) return false
      const anchorIdx = el.file_path.indexOf('#')
      if (anchorIdx === -1) return false

      const anchorStr = el.file_path.substring(anchorIdx + 1)
      try {
        const anchorData = JSON.parse(decodeURIComponent(anchorStr))
        return anchorData.name === symbolName
      } catch (e) {
        return false
      }
    })
  }
}
