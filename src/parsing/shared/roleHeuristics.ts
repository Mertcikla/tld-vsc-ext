import type { ArchitecturalRole } from './roles'

const DEFAULT_PATH_RULES: Array<{ segments: string[]; role: ArchitecturalRole }> = [
  {
    segments: ['handler', 'controller', 'router', 'route', 'endpoint', 'api', 'rest', 'grpc', 'rpc', 'http', 'server', 'web'],
    role: 'api_entry',
  },
  {
    segments: ['service', 'svc', 'usecase', 'use_case', 'usecases', 'domain', 'application'],
    role: 'service',
  },
  {
    segments: ['repository', 'repositories', 'repo', 'store', 'storage', 'dao', 'db', 'database', 'data', 'persistence'],
    role: 'repository',
  },
  {
    segments: ['migration', 'migrations', 'seed', 'seeds', 'schema', 'schemas', 'query', 'queries'],
    role: 'data_exit',
  },
  {
    segments: ['model', 'models', 'entity', 'entities', 'dto', 'dtos', 'types', 'type', 'struct', 'structs', 'proto'],
    role: 'model',
  },
  {
    segments: ['util', 'utils', 'helper', 'helpers', 'lib', 'common', 'shared', 'pkg', 'tools', 'support'],
    role: 'utility',
  },
  {
    segments: ['middleware', 'middlewares', 'interceptor', 'interceptors', 'filter', 'filters', 'guard', 'guards'],
    role: 'service',
  },
  {
    segments: ['controllers', 'controller'],
    role: 'api_entry',
  },
  {
    segments: ['concerns', 'jobs', 'mailers', 'channels'],
    role: 'service',
  },
]

const DEFAULT_NAME_RULES: Array<{ match: RegExp; role: ArchitecturalRole }> = [
  { match: /(Controller|Handler|Router|Endpoint|Api)$/i, role: 'api_entry' },
  { match: /(Service|UseCase|Processor|Manager)$/i, role: 'service' },
  { match: /(Repository|Dao|Store|Storage|Database|Db)$/i, role: 'repository' },
  { match: /(Model|Entity|Dto|Type|Struct)$/i, role: 'model' },
  { match: /(Helper|Utils?)$/i, role: 'utility' },
]

export interface ArchitecturalRoleHeuristicMatch {
  role: ArchitecturalRole
  source: 'name' | 'path'
}

export function matchArchitecturalRoleHeuristics(
  symbolName: string,
  filePath: string,
  disablePathHeuristics: boolean,
): ArchitecturalRoleHeuristicMatch | null {
  for (const rule of DEFAULT_NAME_RULES) {
    if (rule.match.test(symbolName)) {
      return { role: rule.role, source: 'name' }
    }
  }

  if (disablePathHeuristics) return null

  const dirSegments = filePath.toLowerCase().split(/[/\\]/)
  for (const rule of DEFAULT_PATH_RULES) {
    if (dirSegments.some((segment) => rule.segments.some((candidate) => segment.includes(candidate)))) {
      return { role: rule.role, source: 'path' }
    }
  }

  return null
}