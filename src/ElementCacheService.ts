import * as vscode from 'vscode'
import { logger } from './logger'
import type { DiagElementData } from './api/ExtensionApiClient'
import type { DataSource } from './datasource/DataSource'
import type { GitContextService } from './GitContextService'

export class ElementCacheService {
  private _onDidChange = new vscode.EventEmitter<void>()
  readonly onDidChange = this._onDidChange.event

  private elements: DiagElementData[] = []
  private _fileIndex: Map<string, DiagElementData[]> = new Map()

  constructor(
    private client: DataSource,
    private gitService: GitContextService
  ) {}

  get fileIndex(): ReadonlyMap<string, DiagElementData[]> {
    return this._fileIndex
  }

  updateClient(client: DataSource) {
    this.client = client
    // If client supports watch events, re-index on representation updates
    if (client.mode === 'local') {
      client.onWatchEvent((event) => {
        if (event.type === 'representation.updated') {
          logger.debug('ElementCacheService', 'Watch representation updated — refreshing cache')
          void this.refresh()
        }
      })
    }
  }

  private normalizePath(filePath: string): string {
    return filePath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '')
  }

  async refresh(): Promise<void> {
    try {
      logger.debug('ElementCacheService', 'Refreshing cache')
      const allElements = await this.client.listElements()
      this.elements = allElements
      const shouldFilterRepo = this.client.mode !== 'local'
      const repoInfo = shouldFilterRepo ? await this.gitService.getRepoInfo() : null
      this._fileIndex.clear()
      let elementsWithFilePath = 0
      let skippedByRepo = 0

      for (const el of allElements) {
        if (!el.file_path) continue
        elementsWithFilePath++
        if (shouldFilterRepo && (el.repo || el.branch)) {
          if (!repoInfo || (el.repo && el.repo !== repoInfo.repo) || (el.branch && el.branch !== repoInfo.branch)) {
            skippedByRepo++
            continue
          }
        }
        const anchorIdx = el.file_path.indexOf('#')
        const relPath = this.normalizePath(
          anchorIdx !== -1 ? el.file_path.substring(0, anchorIdx) : el.file_path,
        )
        const existing = this._fileIndex.get(relPath) || []
        existing.push(el)
        this._fileIndex.set(relPath, existing)
      }

      logger.info('ElementCacheService', 'Refresh complete', {
        totalElements: allElements.length,
        elementsWithFilePath,
        indexedFiles: this._fileIndex.size,
        skippedByRepo,
      })
      this._onDidChange.fire()
    } catch (e) {
      logger.error('ElementCacheService', 'Failed to refresh cache', { error: String(e) })
    }
  }

  getElementsForFile(relPath: string): DiagElementData[] {
    const normalizedPath = this.normalizePath(relPath)
    const exactMatch = this._fileIndex.get(normalizedPath)
    if (exactMatch) {
      return exactMatch
    }

    let bestMatchLength = -1
    const matchedElements: DiagElementData[] = []
    for (const [indexedPath, elements] of this._fileIndex.entries()) {
      if (normalizedPath === indexedPath || normalizedPath.endsWith(`/${indexedPath}`)) {
        if (indexedPath.length > bestMatchLength) {
          bestMatchLength = indexedPath.length
          matchedElements.length = 0
          matchedElements.push(...elements)
        } else if (indexedPath.length === bestMatchLength) {
          matchedElements.push(...elements)
        }
      }
    }

    if (matchedElements.length > 0) {
      logger.debug('ElementCacheService', 'Resolved file elements via suffix match', {
        requestedPath: normalizedPath,
        matchedCount: matchedElements.length,
        matchLength: bestMatchLength,
      })
    }

    return matchedElements
  }

  getElementsForSymbol(relPath: string, symbolName: string): DiagElementData[] {
    const fileElements = this.getElementsForFile(relPath)
    const normalizedSymbolName = symbolName.trim()
    const symbolNameMatches = (elementName: string | undefined): boolean => {
      const normalizedElementName = elementName?.trim()
      if (!normalizedElementName || !normalizedSymbolName) return false
      return normalizedElementName === normalizedSymbolName
        || normalizedElementName.endsWith(`.${normalizedSymbolName}`)
        || normalizedElementName.endsWith(`::${normalizedSymbolName}`)
        || normalizedElementName.endsWith(`#${normalizedSymbolName}`)
    }

    return fileElements.filter(el => {
      if (!el.file_path) return false
      const anchorIdx = el.file_path.indexOf('#')
      if (anchorIdx === -1) return symbolNameMatches(el.name)

      const anchorStr = el.file_path.substring(anchorIdx + 1)
      try {
        const anchorData = JSON.parse(decodeURIComponent(anchorStr))
        return anchorData.name === normalizedSymbolName || symbolNameMatches(el.name)
      } catch (e) {
        return symbolNameMatches(el.name)
      }
    })
  }
}
