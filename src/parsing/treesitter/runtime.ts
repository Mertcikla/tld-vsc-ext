import { logger } from '../../logger'

export type TreeSitterStructureItem = {
  kind?: string
  name?: string
  span?: {
    startRow?: number
  }
}

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

export type TreeSitterQueryCapture = NonNullable<ExtractMatch['captures']>[number]
export type TreeSitterExtractMatch = ExtractMatch

export type KreuzbergModule = {
  parseString: (language: string, source: string) => unknown
  process: (source: string, config: {
    language: string
    structure?: boolean
    imports?: boolean
  }) => {
    structure?: TreeSitterStructureItem[]
    imports?: Array<{ source?: string }>
  }
  extract: (source: string, config: {
    language: string
    patterns: Record<string, { query: string }>
  }) => {
    results?: Record<string, { matches?: ExtractMatch[] }>
  }
}

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
  ruby: 'ruby',
  cpp: 'cpp',
  c: 'cpp',
}

let runtimePromise: Promise<{ pack: KreuzbergModule | null; error: string | null }> | null = null

export function resolveTreeSitterLanguage(vscodeLangId: string): string | null {
  return LANG_MAP[vscodeLangId] ?? null
}

export function isTreeSitterSupportedLang(vscodeLangId: string): boolean {
  return Boolean(resolveTreeSitterLanguage(vscodeLangId))
}

export async function getTreeSitterRuntime(): Promise<{ pack: KreuzbergModule | null; error: string | null }> {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mod = require('@kreuzberg/tree-sitter-language-pack') as KreuzbergModule
        logger.info('TreeSitterRuntime', 'tree-sitter initialized via Kreuzberg language pack')
        return { pack: mod, error: null }
      } catch (e) {
        const error = String(e)
        logger.warn('TreeSitterRuntime', 'tree-sitter init failed', { reason: error })
        return { pack: null, error }
      }
    })()
  }

  return runtimePromise
}