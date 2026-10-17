import { RISK_COLORS, RISK_LABELS, RISK_LEVELS } from '../lib/risk'

export function MapLegend({ showHeatmap }: { showHeatmap: boolean }) {
  return (
    <div className="pointer-events-none absolute top-3 left-3 max-w-[200px] rounded-md bg-white/95 p-2.5 text-xs shadow-md">
      <ul className="flex flex-col gap-0.5">
        {RISK_LEVELS.map((level) => (
          <li key={level} className="flex items-center gap-1.5 text-slate-600">
            <span className="inline-block h-1.5 w-4 rounded-full" style={{ backgroundColor: RISK_COLORS[level] }} />
            {RISK_LABELS[level]}
          </li>
        ))}
      </ul>
      <p className="mt-1.5 border-t border-slate-200 pt-1.5 text-[11px] leading-snug text-slate-500">
        <strong className="text-slate-700">Route &amp; dots:</strong> weather when the truck gets there.
        {showHeatmap && (
          <>
            <br />
            <strong className="text-slate-700">Shading:</strong> forecast at the slider hour.
          </>
        )}
      </p>
    </div>
  )
}
