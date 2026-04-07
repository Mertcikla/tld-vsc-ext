#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { globSync } = require('glob')
const tsPack = require('@kreuzberg/tree-sitter-language-pack')

const SOURCE_GLOB = '**/*.{ts,tsx,js,jsx,go,py,rs,java,kt,swift,cpp,cc,cxx,c,h,cs}'
const DEFAULT_EXCLUDES = ['**/node_modules/**', '**/dist/**', '**/build/**', '**/out/**', '**/.git/**']

const ROLE_QUERY_FILES = ['api_entry', 'repository', 'service']
const QUERY_ROLE_MAP = {
  api_entry: 'api_entry',
  repository: 'repository',
  service: 'service',
}

const DEFAULT_IMPORT_ROLE_MAP = {
  sql: 'repository', postgres: 'repository', mysql: 'repository', sqlite: 'repository', mongodb: 'repository', redis: 'repository',
  prisma: 'repository', typeorm: 'repository', sequelize: 'repository', mongoose: 'repository', knex: 'repository', drizzle: 'repository',
  gorm: 'repository', pgx: 'repository', sqlx: 'repository', diesel: 'repository', sqlalchemy: 'repository', pymongo: 'repository',
  dynamodb: 'repository', cassandra: 'repository', elasticsearch: 'repository', neo4j: 'repository',
  express: 'api_entry', fastify: 'api_entry', koa: 'api_entry', hapi: 'api_entry', restify: 'api_entry',
  gin: 'api_entry', echo: 'api_entry', fiber: 'api_entry', chi: 'api_entry', mux: 'api_entry',
  flask: 'api_entry', fastapi: 'api_entry', django: 'api_entry', tornado: 'api_entry',
  axum: 'api_entry', actix: 'api_entry', rocket: 'api_entry', warp: 'api_entry', spring: 'api_entry', jersey: 'api_entry',
  grpc: 'api_entry', connectrpc: 'api_entry', 'connect-go': 'api_entry', twirp: 'api_entry',
}

const PRESETS = {
  overview: { callHierarchyDepth: 1, collapseIntermediates: true, includeUtilities: false, minSymbolKinds: 'classes', targetObjectsPerDiagram: 8, maxObjectsPerDiagram: 12, minObjectsPerDiagram: 2 },
  standard: { callHierarchyDepth: 2, collapseIntermediates: true, includeUtilities: false, minSymbolKinds: 'classes', targetObjectsPerDiagram: 10, maxObjectsPerDiagram: 15, minObjectsPerDiagram: 3 },
  detailed: { callHierarchyDepth: 3, collapseIntermediates: false, includeUtilities: true, minSymbolKinds: 'all', targetObjectsPerDiagram: 12, maxObjectsPerDiagram: 18, minObjectsPerDiagram: 3 },
}

function parseArgs(argv) {
  const args = { repo: '', level: 'standard', includeExternalLibraries: true, groupingStrategy: 'hybrid', disablePathHeuristics: false }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--repo') args.repo = argv[++i]
    else if (a === '--level') args.level = argv[++i]
    else if (a === '--grouping') args.groupingStrategy = argv[++i]
    else if (a === '--no-external') args.includeExternalLibraries = false
    else if (a === '--disable-path-heuristics') args.disablePathHeuristics = true
  }
  if (!args.repo) throw new Error('Missing --repo <path>')
  return args
}

function langFromExt(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.ts' || ext === '.tsx') return 'typescript'
  if (ext === '.js' || ext === '.jsx' || ext === '.mjs' || ext === '.cjs') return 'javascript'
  if (ext === '.go') return 'go'
  if (ext === '.py') return 'python'
  if (ext === '.rs') return 'rust'
  if (ext === '.java') return 'java'
  if (ext === '.cs') return 'csharp'
  return null
}

function toRel(repoRoot, absPath) {
  return path.relative(repoRoot, absPath).split(path.sep).join('/')
}

function loadQueryText(repoRoot, lang, queryName) {
  const override = path.join(repoRoot, '.tldiagram', 'queries', lang, `${queryName}.scm`)
  if (fs.existsSync(override)) return fs.readFileSync(override, 'utf8')
  const builtin = path.join(__dirname, '..', 'src', 'queries', lang, `${queryName}.scm`)
  if (fs.existsSync(builtin)) return fs.readFileSync(builtin, 'utf8')
  return null
}

function extractMatches(source, lang, queryName, queryText) {
  if (!queryText) return []
  try {
    tsPack.parseString(lang, source)
    const out = tsPack.extract(source, { language: lang, patterns: { [queryName]: { query: queryText } } })
    return out?.results?.[queryName]?.matches ?? []
  } catch {
    return []
  }
}

function extractImports(source, lang, queryCache, repoRoot) {
  const q = queryCache.get(`${lang}:imports`) ?? loadQueryText(repoRoot, lang, 'imports')
  queryCache.set(`${lang}:imports`, q)
  const matches = extractMatches(source, lang, 'imports', q)
  const imports = []
  for (const m of matches) {
    for (const c of m.captures ?? []) {
      if (c.name === 'import_path' && c.text) imports.push(c.text)
    }
  }
  return imports
}

function classifyRole(sym, fileText, lang, importRole, queryCache, repoRoot, disablePathHeuristics) {
  if (lang && fileText) {
    for (const role of ROLE_QUERY_FILES) {
      const key = `${lang}:${role}`
      const q = queryCache.get(key) ?? loadQueryText(repoRoot, lang, role)
      queryCache.set(key, q)
      for (const m of extractMatches(fileText, lang, role, q)) {
        for (const c of m.captures ?? []) {
          const row = c.node?.startRow ?? c.node?.row
          if (row !== undefined && Math.abs(row - sym.startLine) <= 5) return QUERY_ROLE_MAP[role]
        }
      }
    }
  }

  if (importRole) return importRole
  if (disablePathHeuristics) return 'unknown'

  const p = sym.filePath.toLowerCase()
  const segments = p.split('/')
  if (segments.some((s) => /(handler|controller|router|route|endpoint|api|rest|grpc|rpc|http|server|web)/.test(s))) return 'api_entry'
  if (segments.some((s) => /(service|svc|usecase|use_case|domain|application)/.test(s))) return 'service'
  if (segments.some((s) => /(repository|repositories|repo|store|storage|dao|db|database|data|persistence)/.test(s))) return 'repository'
  if (segments.some((s) => /(migration|migrations|seed|seeds|schema|schemas|query|queries)/.test(s))) return 'data_exit'
  if (segments.some((s) => /(model|models|entity|entities|dto|dtos|types|type|struct|structs|proto)/.test(s))) return 'model'
  if (segments.some((s) => /(util|utils|helper|helpers|lib|common|shared|pkg|tools|support)/.test(s))) return 'utility'
  return 'unknown'
}

function findGoModulePath(repoRoot) {
  const p = path.join(repoRoot, 'go.mod')
  if (!fs.existsSync(p)) return null
  const m = fs.readFileSync(p, 'utf8').match(/^module\s+(\S+)/m)
  return m ? m[1] : null
}

function isExternalImport(importPath) {
  if (!importPath.includes('/') && !importPath.startsWith('.')) return true
  return importPath.startsWith('node:') || importPath.startsWith('bun:') || importPath.startsWith('@types/') || importPath.startsWith('std/')
}

function posixResolve(baseDir, relPath) {
  const parts = baseDir ? baseDir.split('/') : []
  for (const seg of relPath.split('/')) {
    if (seg === '..') parts.pop()
    else if (seg !== '.') parts.push(seg)
  }
  return parts.join('/')
}

function resolveImportPath(importPath, fromFile, allPaths, goModPrefix) {
  if (isExternalImport(importPath)) return []
  const fromDir = fromFile.split('/').slice(0, -1).join('/')
  if (importPath.startsWith('.')) {
    const resolved = posixResolve(fromDir, importPath)
    return allPaths.filter((fp) => fp === resolved || fp.startsWith(resolved + '.') || fp.startsWith(resolved + '/index.'))
  }

  let rel = importPath
  if (goModPrefix && importPath.startsWith(goModPrefix)) rel = importPath.slice(goModPrefix.length).replace(/^\//, '')
  const suffix = allPaths.filter((fp) => {
    const d = fp.split('/').slice(0, -1).join('/')
    return d === rel || d.startsWith(rel + '/') || fp.startsWith(rel + '/')
  })
  if (suffix.length) return suffix
  const last = rel.split('/').pop() || ''
  if (!last) return []
  return allPaths.filter((fp) => fp.split('/').slice(0, -1).some((p) => p === last))
}

function symbolRef(sym) {
  return `${sym.filePath}::${sym.name}::${sym.startLine}`
}

function sanitizeRef(s) {
  return s.toLowerCase().replace(/[^a-z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
}

function groupDisplayName(key) {
  const roleNames = {
    api_entry: 'API Layer',
    service: 'Services',
    repository: 'Data Layer',
    data_exit: 'Data Access',
    model: 'Models',
    utility: 'Utilities',
    external: 'External',
    unknown: 'Other',
  }
  return roleNames[key] || key.replace(/_/g, '/')
}

function groupByFolder(symbols) {
  const groups = new Map()
  for (const sym of symbols) {
    const parts = sym.filePath.split('/')
    const key = parts.length > 2 ? parts.slice(0, 2).join('_') : parts.length > 1 ? parts[0] : 'root'
    const arr = groups.get(key) || []
    arr.push(sym)
    groups.set(key, arr)
  }
  return groups
}

function groupByRole(symbols) {
  const groups = new Map()
  for (const sym of symbols) {
    const arr = groups.get(sym.role) || []
    arr.push(sym)
    groups.set(sym.role, arr)
  }
  return groups
}

function groupByHybrid(symbols) {
  const folderGroups = groupByFolder(symbols)
  if (folderGroups.size <= 1) return groupByRole(symbols)
  if (folderGroups.size === 1) {
    const deepGroups = new Map()
    for (const sym of symbols) {
      const parts = sym.filePath.split('/')
      const key = parts.length > 3 ? parts.slice(0, 3).join('_') : parts.slice(0, 2).join('_')
      const arr = deepGroups.get(key) || []
      arr.push(sym)
      deepGroups.set(key, arr)
    }
    if (deepGroups.size > 1) return deepGroups
    return groupByRole(symbols)
  }
  return folderGroups
}

function computeCentralityRaw(symbols, refs, edges) {
  const scores = new Map()
  for (const sym of symbols) scores.set(symbolRef(sym), 0)
  for (const edge of edges) {
    if (refs.has(edge.srcRef)) scores.set(edge.srcRef, (scores.get(edge.srcRef) || 0) + 1)
    if (refs.has(edge.dstRef)) scores.set(edge.dstRef, (scores.get(edge.dstRef) || 0) + 1)
  }
  for (const sym of symbols) {
    const key = symbolRef(sym)
    let score = scores.get(key) || 0
    if (sym.role === 'api_entry') score *= 2
    else if (sym.role === 'repository') score = Math.round(score * 1.5)
    scores.set(key, score)
  }
  return scores
}

function computeCentrality(symbols, edges) {
  return computeCentralityRaw(symbols, new Set(symbols.map(symbolRef)), edges)
}

function splitGroup(key, symbols, cfg) {
  if (symbols.length <= cfg.maxObjectsPerDiagram) return new Map([[key, symbols]])

  const subDirMap = new Map()
  for (const sym of symbols) {
    const parts = sym.filePath.split('/')
    const subKey = parts.length > 3 ? parts[2] : parts.length > 2 ? parts[1] : 'root'
    const arr = subDirMap.get(subKey) || []
    arr.push(sym)
    subDirMap.set(subKey, arr)
  }
  if (subDirMap.size > 1) {
    const result = new Map()
    for (const [subKey, subSyms] of subDirMap) {
      const nested = splitGroup(`${key}_${subKey}`, subSyms, cfg)
      for (const [k, v] of nested) result.set(k, v)
    }
    return result
  }

  const roleMap = groupByRole(symbols)
  if (roleMap.size > 1) {
    const result = new Map()
    for (const [role, roleSyms] of roleMap) result.set(`${key}_${role}`, roleSyms)
    return result
  }

  const temp = computeCentralityRaw(symbols, new Set(), [])
  const sorted = [...symbols].sort((a, b) => (temp.get(symbolRef(b)) || 0) - (temp.get(symbolRef(a)) || 0))
  const chunk1 = sorted.slice(0, cfg.targetObjectsPerDiagram)
  const chunk2 = sorted.slice(cfg.targetObjectsPerDiagram)
  const result = new Map()
  result.set(`${key}_primary`, chunk1)
  if (chunk2.length) result.set(`${key}_secondary`, chunk2)
  return result
}

function countCrossEdges(a, b, edges) {
  const aRefs = new Set(a.map(symbolRef))
  const bRefs = new Set(b.map(symbolRef))
  let count = 0
  for (const e of edges) {
    if ((aRefs.has(e.srcRef) && bRefs.has(e.dstRef)) || (bRefs.has(e.srcRef) && aRefs.has(e.dstRef))) count++
  }
  return count
}

function findSmallKey(groups, min) {
  for (const [k, syms] of groups) if (syms.length < min) return k
  return null
}

function mergeSmallGroups(groups, edges, cfg) {
  let changed = true
  while (changed) {
    changed = false
    const smallKey = findSmallKey(groups, cfg.minObjectsPerDiagram)
    if (!smallKey) break

    const smallSyms = groups.get(smallKey)
    let bestKey = null
    let bestScore = -1
    for (const [candidateKey, candidateSyms] of groups) {
      if (candidateKey === smallKey) continue
      if (candidateSyms.length + smallSyms.length > cfg.maxObjectsPerDiagram) continue
      const score = countCrossEdges(smallSyms, candidateSyms, edges)
      if (score > bestScore) {
        bestScore = score
        bestKey = candidateKey
      }
    }

    if (!bestKey) {
      let minSize = Infinity
      for (const [candidateKey, candidateSyms] of groups) {
        if (candidateKey === smallKey) continue
        if (candidateSyms.length < minSize) {
          minSize = candidateSyms.length
          bestKey = candidateKey
        }
      }
    }

    if (!bestKey) break
    groups.set(bestKey, [...groups.get(bestKey), ...smallSyms])
    groups.delete(smallKey)
    changed = true
  }
  return groups
}

function groupSymbols(symbols, edges, cfg) {
  const filtered = cfg.includeUtilities ? symbols : symbols.filter((s) => s.role !== 'utility')
  if (!filtered.length) return []

  let rawGroups
  if (cfg.groupingStrategy === 'role') rawGroups = groupByRole(filtered)
  else if (cfg.groupingStrategy === 'folder') rawGroups = groupByFolder(filtered)
  else rawGroups = groupByHybrid(filtered)

  let groups = new Map()
  for (const [key, syms] of rawGroups) {
    if (syms.length > cfg.maxObjectsPerDiagram) {
      const split = splitGroup(key, syms, cfg)
      for (const [k, v] of split) groups.set(k, v)
    } else {
      groups.set(key, syms)
    }
  }
  groups = mergeSmallGroups(groups, edges, cfg)

  const result = []
  for (const [key, syms] of groups) {
    if (!syms.length) continue
    result.push({ ref: sanitizeRef(`grp_${key}`), name: groupDisplayName(key), symbols: syms, centrality: computeCentrality(syms, edges) })
  }
  return result
}

function countsFromPlan(groups, edges, externalLibs, includeExternalLibraries) {
  const hasExternal = includeExternalLibraries && externalLibs.size > 0
  const diagrams = 1 + groups.length + (hasExternal ? 1 : 0)

  let objects = 0
  objects += groups.length // root cluster per group
  for (const g of groups) objects += g.symbols.length // per-symbol detail objects
  if (hasExternal) {
    objects += 1 // external cluster
    objects += externalLibs.size // external library nodes
  }

  const symToGroup = new Map()
  for (const g of groups) for (const s of g.symbols) symToGroup.set(symbolRef(s), g.ref)

  const rootEdgeSet = new Set()
  const detailEdgeSet = new Set()
  for (const e of edges) {
    const sg = symToGroup.get(e.srcRef)
    const dg = symToGroup.get(e.dstRef)
    if (!sg || !dg) continue
    if (sg !== dg) rootEdgeSet.add(`${sg}::${dg}`)
    else detailEdgeSet.add(`${sg}::${e.srcRef}::${e.dstRef}`)
  }
  const edgeCount = rootEdgeSet.size + detailEdgeSet.size
  const links = groups.length + (hasExternal ? 1 : 0)
  return { diagrams, objects, edges: edgeCount, links }
}

function applyPlatonicFilter(edges, symbols) {
  const adjacency = new Map()
  const inbound = new Map()
  const sideEffectRoles = new Set(['api_entry', 'repository', 'data_exit', 'external'])
  const byRef = new Map(symbols.map((s) => [symbolRef(s), s]))

  for (const e of edges) {
    if (!adjacency.has(e.srcRef)) adjacency.set(e.srcRef, new Set())
    adjacency.get(e.srcRef).add(e.dstRef)
    if (!inbound.has(e.dstRef)) inbound.set(e.dstRef, new Set())
    inbound.get(e.dstRef).add(e.srcRef)
  }

  let changed = true
  while (changed) {
    changed = false
    for (const [nodeRef, dsts] of [...adjacency.entries()]) {
      if (dsts.size !== 1) continue
      const ins = inbound.get(nodeRef)
      if (!ins || ins.size !== 1) continue
      const sym = byRef.get(nodeRef)
      if (!sym || sideEffectRoles.has(sym.role)) continue
      const callerRef = [...ins][0]
      const calleeRef = [...dsts][0]
      if (callerRef === calleeRef) continue

      adjacency.get(callerRef)?.delete(nodeRef)
      adjacency.get(callerRef)?.add(calleeRef)
      inbound.get(calleeRef)?.delete(nodeRef)
      inbound.get(calleeRef)?.add(callerRef)
      adjacency.delete(nodeRef)
      inbound.delete(nodeRef)
      changed = true
      break
    }
  }

  const out = []
  const seen = new Set()
  for (const [src, dsts] of adjacency) {
    for (const dst of dsts) {
      const key = `${src}::${dst}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ srcRef: src, dstRef: dst })
    }
  }
  return out
}

function kindBucket(structureKind) {
  const k = String(structureKind || '').toLowerCase()
  if (k.includes('class')) return 'class'
  if (k.includes('interface')) return 'interface'
  if (k.includes('module') || k.includes('namespace') || k.includes('package')) return 'module'
  if (k.includes('struct')) return 'struct'
  if (k.includes('enum')) return 'enum'
  if (k.includes('function') || k.includes('method') || k.includes('constructor')) return 'function'
  return null
}

function importRoleFingerprint(externalLibs) {
  const fp = new Map()
  for (const [libName, lib] of externalLibs) {
    const lower = libName.toLowerCase()
    let role = null
    for (const [pattern, r] of Object.entries(DEFAULT_IMPORT_ROLE_MAP)) {
      if (lower.includes(pattern)) {
        role = r
        break
      }
    }
    if (!role) continue
    for (const filePath of lib.importedBy) fp.set(filePath, role)
  }
  return fp
}

function main() {
  const args = parseArgs(process.argv)
  const repoRoot = path.resolve(args.repo)
  const preset = PRESETS[args.level] || PRESETS.standard

  const files = globSync(SOURCE_GLOB, {
    cwd: repoRoot,
    nodir: true,
    ignore: DEFAULT_EXCLUDES,
    absolute: true,
  })

  const queryCache = new Map()
  const fileData = new Map()
  const symbols = []
  const externalLibs = new Map()
  const goMod = findGoModulePath(repoRoot)

  for (const abs of files) {
    const rel = toRel(repoRoot, abs)
    const lang = langFromExt(rel)
    if (!lang) continue
    const text = fs.readFileSync(abs, 'utf8')
    fileData.set(rel, { text, lang })

    try {
      const result = tsPack.process(text, { language: lang, structure: true, imports: false })
      for (const item of result.structure || []) {
        const kind = kindBucket(item.kind)
        if (!kind) continue
        symbols.push({ name: item.name || '(anonymous)', kind, filePath: rel, startLine: item.span?.startRow ?? 0 })
      }
    } catch {
      // Skip file if parser fails.
    }

    const imports = extractImports(text, lang, queryCache, repoRoot)
    if (imports.length) {
      const libs = new Set()
      for (const raw of imports) {
        const spec = String(raw).replace(/^['"`]|['"`]$/g, '')
        if (spec.startsWith('.') || spec.startsWith('/')) continue
        let lib = null
        if (lang === 'typescript' || lang === 'javascript') {
          lib = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]
        } else if (lang === 'go') {
          if (goMod && spec.startsWith(goMod)) continue
          lib = spec.includes('.') ? spec.split('/').slice(0, 3).join('/') : spec
        } else if (lang === 'python') {
          lib = spec.split('.')[0]
        } else if (lang === 'rust') {
          if (spec.startsWith('crate::') || spec.startsWith('self::') || spec.startsWith('super::') || spec.startsWith('std::')) continue
          lib = spec.split('::')[0]
        }
        if (lib) libs.add(lib)
      }
      for (const lib of libs) {
        const e = externalLibs.get(lib) || { name: lib, importedBy: [] }
        if (!e.importedBy.includes(rel)) e.importedBy.push(rel)
        externalLibs.set(lib, e)
      }
    }
  }

  const classesOnly = new Set(['class', 'struct', 'interface', 'module'])
  const filtered = preset.minSymbolKinds === 'classes' ? symbols.filter((s) => classesOnly.has(s.kind)) : symbols
  const importFp = importRoleFingerprint(externalLibs)

  const classified = filtered.map((s) => {
    const fd = fileData.get(s.filePath)
    return {
      ...s,
      role: classifyRole(s, fd?.text || '', fd?.lang || '', importFp.get(s.filePath), queryCache, repoRoot, args.disablePathHeuristics),
      vscodeLangId: fd?.lang || '',
    }
  })

  const symbolsByFile = new Map()
  for (const s of classified) {
    const arr = symbolsByFile.get(s.filePath) || []
    arr.push(s)
    symbolsByFile.set(s.filePath, arr)
  }

  let edges = []
  if (preset.callHierarchyDepth > 0) {
    const edgeSet = new Set()
    const allPaths = [...symbolsByFile.keys()]
    for (const [filePath, syms] of symbolsByFile.entries()) {
      const fd = fileData.get(filePath)
      if (!fd) continue
      const rawImports = extractImports(fd.text, fd.lang, queryCache, repoRoot)
      for (const raw of rawImports) {
        const importPath = String(raw).replace(/^['"`]|['"`]$/g, '')
        for (const dstFile of resolveImportPath(importPath, filePath, allPaths, goMod)) {
          const dstSyms = symbolsByFile.get(dstFile) || []
          for (const src of syms) {
            for (const dst of dstSyms) {
              const srcRef = symbolRef(src)
              const dstRef = symbolRef(dst)
              if (srcRef === dstRef) continue
              const key = `${srcRef}::${dstRef}`
              if (edgeSet.has(key)) continue
              edgeSet.add(key)
              edges.push({ srcRef, dstRef })
            }
          }
        }
      }
    }
  }

  if (preset.collapseIntermediates) {
    edges = applyPlatonicFilter(edges, classified)
  }

  const groups = groupSymbols(classified, edges, {
    groupingStrategy: args.groupingStrategy,
    targetObjectsPerDiagram: preset.targetObjectsPerDiagram,
    maxObjectsPerDiagram: preset.maxObjectsPerDiagram,
    minObjectsPerDiagram: preset.minObjectsPerDiagram,
    includeUtilities: preset.includeUtilities,
  })

  const counts = countsFromPlan(groups, edges, externalLibs, args.includeExternalLibraries)
  process.stdout.write(`${JSON.stringify({
    repo: repoRoot,
    level: args.level,
    filesScanned: files.length,
    indexedSymbols: symbols.length,
    classifiedSymbols: classified.length,
    groups: groups.length,
    ...counts,
  }, null, 2)}\n`)
}

try {
  main()
} catch (e) {
  process.stderr.write(`local-arch-parse failed: ${e instanceof Error ? e.message : String(e)}\n`)
  process.exit(1)
}
