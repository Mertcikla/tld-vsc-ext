/**
 * Unit tests for RelationshipMapper pure functions.
 * No VS Code dependency — these run in plain Node.js via vitest.
 */
import { describe, it, expect, vi } from 'vitest'
import * as nodePath from 'node:path'
import * as nodeFs from 'node:fs'

// RelationshipMapper.ts imports 'vscode' at the top — provide a minimal stub
vi.mock('vscode', () => {
  class Uri {
    readonly fsPath: string
    constructor(fsPath: string) { this.fsPath = fsPath }
    static file(p: string) { return new Uri(p) }
    static joinPath(base: Uri, ...parts: string[]) {
      return new Uri(nodePath.join(base.fsPath, ...parts))
    }
  }
  return {
    Uri,
    workspace: {
      workspaceFolders: undefined,
      fs: { readFile: async (u: { fsPath: string }) => nodeFs.readFileSync(u.fsPath) },
    },
  }
})

vi.mock('../../logger', () => ({
  logger: { info: () => {}, warn: () => {}, debug: () => {}, trace: () => {}, error: () => {} },
}))

import {
  resolveImportPath,
  isExternalImport,
  posixResolve,
  extractImportsWithRegex,
} from '../RelationshipMapper'

// ── isExternalImport ──────────────────────────────────────────────────────────

describe('isExternalImport', () => {
  it('treats Go stdlib single-word imports as external', () => {
    expect(isExternalImport('fmt')).toBe(true)
    expect(isExternalImport('os')).toBe(true)
    expect(isExternalImport('context')).toBe(true)
    expect(isExternalImport('encoding/json')).toBe(false) // has slash → not stdlib single-word
  })

  it('treats node: / bun: / @types/ / std/ prefixes as external', () => {
    expect(isExternalImport('node:fs')).toBe(true)
    expect(isExternalImport('bun:test')).toBe(true)
    expect(isExternalImport('@types/node')).toBe(true)
    expect(isExternalImport('std/fmt')).toBe(true)
  })

  it('does NOT treat relative imports as external', () => {
    expect(isExternalImport('./local')).toBe(false)
    expect(isExternalImport('../sibling')).toBe(false)
  })

  it('does NOT treat third-party module imports as external', () => {
    // has slash, not a known external prefix → caller handles resolution
    expect(isExternalImport('github.com/org/repo')).toBe(false)
    expect(isExternalImport('gitlab.btsgrp.com/olympos-v5/core/internal/services')).toBe(false)
    expect(isExternalImport('@myscope/package')).toBe(false)
  })
})

// ── posixResolve ──────────────────────────────────────────────────────────────

describe('posixResolve', () => {
  it('resolves ./same-dir', () => {
    expect(posixResolve('internal/handlers', './inventory')).toBe('internal/handlers/inventory')
  })

  it('resolves ../parent-dir', () => {
    expect(posixResolve('internal/handlers', '../services/foo')).toBe('internal/services/foo')
  })

  it('resolves ../../grandparent', () => {
    expect(posixResolve('a/b/c', '../../x')).toBe('a/x')
  })

  it('handles empty base dir', () => {
    expect(posixResolve('', './foo')).toBe('foo')
  })
})

// ── resolveImportPath ─────────────────────────────────────────────────────────

describe('resolveImportPath', () => {
  const allPaths = [
    'internal/handlers/inventory_handler.go',
    'internal/handlers/category_handler.go',
    'internal/services/inventory_service.go',
    'internal/services/category_service.go',
    'internal/dto/inventory_dto.go',
    'internal/utils/errors/errors.go',
    'internal/utils/pagination/pagination.go',
    'pkg/logger/logger.go',
    'src/components/Button.tsx',
    'src/services/api.ts',
  ]

  describe('Go module imports (with module prefix)', () => {
    const mod = 'gitlab.btsgrp.com/olympos-v5/core'

    it('strips module prefix and matches by directory', () => {
      const result = resolveImportPath(
        `${mod}/internal/services`,
        'internal/handlers/inventory_handler.go',
        allPaths,
        mod,
      )
      expect(result).toContain('internal/services/inventory_service.go')
      expect(result).toContain('internal/services/category_service.go')
    })

    it('matches a deep package path', () => {
      const result = resolveImportPath(
        `${mod}/internal/utils/errors`,
        'internal/handlers/inventory_handler.go',
        allPaths,
        mod,
      )
      expect(result).toEqual(['internal/utils/errors/errors.go'])
    })

    it('matches pkg/ paths', () => {
      const result = resolveImportPath(
        `${mod}/pkg/logger`,
        'internal/handlers/inventory_handler.go',
        allPaths,
        mod,
      )
      expect(result).toEqual(['pkg/logger/logger.go'])
    })

    it('returns empty for Go stdlib multi-part like encoding/json (no match in paths)', () => {
      const result = resolveImportPath('encoding/json', 'internal/handlers/foo.go', allPaths, mod)
      expect(result).toHaveLength(0)
    })
  })

  describe('Go module imports (no module prefix detected)', () => {
    it('falls back to last-segment matching when no prefix', () => {
      const result = resolveImportPath(
        'github.com/org/project/internal/services',
        'internal/handlers/inventory_handler.go',
        allPaths,
        null,
      )
      // lastSegment = 'services', matches internal/services/*
      expect(result).toContain('internal/services/inventory_service.go')
    })
  })

  describe('relative TypeScript/JS imports', () => {
    it('resolves ./ import to same directory', () => {
      const result = resolveImportPath(
        './api',
        'src/services/api.ts',
        allPaths,
        null,
      )
      expect(result).toContain('src/services/api.ts')
    })

    it('resolves ../ import crossing directory', () => {
      const result = resolveImportPath(
        '../services/api',
        'src/components/Button.tsx',
        allPaths,
        null,
      )
      expect(result).toContain('src/services/api.ts')
    })
  })

  describe('edge cases', () => {
    it('returns empty for stdlib single-word imports (filtered by isExternalImport)', () => {
      expect(resolveImportPath('fmt', 'internal/handlers/foo.go', allPaths, 'mod')).toHaveLength(0)
    })

    it('returns empty when nothing matches', () => {
      expect(resolveImportPath('totally/unknown/xyzzy', 'foo.go', allPaths, null)).toHaveLength(0)
    })

    it('does not match itself', () => {
      const result = resolveImportPath(
        'gitlab.btsgrp.com/olympos-v5/core/internal/handlers',
        'internal/handlers/inventory_handler.go',
        allPaths,
        'gitlab.btsgrp.com/olympos-v5/core',
      )
      expect(result).toContain('internal/handlers/inventory_handler.go')
      expect(result).toContain('internal/handlers/category_handler.go')
    })
  })
})

// ── extractImportsWithRegex ───────────────────────────────────────────────────

describe('extractImportsWithRegex', () => {
  describe('Go', () => {
    it('extracts imports from a block', () => {
      const code = `package main

import (
\t"encoding/json"
\t"gitlab.btsgrp.com/olympos-v5/core/internal/services"
\t"github.com/gin-gonic/gin"
)
`
      const result = extractImportsWithRegex(code, 'go')
      expect(result).toContain('encoding/json')
      expect(result).toContain('gitlab.btsgrp.com/olympos-v5/core/internal/services')
      expect(result).toContain('github.com/gin-gonic/gin')
    })

    it('extracts a single-line import', () => {
      const code = `package main\nimport "fmt"\n`
      const result = extractImportsWithRegex(code, 'go')
      expect(result).toContain('fmt')
    })

    it('returns paths without quotes', () => {
      const code = `import (\n\t"fmt"\n)`
      const result = extractImportsWithRegex(code, 'go')
      expect(result[0]).toBe('fmt')
      expect(result[0]).not.toMatch(/^"/)
    })

    it('handles aliased imports in block', () => {
      const code = `import (\n\tstderrors "errors"\n\t"context"\n)`
      const result = extractImportsWithRegex(code, 'go')
      expect(result).toContain('errors')
      expect(result).toContain('context')
    })
  })

  describe('TypeScript', () => {
    it('extracts static import', () => {
      const code = `import { Foo } from './services/foo'\nimport type Bar from '../bar'`
      const result = extractImportsWithRegex(code, 'typescript')
      expect(result).toContain('./services/foo')
      expect(result).toContain('../bar')
    })

    it('extracts dynamic import', () => {
      const code = `const x = await import('./utils')`
      const result = extractImportsWithRegex(code, 'typescript')
      expect(result).toContain('./utils')
    })

    it('extracts require', () => {
      const code = `const fs = require('node:fs')`
      const result = extractImportsWithRegex(code, 'javascript')
      expect(result).toContain('node:fs')
    })
  })

  describe('unsupported language', () => {
    it('returns empty for unknown language', () => {
      expect(extractImportsWithRegex('whatever', 'plaintext')).toHaveLength(0)
    })
  })
})
