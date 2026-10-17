import { useState } from 'react'

import type { Interval, Place, TripRequest } from '../api/types'
import { formatWeight, toLocalInputValue } from '../lib/format'
import { IntervalSelector } from './IntervalSelector'
import { PlaceInput } from './PlaceInput'

const MAX_LOAD_LB = 50_000
const MAX_DAYS_AHEAD = 7
const DAY_MS = 24 * 60 * 60 * 1000

interface TripFormProps {
  onSubmit: (request: TripRequest) => void
  submitting: boolean
  // Owned by the app: changing it also re-assesses the trip on screen.
  interval: Interval
  onIntervalChange: (interval: Interval) => void
  intervalBusy: boolean
}

export function TripForm({ onSubmit, submitting, interval, onIntervalChange, intervalBusy }: TripFormProps) {
  const [origin, setOrigin] = useState<Place | null>(null)
  const [destination, setDestination] = useState<Place | null>(null)
  const [departure, setDeparture] = useState(() => toLocalInputValue(new Date()))
  const [load, setLoad] = useState('35000')
  const [error, setError] = useState<string | null>(null)
  // Bounds for the date picker; the server re-validates on submit.
  const [pickerRange] = useState(() => {
    const opened = Date.now()
    return {
      min: toLocalInputValue(new Date(opened)),
      max: toLocalInputValue(new Date(opened + MAX_DAYS_AHEAD * DAY_MS)),
    }
  })

  const loadLb = Number(load)

  const validate = (now: number): string | null => {
    if (!origin || !destination) return 'Pick an origin and a destination from the suggestions.'
    if (!Number.isFinite(loadLb) || loadLb < 1 || loadLb > MAX_LOAD_LB)
      return `Load weight must be between 1 and ${MAX_LOAD_LB.toLocaleString('en-US')} lb.`
    const departureDate = new Date(departure)
    if (Number.isNaN(departureDate.getTime())) return 'Enter a departure date and time.'
    if (departureDate.getTime() > now + MAX_DAYS_AHEAD * DAY_MS)
      return `Departure must be within ${MAX_DAYS_AHEAD} days.`
    return null
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const now = Date.now()
    const problem = validate(now)
    setError(problem)
    if (problem || !origin || !destination) return

    // A departure a few minutes in the past (form left open) means "now".
    const departureDate = new Date(Math.max(new Date(departure).getTime(), now))
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

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="departure" className="mb-1 block text-xs font-medium text-slate-600">
            Departure
          </label>
          <input
            id="departure"
            type="datetime-local"
            value={departure}
            min={pickerRange.min}
            max={pickerRange.max}
            onChange={(event) => setDeparture(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-100"
          />
        </div>
        <div>
          <label htmlFor="load" className="mb-1 block text-xs font-medium text-slate-600">
            Load weight (lb)
          </label>
          <input
            id="load"
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_LOAD_LB}
            step={500}
            value={load}
            onChange={(event) => setLoad(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-100"
          />
          <p className="mt-1 text-xs text-slate-400">
            {Number.isFinite(loadLb) && loadLb > 0 ? formatWeight(loadLb).secondary : ' '}
          </p>
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

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-wait disabled:opacity-60"
      >
        {submitting ? 'Planning routes…' : 'Plan routes'}
      </button>
    </form>
  )
}
