export type ImportLanguage =
  | 'typescript'
  | 'javascript'
  | 'go'
  | 'python'
  | 'rust'
  | 'java'
  | 'ruby'
  | 'unknown'

// Go
const GO_IMPORT_BLOCK = /import\s+\(([^)]+)\)/gs
const GO_IMPORT_QUOTED_IN_BLOCK = /"([^"]+)"/g
const GO_IMPORT_SINGLE = /^import\s+"([^"]+)"/gm

// TypeScript / JavaScript
const TS_JS_STATIC = /^import\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]/gm
const TS_JS_DYNAMIC = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/gm
const TS_JS_REQUIRE = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/gm

// Python
const PY_IMPORT = /^import\s+([\w.]+)/gm
const PY_FROM = /^from\s+([\w.]+)\s+import/gm

// Rust
const RUST_USE = /^use\s+([\w:]+)/gm

// Java
const JAVA_IMPORT_RE = /^import\s+(?:static\s+)?([\w.*]+)\s*;/gm

// Ruby
const RUBY_REQUIRE_RE = /require(?:_relative)?\s+['"]([^'"]+)['"]/gm

export function normalizeImportLanguage(language: string): ImportLanguage {
  const lower = language.toLowerCase()
  if (lower === 'typescript' || lower === 'typescriptreact') return 'typescript'
  if (lower === 'javascript' || lower === 'javascriptreact') return 'javascript'
  if (lower === 'go') return 'go'
  if (lower === 'python') return 'python'
  if (lower === 'rust') return 'rust'
  if (lower === 'java') return 'java'
  if (lower === 'ruby') return 'ruby'
  return 'unknown'
}

export function detectImportLanguageFromPath(filePath: string): ImportLanguage {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'ts' || ext === 'tsx') return 'typescript'
  if (ext === 'js' || ext === 'jsx' || ext === 'mjs' || ext === 'cjs') return 'javascript'
  if (ext === 'go') return 'go'
  if (ext === 'py') return 'python'
  if (ext === 'rs') return 'rust'
  if (ext === 'java') return 'java'
  if (ext === 'rb') return 'ruby'
  return 'unknown'
}

export function extractLibraryName(
  specifier: string,
  language: ImportLanguage,
  goModulePath?: string,
): string | null {
  if (specifier.startsWith('.') || specifier.startsWith('/')) return null

  if (language === 'typescript' || language === 'javascript') {
    if (specifier.startsWith('@')) {
      const parts = specifier.split('/')
      return parts.slice(0, 2).join('/')
    }

    return specifier.split('/')[0]
  }

  if (language === 'go') {
    if (goModulePath && specifier.startsWith(goModulePath)) return null
    if (!specifier.includes('.')) return specifier
    return specifier.split('/').slice(0, 3).join('/')
  }

  if (language === 'python') {
    if (specifier.startsWith('.')) return null
    return specifier.split('.')[0]
  }

  if (language === 'rust') {
    if (
      specifier.startsWith('crate::') ||
      specifier.startsWith('self::') ||
      specifier.startsWith('super::') ||
      specifier.startsWith('std::')
    ) return null

    return specifier.split('::')[0]
  }

  if (language === 'java') {
    const clean = specifier.replace(/\.\*$/, '')
    const parts = clean.split('.')
    return parts.length >= 2 ? parts.slice(0, 2).join('.') : parts[0]
  }

  if (language === 'ruby') {
    return specifier.split('/')[0]
  }

  return null
}

export function extractImportsWithRegex(text: string, language: string): string[] {
  const normalizedLanguage = normalizeImportLanguage(language)
  const paths: string[] = []

  if (normalizedLanguage === 'go') {
    GO_IMPORT_BLOCK.lastIndex = 0
    let block: RegExpExecArray | null
    while ((block = GO_IMPORT_BLOCK.exec(text)) !== null) {
      GO_IMPORT_QUOTED_IN_BLOCK.lastIndex = 0
      let quoted: RegExpExecArray | null
      while ((quoted = GO_IMPORT_QUOTED_IN_BLOCK.exec(block[1])) !== null) {
        paths.push(quoted[1])
      }
    }

    GO_IMPORT_SINGLE.lastIndex = 0
    let single: RegExpExecArray | null
    while ((single = GO_IMPORT_SINGLE.exec(text)) !== null) {
      if (!paths.includes(single[1])) paths.push(single[1])
    }

    return paths
  }

  if (normalizedLanguage === 'typescript' || normalizedLanguage === 'javascript') {
    for (const re of [TS_JS_STATIC, TS_JS_DYNAMIC, TS_JS_REQUIRE]) {
      re.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = re.exec(text)) !== null) {
        if (!paths.includes(match[1])) paths.push(match[1])
      }
    }

    return paths
  }

  if (normalizedLanguage === 'python') {
    for (const re of [PY_IMPORT, PY_FROM]) {
      re.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = re.exec(text)) !== null) {
        if (!paths.includes(match[1])) paths.push(match[1])
      }
    }

    return paths
  }

  if (normalizedLanguage === 'rust') {
    RUST_USE.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = RUST_USE.exec(text)) !== null) {
      if (!paths.includes(match[1])) paths.push(match[1])
    }

    return paths
  }

  if (normalizedLanguage === 'java') {
    JAVA_IMPORT_RE.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = JAVA_IMPORT_RE.exec(text)) !== null) {
      const specifier = match[1].replace(/\.\*$/, '')
      if (!paths.includes(specifier)) paths.push(specifier)
    }

    return paths
  }

  if (normalizedLanguage === 'ruby') {
    RUBY_REQUIRE_RE.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = RUBY_REQUIRE_RE.exec(text)) !== null) {
      if (!paths.includes(match[1])) paths.push(match[1])
    }
  }

  return paths
}

export function isExternalImport(importPath: string): boolean {
  if (
    !importPath.includes('/') &&
    !importPath.includes('.') &&
    !importPath.includes('::') &&
    !importPath.startsWith('.')
  ) return true

  if (
    importPath.startsWith('node:') ||
    importPath.startsWith('bun:') ||
    importPath.startsWith('@types/') ||
    importPath.startsWith('std/')
  ) return true

  return false
}

export function posixResolve(baseDir: string, relPath: string): string {
  const parts = baseDir ? baseDir.split('/') : []
  for (const segment of relPath.split('/')) {
    if (segment === '..') parts.pop()
    else if (segment !== '.') parts.push(segment)
  }
  return parts.join('/')
}

export function resolveImportPath(
  importPath: string,
  fromFile: string,
  allPaths: string[],
  goModPrefix: string | null,
): string[] {
  if (isExternalImport(importPath)) return []

  const fromDir = fromFile.split('/').slice(0, -1).join('/')

  if (importPath.startsWith('@/')) {
    importPath = 'src/' + importPath.slice(2)
  }

  if (importPath.startsWith('.')) {
    const resolved = posixResolve(fromDir, importPath)
    return allPaths.filter((filePath) =>
      filePath === resolved ||
      filePath.startsWith(resolved + '.') ||
      filePath.startsWith(resolved + '/'),
    )
  }

  if (
    importPath.startsWith('crate::') ||
    importPath.startsWith('self::') ||
    importPath.startsWith('super::')
  ) {
    let relativePath: string
    if (importPath.startsWith('crate::')) {
      relativePath = importPath.slice('crate::'.length).split('::').join('/')
    } else if (importPath.startsWith('self::')) {
      relativePath = fromDir + '/' + importPath.slice('self::'.length).split('::').join('/')
    } else {
      relativePath = posixResolve(
        fromDir + '/..',
        importPath.slice('super::'.length).split('::').join('/'),
      )
    }

    const parts = relativePath.split('/')
    const relativeWithoutLast = parts.length > 1 ? parts.slice(0, -1).join('/') : null
    return allPaths.filter((filePath) => {
      const withoutExtension = filePath.replace(/\.rs$/, '').replace(/\/mod$/, '')
      return withoutExtension === relativePath ||
        withoutExtension.endsWith('/' + relativePath) ||
        filePath.startsWith(relativePath + '/') ||
        (relativeWithoutLast !== null && (
          withoutExtension === relativeWithoutLast ||
          withoutExtension.endsWith('/' + relativeWithoutLast)
        ))
    })
  }

  if (importPath.includes('.') && !importPath.includes('/')) {
    const relativePath = importPath.replace(/\./g, '/')
    const parts = relativePath.split('/')
    const relativeWithoutLast = parts.length > 1 ? parts.slice(0, -1).join('/') : null
    const matches = allPaths.filter((filePath) => {
      const withoutExtension = filePath.replace(/\.(py|java|kt)$/, '').replace(/\/__init__$/, '')
      return withoutExtension === relativePath ||
        withoutExtension.endsWith('/' + relativePath) ||
        filePath.replace(/\.[^.]+$/, '').startsWith(relativePath + '/') ||
        (relativeWithoutLast !== null && (
          withoutExtension === relativeWithoutLast ||
          withoutExtension.endsWith('/' + relativeWithoutLast)
        ))
    })
    if (matches.length > 0) return matches
  }

  let importRelativePath = importPath
  if (goModPrefix && importPath.startsWith(goModPrefix)) {
    importRelativePath = importPath.slice(goModPrefix.length).replace(/^\//, '')
  }

  const suffixMatches = allPaths.filter((filePath) => {
    const fileDirectory = filePath.split('/').slice(0, -1).join('/')
    return fileDirectory === importRelativePath ||
      fileDirectory.startsWith(importRelativePath + '/') ||
      filePath.startsWith(importRelativePath + '/')
  })
  if (suffixMatches.length > 0) return suffixMatches

  const lastSegment = importRelativePath.split('/').pop() ?? ''
  if (!lastSegment) return []

  return allPaths.filter((filePath) =>
    filePath.split('/').slice(0, -1).some((segment) => segment === lastSegment),
  )
}