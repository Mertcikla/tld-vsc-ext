import type { KreuzbergModule, TreeSitterExtractMatch } from './runtime'
import { TREE_SITTER_ROLE_QUERY_FILES, type TreeSitterMatchedRole } from './queryCatalog'
import type { TreeSitterQueryTextResolver } from './queryTextResolver'

const NATIVE_IMPORT_LANGS = new Set(['python', 'java', 'rust', 'typescript', 'javascript'])

export function runTreeSitterQueryMatches(
  pack: KreuzbergModule,
  source: string,
  langId: string,
  queryName: string,
  queryText: string | null,
): TreeSitterExtractMatch[] {
  if (!queryText) return []

  try {
    pack.parseString(langId, source)
    const result = pack.extract(source, {
      language: langId,
      patterns: {
        [queryName]: { query: queryText },
      },
    })
    return result.results?.[queryName]?.matches ?? []
  } catch {
    return []
  }
}

export async function getTreeSitterQueryMatches(
  pack: KreuzbergModule,
  source: string,
  langId: string,
  queryName: string,
  resolveQueryText: TreeSitterQueryTextResolver,
): Promise<TreeSitterExtractMatch[]> {
  const queryText = await resolveQueryText(langId, queryName)
  return runTreeSitterQueryMatches(pack, source, langId, queryName, queryText)
}

export function parseTreeSitterImportSource(source: string, langId: string): string | null {
  if (langId === 'typescript' || langId === 'javascript') {
    const match = /['"]([^'"]+)['"]\s*[;)]?\s*$/.exec(source) ||
      /from\s+['"]([^'"]+)['"]/m.exec(source)
    return match ? match[1] : null
  }

  if (langId === 'python') {
    const match = /^from\s+([\w.]+)\s+import/m.exec(source) || /^import\s+([\w.]+)/m.exec(source)
    return match ? match[1] : null
  }

  if (langId === 'java') {
    const match = /^import\s+(?:static\s+)?([\w.*]+)/m.exec(source)
    return match ? match[1].replace(/\.\*$/, '') : null
  }

  if (langId === 'rust') {
    const match = /^use\s+([\w:{}*]+)/m.exec(source)
    return match ? match[1] : null
  }

  if (langId === 'ruby') {
    const match = /require(?:_relative)?\s+['"]([^'"]+)['"]/m.exec(source)
    return match ? match[1] : null
  }

  return null
}

export async function extractTreeSitterImports(
  pack: KreuzbergModule,
  source: string,
  langId: string,
  resolveQueryText: TreeSitterQueryTextResolver,
): Promise<string[]> {
  if (NATIVE_IMPORT_LANGS.has(langId)) {
    try {
      const result = pack.process(source, { language: langId, imports: true })
      const imports: string[] = []
      for (const entry of result.imports ?? []) {
        const parsed = parseTreeSitterImportSource(entry.source ?? '', langId)
        if (parsed) imports.push(parsed)
      }
      return imports
    } catch {
      // Fall through to SCM query-based extraction.
    }
  }

  const matches = await getTreeSitterQueryMatches(pack, source, langId, 'imports', resolveQueryText)
  const imports: string[] = []
  for (const match of matches) {
    for (const capture of match.captures ?? []) {
      if (capture.name === 'import_path' && capture.text) imports.push(capture.text)
    }
  }
  return imports
}

export async function matchTreeSitterRole(
  pack: KreuzbergModule,
  source: string,
  langId: string,
  symbolLine: number,
  resolveQueryText: TreeSitterQueryTextResolver,
): Promise<TreeSitterMatchedRole | null> {
  for (const role of TREE_SITTER_ROLE_QUERY_FILES) {
    const matches = await getTreeSitterQueryMatches(pack, source, langId, role, resolveQueryText)
    for (const match of matches) {
      for (const capture of match.captures ?? []) {
        const line = capture.node?.startRow ?? capture.node?.row
        if (line !== undefined && Math.abs(line - symbolLine) <= 5) {
          return role
        }
      }
    }
  }

  return null
}

export async function extractTreeSitterCalleeLines(
  pack: KreuzbergModule,
  source: string,
  langId: string,
  resolveQueryText: TreeSitterQueryTextResolver,
): Promise<Array<{ callee: string; line: number }>> {
  const matches = await getTreeSitterQueryMatches(pack, source, langId, 'callers', resolveQueryText)
  const results: Array<{ callee: string; line: number }> = []
  for (const match of matches) {
    for (const capture of match.captures ?? []) {
      if (capture.name === 'callee' && capture.text) {
        const line = capture.node?.startRow ?? capture.node?.row
        if (line !== undefined) results.push({ callee: capture.text, line })
      }
    }
  }
  return results
}