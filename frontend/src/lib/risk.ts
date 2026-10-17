import type { RiskLevel } from '../api/types'

export const RISK_LEVELS: RiskLevel[] = ['low', 'moderate', 'high', 'severe', 'no_travel']

export const RISK_LABELS: Record<RiskLevel, string> = {
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
  severe: 'Severe',
  no_travel: 'No Travel',
}

export const RISK_COLORS: Record<RiskLevel, string> = {
  low: '#16a34a',
  moderate: '#eab308',
  high: '#f97316',
  severe: '#dc2626',
  no_travel: '#6b21a8',
}

// Text colour readable on top of each risk colour.
export const RISK_TEXT_COLORS: Record<RiskLevel, string> = {
  low: '#ffffff',
  moderate: '#1f2937',
  high: '#1f2937',
  severe: '#ffffff',
  no_travel: '#ffffff',
}

/** MapLibre `match` expression mapping a `level` property to its colour. */
export const RISK_COLOR_EXPRESSION = [
  'match',
  ['get', 'level'],
  ...RISK_LEVELS.flatMap((level) => [level, RISK_COLORS[level]]),
  '#94a3b8',
] as unknown as string
