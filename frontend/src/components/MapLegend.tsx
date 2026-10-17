import { RISK_COLORS, RISK_LABELS, RISK_LEVELS } from '../lib/risk'

export function MapLegend() {
  return (
    <div className="pointer-events-none absolute bottom-8 left-3 rounded-md bg-white/95 p-2.5 text-xs shadow-md">
      <p className="mb-1 font-semibold text-slate-700">Risk at truck's ETA</p>
      <ul className="flex flex-col gap-0.5">
        {RISK_LEVELS.map((level) => (
          <li key={level} className="flex items-center gap-1.5 text-slate-600">
            <span className="inline-block h-1.5 w-4 rounded-full" style={{ backgroundColor: RISK_COLORS[level] }} />
            {RISK_LABELS[level]}
          </li>
        ))}
      </ul>
    </div>
  )
}
