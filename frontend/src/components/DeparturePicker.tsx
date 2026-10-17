import { useEffect, useId, useRef, useState } from 'react'
import { DayPicker } from 'react-day-picker'
import 'react-day-picker/style.css'

const SLOT_MINUTES = 15
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

interface DeparturePickerProps {
  // null means "leave now" (resolved when the form is submitted).
  value: Date | null
  onChange: (value: Date | null) => void
  maxDaysAhead: number
}

const triggerFormat = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})
const slotFormat = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' })

export function DeparturePicker({ value, onChange, maxDaysAhead }: DeparturePickerProps) {
  const id = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  // Draft edited inside the popover; applied with "Set departure".
  const [draft, setDraft] = useState<Date>(() => value ?? new Date())
  const [now, setNow] = useState(() => new Date())
  const latest = new Date(now.getTime() + maxDaysAhead * DAY_MS)

  useEffect(() => {
    if (!open) return
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const openPicker = () => {
    const current = new Date()
    setNow(current)
    setDraft(roundUpToSlot(value ?? current))
    setOpen(true)
  }

  const choose = (next: Date | null) => {
    onChange(next)
    setOpen(false)
  }

  const slots = daySlots(draft).filter((slot) => slot >= now && slot <= latest)
  const selectedSlot = slots.find((slot) => slot.getTime() === draft.getTime()) ?? slots[0]

  const tomorrowSix = new Date(now)
  tomorrowSix.setDate(now.getDate() + 1)
  tomorrowSix.setHours(6, 0, 0, 0)
  const quickPicks: [string, Date | null][] = [
    ['Now', null],
    ['In 3 hours', roundUpToSlot(new Date(now.getTime() + 3 * HOUR_MS))],
    ['Tomorrow 6 AM', tomorrowSix],
  ]

  return (
    <div ref={rootRef} className="relative">
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-slate-600">
        Departure
      </label>
      <button
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openPicker())}
        className="flex w-full items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-left text-sm outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-100"
      >
        <CalendarIcon />
        <span className="flex-1">{value ? triggerFormat.format(value) : 'Now'}</span>
        <span className="text-xs text-slate-400">{value ? relativeLabel(value) : 'leave immediately'}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Choose departure time"
          className="absolute z-30 mt-1 w-full min-w-[300px] rounded-lg border border-slate-200 bg-white p-3 shadow-xl"
        >
          <div className="flex flex-wrap gap-1.5">
            {quickPicks.map(([label, pick]) => (
              <button
                key={label}
                type="button"
                onClick={() => choose(pick)}
                className="rounded-full border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:border-sky-600 hover:text-sky-800"
              >
                {label}
              </button>
            ))}
          </div>

          <DayPicker
            mode="single"
            required
            selected={draft}
            onSelect={(day) => setDraft(withTimeOf(day, draft))}
            defaultMonth={draft}
            startMonth={now}
            endMonth={latest}
            disabled={[{ before: startOfDay(now) }, { after: latest }]}
            className="departure-calendar mt-2"
          />

          <div className="flex items-end gap-2 border-t border-slate-100 pt-3">
            <label className="flex-1 text-xs font-medium text-slate-600">
              Time
              <select
                value={selectedSlot?.getTime() ?? ''}
                onChange={(event) => setDraft(new Date(Number(event.target.value)))}
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm font-normal text-slate-900"
              >
                {slots.map((slot) => (
                  <option key={slot.getTime()} value={slot.getTime()}>
                    {slotFormat.format(slot)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={!selectedSlot}
              onClick={() => selectedSlot && choose(selectedSlot)}
              className="rounded-md bg-sky-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-50"
            >
              Set departure
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-4 text-slate-500" fill="currentColor" aria-hidden="true">
      <path d="M6 2a1 1 0 0 1 1 1v1h6V3a1 1 0 1 1 2 0v1h1a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1V3a1 1 0 0 1 1-1Zm10 7H4v7h12V9Z" />
    </svg>
  )
}

function startOfDay(date: Date): Date {
  const day = new Date(date)
  day.setHours(0, 0, 0, 0)
  return day
}

function roundUpToSlot(date: Date): Date {
  const slotMs = SLOT_MINUTES * 60 * 1000
  return new Date(Math.ceil(date.getTime() / slotMs) * slotMs)
}

function withTimeOf(day: Date, time: Date): Date {
  const result = new Date(day)
  result.setHours(time.getHours(), time.getMinutes(), 0, 0)
  return result
}

/** Every 15-minute slot of the given local day. */
function daySlots(day: Date): Date[] {
  const start = startOfDay(day)
  return Array.from(
    { length: (24 * 60) / SLOT_MINUTES },
    (_, i) => new Date(start.getTime() + i * SLOT_MINUTES * 60_000),
  )
}

function relativeLabel(date: Date): string {
  const hours = Math.round((date.getTime() - Date.now()) / HOUR_MS)
  if (hours < 1) return 'within the hour'
  return hours < 48 ? `in ${hours} h` : `in ${Math.round(hours / 24)} days`
}
