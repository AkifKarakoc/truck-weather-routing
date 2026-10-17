import { useState } from 'react'

import type { Interval, Place, TripRequest } from '../api/types'
import { formatWeight } from '../lib/format'
import { DeparturePicker } from './DeparturePicker'
import { IntervalSelector } from './IntervalSelector'
import { PlaceInput } from './PlaceInput'

const MAX_LOAD_LB = 50_000
const MAX_DAYS_AHEAD = 7
const DAY_MS = 24 * 60 * 60 * 1000
const DEFAULT_LOAD_LB = '35000'

interface TripFormProps {
  onSubmit: (request: TripRequest) => void
  onReset: () => void
  submitting: boolean
  // Owned by the app: changing it also re-assesses the trip on screen.
  interval: Interval
  onIntervalChange: (interval: Interval) => void
  intervalBusy: boolean
}

export function TripForm({ onSubmit, onReset, submitting, interval, onIntervalChange, intervalBusy }: TripFormProps) {
  const [origin, setOrigin] = useState<Place | null>(null)
  const [destination, setDestination] = useState<Place | null>(null)
  // null = leave now.
  const [departure, setDeparture] = useState<Date | null>(null)
  const [load, setLoad] = useState(DEFAULT_LOAD_LB)
  const [error, setError] = useState<string | null>(null)

  const loadLb = Number(load)

  const validate = (now: number): string | null => {
    if (!origin || !destination) return 'Pick an origin and a destination from the suggestions.'
    if (!Number.isFinite(loadLb) || loadLb < 1 || loadLb > MAX_LOAD_LB)
      return `Load weight must be between 1 and ${MAX_LOAD_LB.toLocaleString('en-US')} lb.`
    if (departure && departure.getTime() > now + MAX_DAYS_AHEAD * DAY_MS)
      return `Departure must be within ${MAX_DAYS_AHEAD} days.`
    return null
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const now = Date.now()
    const problem = validate(now)
    setError(problem)
    if (problem || !origin || !destination) return

    // "Now", or a chosen time that has slipped into the past while the form was open.
    const departureDate = new Date(Math.max(departure?.getTime() ?? now, now))
    onSubmit({
      origin,
      destination,
      departure_time: departureDate.toISOString(),
      load_lb: loadLb,
      interval_mi: interval,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
      <PlaceInput label="Origin" placeholder="City or address" value={origin} onChange={setOrigin} />
      <PlaceInput label="Destination" placeholder="City or address" value={destination} onChange={setDestination} />

      <DeparturePicker value={departure} onChange={setDeparture} maxDaysAhead={MAX_DAYS_AHEAD} />

      <div>
        <label htmlFor="load" className="mb-1 block text-xs font-medium text-slate-600">
          Load weight (lb)
        </label>
        <div className="relative">
          <input
            id="load"
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_LOAD_LB}
            step={500}
            value={load}
            onChange={(event) => setLoad(event.target.value)}
            className="w-full rounded-md border border-slate-300 py-2 pr-24 pl-3 text-sm outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-100"
          />
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-slate-400">
            {Number.isFinite(loadLb) && loadLb > 0 ? `≈ ${formatWeight(loadLb).secondary}` : ''}
          </span>
        </div>
      </div>

      <div>
        <span className="mb-1 block text-xs font-medium text-slate-600">Weather checkpoint every</span>
        <IntervalSelector value={interval} onChange={onIntervalChange} disabled={submitting || intervalBusy} />
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onReset}
          disabled={submitting}
          className="rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          Reset
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 rounded-md bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-wait disabled:opacity-60"
        >
          {submitting ? 'Planning routes…' : 'Plan routes'}
        </button>
      </div>
    </form>
  )
}
