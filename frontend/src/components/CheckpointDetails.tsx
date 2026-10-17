import type { Checkpoint } from '../api/types'
import {
  describeWeather,
  formatMiles,
  formatPrecipitation,
  formatSpeed,
  formatTemperature,
  formatTime,
  type Measure,
} from '../lib/format'
import { RISK_COLORS, RISK_LABELS, RISK_TEXT_COLORS } from '../lib/risk'

const CONDITION_LABELS = { wind: 'Wind', rain: 'Rain', snow: 'Snow' } as const

function Value({ measure }: { measure: Measure }) {
  return (
    <>
      {measure.primary} <span className="text-slate-400">/ {measure.secondary}</span>
    </>
  )
}

export function CheckpointDetails({ checkpoint, isLast }: { checkpoint: Checkpoint; isLast: boolean }) {
  const { risk, weather } = checkpoint
  const title = checkpoint.index === 0 ? 'Departure' : isLast ? 'Destination' : `Mile ${Math.round(checkpoint.mile)}`

  const rows: [string, Measure, keyof typeof CONDITION_LABELS | null][] = [
    ['Wind', formatSpeed(weather.wind_mph), 'wind'],
    ['Gusts', formatSpeed(weather.gust_mph), null],
    ['Rain', formatPrecipitation(weather.rain_in_hr), 'rain'],
    ['Snow', formatPrecipitation(weather.snow_in_hr), 'snow'],
    ['Temp.', formatTemperature(weather.temperature_f), null],
  ]

  return (
    <div className="w-64 text-xs text-slate-700">
      {/* Right padding keeps the badge clear of the popup's close button. */}
      <div className="flex items-center justify-between gap-2 pr-4">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <span
          className="rounded px-1.5 py-0.5 text-[11px] font-semibold"
          style={{ backgroundColor: RISK_COLORS[risk.level], color: RISK_TEXT_COLORS[risk.level] }}
        >
          {RISK_LABELS[risk.level]}
        </span>
      </div>
      <p className="mt-0.5 text-slate-500">
        ETA {formatTime(checkpoint.eta)} · {formatMiles(checkpoint.mile).primary} ·{' '}
        {describeWeather(weather.weather_code)}
      </p>

      <table className="mt-2 w-full">
        <tbody>
          {rows.map(([label, value, condition]) => (
            <tr key={label} className={condition && condition === risk.governing ? 'font-semibold text-slate-900' : ''}>
              <td className="py-0.5 pr-2 text-slate-500">{label}</td>
              <td className="py-0.5 tabular-nums">
                <Value measure={value} />
              </td>
              <td className="py-0.5 text-right">
                {condition && risk.by_condition[condition] !== 'low' && (
                  <span style={{ color: RISK_COLORS[risk.by_condition[condition]] }}>
                    {RISK_LABELS[risk.by_condition[condition]]}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {risk.load_rule && (
        <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-amber-900">Load rule: {risk.load_rule}</p>
      )}
      {risk.governing && !risk.load_rule && (
        <p className="mt-2 text-slate-500">Risk set by {CONDITION_LABELS[risk.governing].toLowerCase()}.</p>
      )}
      <p className="mt-1 text-[11px] text-slate-400">
        Covers miles {Math.round(checkpoint.coverage_mi[0])}–{Math.round(checkpoint.coverage_mi[1])} of the route.
      </p>
    </div>
  )
}
