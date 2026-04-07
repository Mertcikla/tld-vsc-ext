import {
  detectImportLanguageFromPath,
  extractImportsWithRegex,
  extractLibraryName,
  normalizeImportLanguage,
} from './imports'

export interface ExternalLibrary {
  name: string
  importedBy: string[]
}

export interface SourceTextEntry {
  filePath: string
  text: string
  language?: string
}

export function detectGoModulePathFromText(text: string): string | undefined {
  const match = /^module\s+(\S+)/m.exec(text)
  return match?.[1]
}

export function collectExternalLibrariesFromSources(
  entries: SourceTextEntry[],
  goModulePath: string | undefined,
  isCancelled?: () => boolean,
): Map<string, ExternalLibrary> {
  const libraryMap = new Map<string, ExternalLibrary>()

  for (const entry of entries) {
    if (isCancelled?.()) break

    const language = normalizeImportLanguage(entry.language ?? detectImportLanguageFromPath(entry.filePath))
    if (language === 'unknown') continue

    const specifiers = extractImportsWithRegex(entry.text, language)
    const libraries = new Set<string>()
    for (const specifier of specifiers) {
      const libraryName = extractLibraryName(specifier, language, goModulePath)
      if (libraryName) libraries.add(libraryName)
    }

    for (const libraryName of libraries) {
      const existing = libraryMap.get(libraryName)
      if (existing) {
        if (!existing.importedBy.includes(entry.filePath)) existing.importedBy.push(entry.filePath)
      } else {
        libraryMap.set(libraryName, {
          name: libraryName,
          importedBy: [entry.filePath],
        })
      }
    }
  }

  return libraryMap
}