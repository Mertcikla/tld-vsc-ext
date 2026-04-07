import * as vscode from 'vscode'
import { logger } from '../../logger'
import { EXCLUDE_GLOB, SOURCE_GLOB } from '../../lsp/symbolMapping'
import type { IndexedSymbol } from '../shared/types'
import { getTreeSitterRuntime } from './runtime'
import { prepareTreeSitterSource, treeSitterLanguageFromFilePath } from './source'

const BATCH_CONCURRENCY = 5

function kindToSymbolKind(structureKind: string | undefined): vscode.SymbolKind | null {
  const kind = String(structureKind ?? '').toLowerCase()
  if (kind.includes('class')) return vscode.SymbolKind.Class
  if (kind.includes('interface')) return vscode.SymbolKind.Interface
  if (kind.includes('module') || kind.includes('namespace') || kind.includes('package')) return vscode.SymbolKind.Module
  if (kind.includes('struct')) return vscode.SymbolKind.Struct
  if (kind.includes('enum')) return vscode.SymbolKind.Enum
  if (kind.includes('function') || kind.includes('method') || kind.includes('constructor')) return vscode.SymbolKind.Function
  return null
}

async function readSourceForTreeSitter(uri: vscode.Uri, relPath: string): Promise<{ text: string; lang: string } | null> {
  const rawLang = treeSitterLanguageFromFilePath(relPath)
  if (!rawLang) return null

  const rawText = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8')
  return prepareTreeSitterSource(relPath, rawText)
}

export async function indexFolderWithTreeSitter(
  folderUri: vscode.Uri,
  token: vscode.CancellationToken,
  onProgress?: (indexed: number, total: number) => void,
): Promise<IndexedSymbol[]> {
  const runtime = await getTreeSitterRuntime()
  if (!runtime.pack) {
    throw new Error(runtime.error ?? 'Tree-sitter runtime is unavailable.')
  }

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri
  const config = vscode.workspace.getConfiguration('tldiagram')
  const respectWorkspaceExcludes = config.get<boolean>('respectWorkspaceExcludes', true)
  const extraExcludes = config.get<string[]>('extraExcludes', [])

  logger.info('TreeSitterSymbolIndexer', 'Starting folder index', { folder: folderUri.fsPath })

  let uris = await vscode.workspace.findFiles(
    new vscode.RelativePattern(folderUri, SOURCE_GLOB),
    respectWorkspaceExcludes ? null : `{${EXCLUDE_GLOB}}`,
  )

  if (extraExcludes.length > 0) {
    const excludedUriSet = new Set<string>()
    for (const pattern of extraExcludes) {
      const toExclude = await vscode.workspace.findFiles(
        new vscode.RelativePattern(folderUri, pattern),
        null,
      )
      toExclude.forEach((u) => excludedUriSet.add(u.toString()))
    }
    uris = uris.filter((u) => !excludedUriSet.has(u.toString()))
  }

  const results: IndexedSymbol[] = []
  const seen = new Set<string>()

  for (let i = 0; i < uris.length; i += BATCH_CONCURRENCY) {
    if (token.isCancellationRequested) break

    const batch = uris.slice(i, i + BATCH_CONCURRENCY)
    await Promise.all(batch.map(async (uri) => {
      if (token.isCancellationRequested) return

      const relPath = workspaceRoot
        ? uri.fsPath.startsWith(workspaceRoot.fsPath + '/')
          ? uri.fsPath.slice(workspaceRoot.fsPath.length + 1)
          : uri.fsPath
        : uri.fsPath

      try {
        const source = await readSourceForTreeSitter(uri, relPath)
        if (!source) return

        const structure = runtime.pack!.process(source.text, { language: source.lang, structure: true }).structure ?? []
        let parsedSymbols = 0

        for (const item of structure) {
          const kind = kindToSymbolKind(item.kind)
          const name = item.name
          if (!kind || !name) continue

          const dedupeKey = `${name}::${relPath}`
          if (seen.has(dedupeKey)) continue
          seen.add(dedupeKey)

          results.push({
            name,
            kind,
            filePath: relPath,
            startLine: item.span?.startRow ?? 0,
          })
          parsedSymbols++
        }

        if (parsedSymbols === 0 && source.lang === 'cpp') {
          const cppFallback = runtime.pack!.extract(source.text, {
            language: source.lang,
            patterns: {
              cpp_fallback: {
                query: [
                  '(class_specifier name: (type_identifier) @name) @class',
                  '(struct_specifier name: (type_identifier) @name) @struct',
                  '(function_definition declarator: (function_declarator declarator: (identifier) @name)) @func',
                ].join('\n'),
              },
            },
          })
          for (const match of cppFallback.results?.cpp_fallback?.matches ?? []) {
            let name = ''
            let startLine = 0
            for (const capture of match.captures ?? []) {
              if (capture.name === 'name' && capture.text) name = capture.text
              if (capture.node) startLine = capture.node.startRow ?? capture.node.row ?? 0
            }
            if (!name) continue

            const dedupeKey = `${name}::${relPath}`
            if (seen.has(dedupeKey)) continue
            seen.add(dedupeKey)
            results.push({
              name,
              kind: vscode.SymbolKind.Class,
              filePath: relPath,
              startLine,
            })
          }
        }
      } catch (e) {
        logger.trace('TreeSitterSymbolIndexer', 'Failed to parse file', {
          file: relPath,
          error: String(e),
        })
      }
    }))

    onProgress?.(Math.min(i + BATCH_CONCURRENCY, uris.length), uris.length)
  }

  logger.info('TreeSitterSymbolIndexer', 'Indexing complete', {
    totalSymbols: results.length,
    cancelled: token.isCancellationRequested,
  })

  return results
}