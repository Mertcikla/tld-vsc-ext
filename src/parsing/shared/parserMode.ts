import type { ArchitectureParserMode, ParserResolution, ResolvedArchitectureParserMode } from './types'

export function normalizeArchitectureParserMode(value: unknown): ArchitectureParserMode {
  return value === 'lsp' || value === 'treesitter' || value === 'auto' ? value : 'auto'
}

export function createParserResolution(
  requestedMode: ArchitectureParserMode,
  resolvedMode: ResolvedArchitectureParserMode,
  reason?: string,
): ParserResolution {
  return {
    requestedMode,
    resolvedMode,
    didFallback: requestedMode !== 'auto' && requestedMode !== resolvedMode,
    ...(reason ? { reason } : {}),
  }
}

export function createAutoFallbackResolution(
  resolvedMode: ResolvedArchitectureParserMode,
  reason: string,
): ParserResolution {
  return {
    requestedMode: 'auto',
    resolvedMode,
    didFallback: true,
    reason,
  }
}

export function formatParserLabel(mode: ArchitectureParserMode | ResolvedArchitectureParserMode): string {
  return mode === 'treesitter' ? 'Tree-sitter' : mode.toUpperCase()
}