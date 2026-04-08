export type AbstractionLevel = 'overview' | 'standard' | 'detailed'

export interface AbstractionTargetRange {
  min: number
  max: number
}

export interface AbstractionSelectionProfile {
  diagrams: AbstractionTargetRange
  objects: AbstractionTargetRange
  edges: AbstractionTargetRange
}

export interface AbstractionSelectionProfileOverrides {
  diagrams?: Partial<AbstractionTargetRange>
  objects?: Partial<AbstractionTargetRange>
  edges?: Partial<AbstractionTargetRange>
}

export const DEFAULT_ABSTRACTION_SELECTION_PROFILES: Record<AbstractionLevel, AbstractionSelectionProfile> = {
  overview: {
    diagrams: { min: 5, max: 10 },
    objects: { min: 20, max: 50 },
    edges: { min: 30, max: 75 },
  },
  standard: {
    diagrams: { min: 10, max: 25 },
    objects: { min: 40, max: 100 },
    edges: { min: 60, max: 150 },
  },
  detailed: {
    diagrams: { min: 25, max: 40 },
    objects: { min: 100, max: 500 },
    edges: { min: 150, max: 750 },
  },
}

export function resolveAbstractionSelectionProfile(
  level: AbstractionLevel,
  overrides?: AbstractionSelectionProfileOverrides | null,
): AbstractionSelectionProfile {
  const defaults = DEFAULT_ABSTRACTION_SELECTION_PROFILES[level]
  return {
    diagrams: resolveRange(defaults.diagrams, overrides?.diagrams),
    objects: resolveRange(defaults.objects, overrides?.objects),
    edges: resolveRange(defaults.edges, overrides?.edges),
  }
}

export function abstractionTargetMidpoint(range: AbstractionTargetRange): number {
  return Math.max(1, Math.round((range.min + range.max) / 2))
}

function resolveRange(
  defaults: AbstractionTargetRange,
  overrides?: Partial<AbstractionTargetRange>,
): AbstractionTargetRange {
  const allowedMin = Math.max(1, Math.floor(defaults.min / 2))
  const allowedMax = Math.max(allowedMin, Math.ceil(defaults.max * 2))

  const min = clampNumber(Math.round(overrides?.min ?? defaults.min), allowedMin, allowedMax)
  const max = clampNumber(Math.round(overrides?.max ?? defaults.max), allowedMin, allowedMax)

  return min <= max ? { min, max } : { min: max, max: min }
}

function clampNumber(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  return Math.max(min, Math.min(max, value))
}