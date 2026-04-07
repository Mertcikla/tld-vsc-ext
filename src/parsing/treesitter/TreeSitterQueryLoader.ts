import * as vscode from 'vscode'
import { logger } from '../../logger'
import type { ArchitecturalRole } from '../../lsp/RoleClassifier'
import {
  extractTreeSitterCalleeLines,
  extractTreeSitterImports,
  matchTreeSitterRole,
} from './queryCore'
import { createCachedTreeSitterQueryTextResolver } from './queryTextResolver'
import {
  getTreeSitterRuntime,
  isTreeSitterSupportedLang,
  resolveTreeSitterLanguage,
} from './runtime'

export class TreeSitterQueryLoader {
  private initError: string | null = null
  private readonly resolveQueryText = createCachedTreeSitterQueryTextResolver(async (langId, queryName) => {
    if (this.workspaceRoot) {
      const overridePath = vscode.Uri.joinPath(
        this.workspaceRoot,
        '.tldiagram',
        'queries',
        langId,
        `${queryName}.scm`,
      )
      try {
        const bytes = await vscode.workspace.fs.readFile(overridePath)
        const text = Buffer.from(bytes).toString('utf8')
        logger.debug('TreeSitterQueryLoader', 'loaded workspace query override', { langId, queryName })
        return text
      } catch {
        // Ignore missing overrides.
      }
    }

    const builtinPath = vscode.Uri.joinPath(
      this.extensionUri,
      'out',
      'queries',
      langId,
      `${queryName}.scm`,
    )
    try {
      const bytes = await vscode.workspace.fs.readFile(builtinPath)
      return Buffer.from(bytes).toString('utf8')
    } catch {
      return null
    }
  })

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly workspaceRoot: vscode.Uri | undefined,
  ) {}

  async isAvailable(): Promise<boolean> {
    const runtime = await getTreeSitterRuntime()
    this.initError = runtime.error
    return runtime.pack !== null
  }

  getInitError(): string | null {
    return this.initError
  }

  async extractImports(text: string, vscodeLangId: string): Promise<string[]> {
    const langId = resolveTreeSitterLanguage(vscodeLangId)
    if (!langId) return []

    const runtime = await getTreeSitterRuntime()
    this.initError = runtime.error
    if (!runtime.pack) return []

    return extractTreeSitterImports(runtime.pack, text, langId, this.resolveQueryText)
  }

  async runRoleQueries(
    text: string,
    vscodeLangId: string,
    symbolLine: number,
  ): Promise<ArchitecturalRole | null> {
    const langId = resolveTreeSitterLanguage(vscodeLangId)
    if (!langId) return null

    const runtime = await getTreeSitterRuntime()
    this.initError = runtime.error
    if (!runtime.pack) return null

    const role = await matchTreeSitterRole(runtime.pack, text, langId, symbolLine, this.resolveQueryText)
    return role as ArchitecturalRole | null
  }

  async extractCalleeLines(
    text: string,
    vscodeLangId: string,
  ): Promise<Array<{ callee: string; line: number }>> {
    const langId = resolveTreeSitterLanguage(vscodeLangId)
    if (!langId) return []

    const runtime = await getTreeSitterRuntime()
    this.initError = runtime.error
    if (!runtime.pack) return []

    return extractTreeSitterCalleeLines(runtime.pack, text, langId, this.resolveQueryText)
  }

  static isSupportedLang(vscodeLangId: string): boolean {
    return isTreeSitterSupportedLang(vscodeLangId)
  }
}