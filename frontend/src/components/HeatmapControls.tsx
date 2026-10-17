import { useEffect, useState } from 'react'

import type { HeatmapLayerKind } from '../api/types'
import { formatTime } from '../lib/format'
import { HEATMAP_LAYERS } from '../lib/heatmap'

const PLAY_STEP_MS = 450

interface HeatmapControlsProps {
  hours: string[] | null
  hour: number
  onHourChange: (hour: number) => void
  layer: HeatmapLayerKind
  onLayerChange: (layer: HeatmapLayerKind) => void
  status: 'loading' | 'error' | 'ready'
  errorMessage?: string
}

export function HeatmapControls({
  hours,
  hour,
  onHourChange,
  layer,
  onLayerChange,
  status,
  errorMessage,
}: HeatmapControlsProps) {
  const [playing, setPlaying] = useState(false)
  const lastHour = hours ? hours.length - 1 : 48

  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => {
      if (hour >= lastHour) setPlaying(false)
      else onHourChange(hour + 1)
    }, PLAY_STEP_MS)
    return () => window.clearInterval(timer)
  }, [playing, hour, lastHour, onHourChange])

  const togglePlay = () => {
    if (!playing && hour >= lastHour) onHourChange(0)
    setPlaying(!playing)
  }

  return (
    <div className="absolute right-3 bottom-8 left-3 rounded-lg bg-white/95 p-3 shadow-lg md:left-auto md:w-[440px]">
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
                setPlaying(false)
                onHourChange(Number(event.target.value))
              }}
              aria-label="Hours after departure"
              aria-valuetext={`${hour} hours after departure`}
              className="w-full accent-sky-700"
            />
            <div className="flex justify-between text-[11px] text-slate-500 tabular-nums">
              <span>
                <strong className="text-slate-800">+{hour}h</strong>
                {hours && ` · ${formatTime(hours[hour])}`}
              </span>
              <span>{status === 'loading' ? 'Loading forecast…' : `0–${lastHour}h after departure`}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
