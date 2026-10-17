import type { RiskLevel } from '../api/types'
import { RISK_COLORS, RISK_LABELS, RISK_LEVELS } from '../lib/risk'

interface RiskBarProps {
  milesByLevel: Record<RiskLevel, number>
}

/** One horizontal bar split by how many miles fall in each risk level. */
export function RiskBar({ milesByLevel }: RiskBarProps) {
  const total = RISK_LEVELS.reduce((sum, level) => sum + milesByLevel[level], 0)
  const present = RISK_LEVELS.filter((level) => milesByLevel[level] > 0)
  const description = present.map((level) => `${RISK_LABELS[level]} ${Math.round(milesByLevel[level])} mi`).join(', ')

  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={description}>
        {present.map((level) => (
          <div
            key={level}
            title={`${RISK_LABELS[level]}: ${Math.round(milesByLevel[level])} mi`}
            style={{ width: `${(milesByLevel[level] / total) * 100}%`, backgroundColor: RISK_COLORS[level] }}
          />
        ))}
      </div>
      <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-600">
        {present.map((level) => (
          <li key={level} className="flex items-center gap-1">
            <span className="inline-block size-2 rounded-full" style={{ backgroundColor: RISK_COLORS[level] }} />
            {RISK_LABELS[level]} {Math.round(milesByLevel[level]).toLocaleString('en-US')} mi
          </li>
        ))}
      </ul>
    </div>
  )
}
