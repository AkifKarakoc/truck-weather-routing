import { scaleGradient, type ValueScale } from '../lib/heatmap'
import { RISK_COLORS, RISK_LEVELS, RISK_LABELS } from '../lib/risk'

const LEVEL_BY_LABEL = Object.fromEntries(RISK_LEVELS.map((level) => [RISK_LABELS[level], level]))
// Short labels so four thresholds fit under a narrow bar.
const SHORT_LABELS: Record<string, string> = { Moderate: 'Mod.', High: 'High', Severe: 'Sev.', 'No Travel': 'No trav.' }

/** Colour bar for a value layer, with the risk thresholds marked underneath. */
export function ValueScaleLegend({ scale }: { scale: ValueScale }) {
  return (
    <div className="mt-1.5" aria-label={`Colour scale in ${scale.unit}`}>
      <div className="h-2 rounded-full" style={{ background: scaleGradient(scale) }} />
      <div className="relative mt-0.5 h-7 text-[10px] text-slate-500 tabular-nums">
        <span className="absolute left-0">0 {scale.unit}</span>
        {scale.thresholds.map(([value, label]) => (
          <span
            key={label}
            className="absolute -translate-x-1/2 text-center leading-tight"
            style={{ left: `${(value / scale.max) * 100}%` }}
          >
            <span className="mx-auto block h-1 w-px bg-slate-500" />
            {value}
            <span className="block font-medium" style={{ color: RISK_COLORS[LEVEL_BY_LABEL[label]] }}>
              {SHORT_LABELS[label]}
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}
