import type { Interval } from '../api/types'

const INTERVALS: Interval[] = [10, 25, 50]

interface IntervalSelectorProps {
  value: Interval
  onChange: (interval: Interval) => void
  disabled?: boolean
}

export function IntervalSelector({ value, onChange, disabled }: IntervalSelectorProps) {
  return (
    <div role="radiogroup" aria-label="Weather checkpoint interval" className="flex rounded-md border border-slate-300 p-0.5">
      {INTERVALS.map((interval) => (
        <button
          key={interval}
          type="button"
          role="radio"
          aria-checked={value === interval}
          disabled={disabled}
          onClick={() => onChange(interval)}
          className={`flex-1 rounded px-3 py-1.5 text-sm transition-colors disabled:opacity-50 ${
            value === interval ? 'bg-sky-700 font-medium text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          {interval} mi
        </button>
      ))}
    </div>
  )
}
