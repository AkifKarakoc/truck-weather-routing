import { useEffect, useRef } from 'react'

import type { Route } from '../api/types'
import { formatDuration, formatMiles, formatTime } from '../lib/format'
import { isDesktopLayout } from '../lib/media'
import { RiskBar } from './RiskBar'

interface RouteCardProps {
  route: Route
  selected: boolean
  recommended: boolean
  reason?: string
  onSelect: () => void
}

export function RouteCard({ route, selected, recommended, reason, onSelect }: RouteCardProps) {
  const distance = formatMiles(route.distance_mi)
  const ref = useRef<HTMLButtonElement>(null)

  // On desktop, a route picked on the map should be visible in the sidebar too.
  useEffect(() => {
    if (selected && isDesktopLayout()) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selected])

  return (
    <button
      ref={ref}
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`w-full rounded-lg border bg-white p-3 text-left transition-shadow ${
        selected
          ? 'border-sky-600 shadow-md ring-1 ring-sky-600'
          : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{route.name}</h3>
            {recommended && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                Recommended
              </span>
            )}
          </div>
          {route.via.length > 0 && <p className="text-xs text-slate-500">via {route.via.join(' · ')}</p>}
        </div>
        <div className="text-right">
          <p className="font-semibold tabular-nums">{formatDuration(route.duration_s)}</p>
          <p className="text-xs text-slate-500 tabular-nums">
            {distance.primary} <span className="text-slate-400">/ {distance.secondary}</span>
          </p>
        </div>
      </div>

      <div className="mt-3">
        <RiskBar milesByLevel={route.miles_by_level} />
      </div>

      <dl className="mt-2 flex justify-between text-xs text-slate-500">
        <div>
          <dt className="inline">Arrives </dt>
          <dd className="inline font-medium text-slate-700">{formatTime(route.arrival_time)}</dd>
        </div>
        <div>
          <dt className="inline">Avg. risk </dt>
          <dd className="inline font-medium text-slate-700 tabular-nums">{route.average_risk.toFixed(2)} / 4</dd>
        </div>
      </dl>

      {recommended && reason && (
        <p className="mt-2 rounded bg-emerald-50 px-2 py-1.5 text-xs text-emerald-900">{reason}</p>
      )}
    </button>
  )
}
