import * as vscode from 'vscode'
import { logger } from '../logger'
import {
  collectExternalLibrariesFromSources,
  detectGoModulePathFromText,
  type ExternalLibrary,
} from '../parsing/shared/externalLibraries'

export type { ExternalLibrary } from '../parsing/shared/externalLibraries'

export async function detectGoModulePath(folderUri: vscode.Uri): Promise<string | undefined> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri
  const searchRoot = workspaceRoot ?? folderUri
  try {
    const goModFiles = await vscode.workspace.findFiles(
      new vscode.RelativePattern(searchRoot, '**/go.mod'),
      null,
      5,
    )
    if (goModFiles.length === 0) return undefined
    const content = Buffer.from(await vscode.workspace.fs.readFile(goModFiles[0])).toString('utf8')
    return detectGoModulePathFromText(content)
  } catch {
    return undefined
  }
}

const PARSE_BATCH = 10

export async function collectExternalLibraries(
  fileUris: Array<{ uri: vscode.Uri; relPath: string }>,
  goModulePath: string | undefined,
  token: vscode.CancellationToken,
): Promise<Map<string, ExternalLibrary>> {
  const sources: Array<{ filePath: string; text: string }> = []

  for (let i = 0; i < fileUris.length; i += PARSE_BATCH) {
    if (token.isCancellationRequested) break
    const batch = fileUris.slice(i, i + PARSE_BATCH)
    const texts = await Promise.all(batch.map(async ({ uri, relPath }) => {
      try {
        return {
          filePath: relPath,
          text: Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8'),
        }
      } catch {
        return null
      }
    }))
    sources.push(...texts.filter((entry): entry is { filePath: string; text: string } => entry !== null))
  }

  const libraryMap = collectExternalLibrariesFromSources(
    sources,
    goModulePath,
    () => token.isCancellationRequested,
  )

  logger.debug('ImportParser', 'collectExternalLibraries: done', { count: libraryMap.size })
  return libraryMap
}
