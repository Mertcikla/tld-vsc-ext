import * as vscode from 'vscode'
import { logger } from '../logger'
import type { ArchitecturalRole } from './RoleClassifier'

// Maps VS Code language IDs to tree-sitter grammar names and language ID aliases
const LANG_MAP: Record<string, string> = {
  typescript: 'typescript',
  typescriptreact: 'typescript',
  javascript: 'javascript',
  javascriptreact: 'javascript',
  go: 'go',
  python: 'python',
  java: 'java',
  csharp: 'csharp',
  rust: 'rust',
}

// Maps query role names to ArchitecturalRole
const QUERY_ROLE_MAP: Record<string, ArchitecturalRole> = {
  api_entry: 'api_entry',
  repository: 'repository',
  service: 'service',
}

// The role query files we ship, in priority order
const ROLE_QUERY_FILES = ['api_entry', 'repository', 'service'] as const

type ExtractMatch = {
  captures?: Array<{
    name?: string
    text?: string
    node?: {
      startRow?: number
      row?: number
    }
  }>
}

type KreuzbergModule = {
  parseString: (language: string, source: string) => unknown
  extract: (source: string, config: {
    language: string
    patterns: Record<string, { query: string }>
  }) => {
    results?: Record<string, { matches?: ExtractMatch[] }>
  }
}

/**
 * Manages tree-sitter parsing and query execution for role classification.
 *
 * Uses `@kreuzberg/tree-sitter-language-pack` runtime bindings instead of
 * local wasm grammar bundles. If the package is unavailable at runtime, all
 * query methods return null/empty and callers fall back to heuristics.
 */
export class TreeSitterQueryLoader {
  private static readonly SUPPORTED_LANGS = new Set(Object.keys(LANG_MAP))

  private pack: KreuzbergModule | null = null
  private rawQueryCache = new Map<string, string | null>()
  private initialized = false
  private initFailed = false
  private initError: string | null = null

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly workspaceRoot: vscode.Uri | undefined,
  ) {}

  /**
   * Returns true if Kreuzberg tree-sitter bindings are available.
   * Lazy-initializes on first call.
   */
  async isAvailable(): Promise<boolean> {
    if (this.initialized) return this.pack !== null
    if (this.initFailed) return false
    await this.init()
    return this.pack !== null
  }

  /** Returns the underlying init error message if tree-sitter failed to load. */
  getInitError(): string | null {
    return this.initError
  }

  /**
   * Extracts import path strings from file content using AST-accurate queries.
   * Returns empty array if tree-sitter is unavailable or language not supported.
   */
  async extractImports(text: string, vscodeLangId: string): Promise<string[]> {
    const langId = LANG_MAP[vscodeLangId]
    if (!langId) return []
    if (!(await this.isAvailable())) return []

    try {
      const matches = await this.runQueryMatches(text, langId, 'imports')
      const paths: string[] = []
      for (const match of matches) {
        for (const capture of match.captures ?? []) {
          if (capture.name === 'import_path') {
            const capturedText = capture.text
            if (capturedText) paths.push(capturedText)
          }
        }
      }
      return paths
    } catch (e) {
      logger.trace('TreeSitterQueryLoader', 'extractImports query failed', { error: String(e) })
      return []
    }
  }

  /**
   * Runs all role queries for the given file, returning the role whose query
   * has a match within ±5 lines of `symbolLine`. Returns null if no match.
   */
  async runRoleQueries(
    text: string,
    vscodeLangId: string,
    symbolLine: number,
  ): Promise<ArchitecturalRole | null> {
    const langId = LANG_MAP[vscodeLangId]
    if (!langId) return null
    if (!(await this.isAvailable())) return null

    for (const role of ROLE_QUERY_FILES) {
      try {
        const matches = await this.runQueryMatches(text, langId, role)
        for (const match of matches) {
          for (const capture of match.captures ?? []) {
            const nodeStartLine = capture.node?.startRow ?? capture.node?.row
            if (nodeStartLine === undefined) continue
            if (Math.abs(nodeStartLine - symbolLine) <= 5) {
              return QUERY_ROLE_MAP[role] ?? null
            }
          }
        }
      } catch (e) {
        logger.trace('TreeSitterQueryLoader', 'runRoleQueries match failed', { role, error: String(e) })
      }
    }

    return null
  }

  /**
   * Extracts all callee names and their line numbers from a file using the
   * language's callers.scm query. Returns empty array if tree-sitter is
   * unavailable or the language is not supported.
   *
   * The caller identity is NOT determined here — use findOwningSymbol on the
   * returned line numbers to map each call site back to its enclosing symbol.
   */
  async extractCalleeLines(
    text: string,
    vscodeLangId: string,
  ): Promise<Array<{ callee: string; line: number }>> {
    const langId = LANG_MAP[vscodeLangId]
    if (!langId) return []
    if (!(await this.isAvailable())) return []

    try {
      const matches = await this.runQueryMatches(text, langId, 'callers')
      const results: Array<{ callee: string; line: number }> = []
      for (const match of matches) {
        for (const capture of match.captures ?? []) {
          if (capture.name === 'callee') {
            const name = capture.text
            if (name) {
              const line = capture.node?.startRow ?? capture.node?.row
              if (line !== undefined) {
                results.push({ callee: name, line })
              }
            }
          }
        }
      }
      return results
    } catch (e) {
      logger.trace('TreeSitterQueryLoader', 'extractCalleeLines failed', { error: String(e) })
      return []
    }
  }

  static isSupportedLang(vscodeLangId: string): boolean {
    return TreeSitterQueryLoader.SUPPORTED_LANGS.has(vscodeLangId)
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private async init(): Promise<void> {
    try {
      // Dynamic require so startup still succeeds if native package is missing.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('@kreuzberg/tree-sitter-language-pack') as KreuzbergModule
      this.pack = mod
      this.initialized = true
      logger.info('TreeSitterQueryLoader', 'tree-sitter initialized via Kreuzberg language pack')
    } catch (e) {
      this.initFailed = true
      this.initialized = true
      this.initError = String(e)
      logger.warn(
        'TreeSitterQueryLoader',
        'tree-sitter init failed',
        { reason: String(e) },
      )
    }
  }

  private async runQueryMatches(text: string, langId: string, queryName: string): Promise<ExtractMatch[]> {
    if (!(await this.isAvailable()) || !this.pack) return []

    const queryText = await this.loadQueryText(langId, queryName)
    if (!queryText) return []

    try {
      // Trigger parser load early; parseString auto-downloads language parsers.
      this.pack.parseString(langId, text)
      const result = this.pack.extract(text, {
        language: langId,
        patterns: {
          [queryName]: { query: queryText },
        },
      })
      return result?.results?.[queryName]?.matches ?? []
    } catch (e) {
      logger.info('TreeSitterQueryLoader', 'query execution failed', { langId, queryName, error: String(e) })
      return []
    }
  }

  private async loadQueryText(langId: string, queryName: string): Promise<string | null> {
    const cacheKey = `${langId}:${queryName}`
    if (this.rawQueryCache.has(cacheKey)) return this.rawQueryCache.get(cacheKey)!

    // Check workspace override first: .tldiagram/queries/<langId>/<queryName>.scm
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
        this.rawQueryCache.set(cacheKey, text)
        logger.debug('TreeSitterQueryLoader', 'loaded workspace query override', { langId, queryName })
        return text
      } catch {
        // Not found — fall through to bundled query
      }
    }

    // Load bundled query from extension's src/queries directory
    const builtinPath = vscode.Uri.joinPath(
      this.extensionUri,
      'out',
      'queries',
      langId,
      `${queryName}.scm`,
    )
    try {
      const bytes = await vscode.workspace.fs.readFile(builtinPath)
      const text = Buffer.from(bytes).toString('utf8')
      this.rawQueryCache.set(cacheKey, text)
      return text
    } catch {
      this.rawQueryCache.set(cacheKey, null)
      return null
    }
  }

}
