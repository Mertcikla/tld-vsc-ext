import * as vscode from 'vscode'
import { logger } from '../logger'

export interface ExternalLibrary {
  name: string
  importedBy: string[]  // workspace-relative file paths
}

type Language = 'ts' | 'js' | 'go' | 'python' | 'rust' | 'unknown'

function detectLanguage(filePath: string): Language {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'ts' || ext === 'tsx') return 'ts'
  if (ext === 'js' || ext === 'jsx' || ext === 'mjs' || ext === 'cjs') return 'js'
  if (ext === 'go') return 'go'
  if (ext === 'py') return 'python'
  if (ext === 'rs') return 'rust'
  return 'unknown'
}

// TS/JS regexes
const TS_JS_STATIC = /^import\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]/gm
const TS_JS_DYNAMIC = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/gm
const TS_JS_REQUIRE = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/gm

// Go regexes
const GO_IMPORT_BLOCK = /import\s+\(([^)]+)\)/gs
const GO_IMPORT_QUOTED_IN_BLOCK = /"([^"]+)"/g
const GO_IMPORT_SINGLE = /^import\s+"([^"]+)"/gm

// Python regexes
const PY_IMPORT = /^import\s+([\w.]+)/gm
const PY_FROM = /^from\s+([\w.]+)\s+import/gm

// Rust regex
const RUST_USE = /^use\s+([\w:]+)/gm

export function extractLibraryName(
  specifier: string,
  lang: Language,
  goModulePath?: string,
): string | null {
  if (specifier.startsWith('.') || specifier.startsWith('/')) return null

  if (lang === 'ts' || lang === 'js') {
    if (specifier.startsWith('@')) {
      // Scoped: @scope/pkg/subpath -> @scope/pkg
      const parts = specifier.split('/')
      return parts.slice(0, 2).join('/')
    }
    // lodash/fp -> lodash
    return specifier.split('/')[0]
  }

  if (lang === 'go') {
    if (goModulePath && specifier.startsWith(goModulePath)) return null  // internal
    if (!specifier.includes('.')) return specifier  // stdlib: fmt, encoding/json
    // External: github.com/org/repo(/subpkg) -> github.com/org/repo
    return specifier.split('/').slice(0, 3).join('/')
  }

  if (lang === 'python') {
    if (specifier.startsWith('.')) return null  // relative
    return specifier.split('.')[0]
  }

  if (lang === 'rust') {
    if (
      specifier.startsWith('crate::') ||
      specifier.startsWith('self::') ||
      specifier.startsWith('super::') ||
      specifier.startsWith('std::')
    ) return null
    return specifier.split('::')[0]
  }

  return null
}

async function parseImportsFromFile(
  uri: vscode.Uri,
  relPath: string,
  goModulePath: string | undefined,
): Promise<string[]> {
  const lang = detectLanguage(relPath)
  if (lang === 'unknown') return []

  let content: string
  try {
    content = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8')
  } catch {
    return []
  }

  const specifiers = new Set<string>()

  if (lang === 'ts' || lang === 'js') {
    for (const re of [TS_JS_STATIC, TS_JS_DYNAMIC, TS_JS_REQUIRE]) {
      re.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = re.exec(content)) !== null) specifiers.add(m[1])
    }
  } else if (lang === 'go') {
    GO_IMPORT_BLOCK.lastIndex = 0
    let block: RegExpExecArray | null
    while ((block = GO_IMPORT_BLOCK.exec(content)) !== null) {
      GO_IMPORT_QUOTED_IN_BLOCK.lastIndex = 0
      let q: RegExpExecArray | null
      while ((q = GO_IMPORT_QUOTED_IN_BLOCK.exec(block[1])) !== null) specifiers.add(q[1])
    }
    GO_IMPORT_SINGLE.lastIndex = 0
    let single: RegExpExecArray | null
    while ((single = GO_IMPORT_SINGLE.exec(content)) !== null) specifiers.add(single[1])
  } else if (lang === 'python') {
    for (const re of [PY_IMPORT, PY_FROM]) {
      re.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = re.exec(content)) !== null) specifiers.add(m[1])
    }
  } else if (lang === 'rust') {
    RUST_USE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = RUST_USE.exec(content)) !== null) specifiers.add(m[1])
  }

  const libraries: string[] = []
  for (const specifier of specifiers) {
    const name = extractLibraryName(specifier, lang, goModulePath)
    if (name) libraries.push(name)
  }
  return libraries
}

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
    const match = /^module\s+([\S]+)/m.exec(content)
    return match?.[1]
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
  const libraryMap = new Map<string, ExternalLibrary>()

  for (let i = 0; i < fileUris.length; i += PARSE_BATCH) {
    if (token.isCancellationRequested) break
    const batch = fileUris.slice(i, i + PARSE_BATCH)
    const batchResults = await Promise.all(
      batch.map(({ uri, relPath }) => parseImportsFromFile(uri, relPath, goModulePath)),
    )
    for (let b = 0; b < batch.length; b++) {
      const relPath = batch[b].relPath
      for (const libName of batchResults[b]) {
        const existing = libraryMap.get(libName)
        if (existing) {
          if (!existing.importedBy.includes(relPath)) existing.importedBy.push(relPath)
        } else {
          libraryMap.set(libName, { name: libName, importedBy: [relPath] })
        }
      }
    }
  }

  logger.debug('ImportParser', 'collectExternalLibraries: done', { count: libraryMap.size })
  return libraryMap
}
