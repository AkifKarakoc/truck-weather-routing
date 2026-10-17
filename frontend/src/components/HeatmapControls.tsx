import { useEffect, useState } from 'react'

import type { HeatmapLayerKind } from '../api/types'
import { formatTime } from '../lib/format'
import { HEATMAP_LAYERS, VALUE_SCALES } from '../lib/heatmap'
import { RISK_COLORS, RISK_LABELS, RISK_LEVELS } from '../lib/risk'
import { ValueScaleLegend } from './ValueScaleLegend'

const PLAY_STEP_MS = 450

interface HeatmapControlsProps {
  hours: string[] | null
  // Hours from departure until the selected route arrives (may exceed 48).
  arrivalHour: number | null
  hour: number
  onHourChange: (hour: number) => void
  layer: HeatmapLayerKind
  onLayerChange: (layer: HeatmapLayerKind) => void
  // waiting = rate limited by the weather service, retrying shortly.
  status: 'loading' | 'waiting' | 'error' | 'ready'
  errorMessage?: string
}

export function HeatmapControls({
  hours,
  arrivalHour,
  hour,
  onHourChange,
  layer,
  onLayerChange,
  status,
  errorMessage,
}: HeatmapControlsProps) {
  // Where playback stops: the arrival hour if it is still ahead, else the end.
  const [playUntil, setPlayUntil] = useState<number | null>(null)
  const playing = playUntil !== null
  const lastHour = hours ? hours.length - 1 : 48
  const arrivalStep = arrivalHour !== null && arrivalHour < lastHour ? Math.ceil(arrivalHour) : null
  const arrived = arrivalHour !== null && hour >= arrivalHour

  useEffect(() => {
    if (playUntil === null) return
    const timer = window.setInterval(() => {
      if (hour >= playUntil) setPlayUntil(null)
      else onHourChange(hour + 1)
    }, PLAY_STEP_MS)
    return () => window.clearInterval(timer)
  }, [playUntil, hour, onHourChange])

  const togglePlay = () => {
    if (playing) return setPlayUntil(null)
    const start = hour >= lastHour ? 0 : hour
    if (start !== hour) onHourChange(start)
    setPlayUntil(arrivalStep !== null && start < arrivalStep ? arrivalStep : lastHour)
  }

  const description = HEATMAP_LAYERS.find((item) => item.kind === layer)?.description

  return (
    <div className="absolute right-3 bottom-8 left-3 z-10 rounded-lg bg-white/95 p-3 shadow-lg md:left-auto md:w-[440px] md:max-w-[calc(100%-1.5rem)]">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-700">Weather along the corridor</p>
        <div role="radiogroup" aria-label="Heatmap layer" className="flex rounded-md border border-slate-200 p-0.5">
          {HEATMAP_LAYERS.map(({ kind, label }) => (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={layer === kind}
              onClick={() => onLayerChange(kind)}
              className={`rounded px-2 py-0.5 text-xs ${
                layer === kind ? 'bg-slate-800 font-medium text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600" aria-label="Risk colours">
        {RISK_LEVELS.map((level) => (
          <li key={level} className="flex items-center gap-1">
            <span className="inline-block h-1.5 w-3.5 rounded-full" style={{ backgroundColor: RISK_COLORS[level] }} />
            {RISK_LABELS[level]}
          </li>
        ))}
      </ul>
      {/* Hidden on phones to leave more of the map visible. */}
      <p className="mt-1 hidden text-[11px] leading-snug text-slate-500 sm:block">
        <strong className="font-medium text-slate-700">Route &amp; dots:</strong> weather when the truck gets there.{' '}
        <strong className="font-medium text-slate-700">Shading:</strong> {description}
      </p>
      {layer !== 'risk' && <ValueScaleLegend scale={VALUE_SCALES[layer]} />}

      {status === 'error' ? (
        <p className="mt-2 text-xs text-red-700">{errorMessage ?? 'Weather layer unavailable.'}</p>
      ) : (
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={togglePlay}
            disabled={status !== 'ready'}
            aria-label={playing ? 'Pause' : 'Play forecast'}
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sky-700 text-white hover:bg-sky-800 disabled:opacity-40"
          >
            {playing ? (
              <svg viewBox="0 0 16 16" className="size-3.5" fill="currentColor" aria-hidden="true">
                <rect x="3" y="2" width="3.5" height="12" rx="1" />
                <rect x="9.5" y="2" width="3.5" height="12" rx="1" />
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" className="ml-0.5 size-3.5" fill="currentColor" aria-hidden="true">
                <path d="M4 2.5v11a.5.5 0 0 0 .77.42l8.5-5.5a.5.5 0 0 0 0-.84l-8.5-5.5A.5.5 0 0 0 4 2.5Z" />
              </svg>
            )}
          </button>
          <div className="flex-1">
            <input
              type="range"
              min={0}
              max={lastHour}
              step={1}
              value={hour}
              disabled={status !== 'ready'}
              onChange={(event) => {
                setPlayUntil(null)
                onHourChange(Number(event.target.value))
              }}
              aria-label="Hours after departure"
              aria-valuetext={`${hour} hours after departure${arrived ? ', truck has arrived' : ''}`}
              className="w-full accent-sky-700"
            />
            {arrivalStep !== null && (
              // Timeline under the slider: driving until arrival, then parked.
              <div aria-hidden="true" className="mx-1.5 mb-1 flex h-1 overflow-hidden rounded-full bg-slate-200">
                <div className="bg-sky-600/60" style={{ width: `${(arrivalHour! / lastHour) * 100}%` }} />
              </div>
            )}
            <div className="flex justify-between text-[11px] text-slate-500 tabular-nums">
              <span>
                <strong className="text-slate-800">+{hour}h</strong>
                {hours && ` · ${formatTime(hours[hour])}`}
                {arrived && <span className="font-medium text-slate-700"> · arrived</span>}
              </span>
              <span>
                {status === 'loading'
                  ? 'Loading forecast…'
                  : status === 'waiting'
                    ? 'Weather service busy, retrying in a minute…'
                    : arrivalStep !== null
                      ? `Arrives at +${arrivalHour!.toFixed(1)}h`
                      : `0–${lastHour}h after departure`}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
