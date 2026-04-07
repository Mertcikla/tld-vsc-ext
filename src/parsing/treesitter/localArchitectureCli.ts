#!/usr/bin/env node

import { analyzeLocalArchitecture } from './LocalArchitectureAnalysis'

function parseArgs(argv: string[]): {
  repo: string
  level: 'overview' | 'standard' | 'detailed'
  includeExternalLibraries: boolean
  groupingStrategy: 'folder' | 'role' | 'hybrid'
  disablePathHeuristics: boolean
} {
  const args = {
    repo: '',
    level: 'standard' as const,
    includeExternalLibraries: true,
    groupingStrategy: 'hybrid' as const,
    disablePathHeuristics: false,
  }

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--repo') args.repo = argv[++i] ?? ''
    else if (arg === '--level') args.level = (argv[++i] as typeof args.level | undefined) ?? 'standard'
    else if (arg === '--grouping') args.groupingStrategy = (argv[++i] as typeof args.groupingStrategy | undefined) ?? 'hybrid'
    else if (arg === '--no-external') args.includeExternalLibraries = false
    else if (arg === '--disable-path-heuristics') args.disablePathHeuristics = true
  }

  if (!args.repo) throw new Error('Missing --repo <path>')
  return args
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv)
  const result = await analyzeLocalArchitecture(args)
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

main().catch((error) => {
  process.stderr.write(`local-arch-parse failed: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})