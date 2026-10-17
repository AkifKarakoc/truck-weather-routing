import { useQuery } from '@tanstack/react-query'
import { useId, useState } from 'react'

import { suggestPlaces } from '../api/client'
import type { Place } from '../api/types'
import { useDebouncedValue } from '../lib/useDebouncedValue'

const MIN_QUERY_LENGTH = 3
const DEBOUNCE_MS = 300

interface PlaceInputProps {
  label: string
  placeholder: string
  value: Place | null
  onChange: (place: Place | null) => void
}

/** Text box with US place suggestions; only a picked suggestion counts as a value. */
export function PlaceInput({ label, placeholder, value, onChange }: PlaceInputProps) {
  const id = useId()
  const [text, setText] = useState(value?.label ?? '')
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)

  const query = useDebouncedValue(text.trim(), DEBOUNCE_MS)
  const searching = open && query.length >= MIN_QUERY_LENGTH && query !== value?.label
  const suggestions = useQuery({
    queryKey: ['places', query.toLowerCase()],
    queryFn: ({ signal }) => suggestPlaces(query, signal),
    enabled: searching,
    staleTime: Infinity,
  })
  const results = searching ? (suggestions.data ?? []) : []

  const choose = (place: Place) => {
    onChange(place)
    setText(place.label)
    setOpen(false)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    // While suggestions are open, Enter picks one instead of submitting the form.
    if (event.key === 'Enter' && searching) event.preventDefault()
    if (!results.length) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlighted((i) => (i + 1) % results.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlighted((i) => (i - 1 + results.length) % results.length)
    } else if (event.key === 'Enter') {
      choose(results[highlighted])
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="relative">
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-slate-600">
        {label}
      </label>
      <input
        id={id}
        type="text"
        autoComplete="off"
        role="combobox"
        aria-expanded={results.length > 0}
        aria-controls={`${id}-list`}
        placeholder={placeholder}
        value={text}
        onChange={(event) => {
          setText(event.target.value)
          setHighlighted(0)
          setOpen(true)
          if (value) onChange(null)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-100"
      />
      {searching && (
        <ul
          id={`${id}-list`}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg"
        >
          {suggestions.isPending && <li className="px-3 py-2 text-slate-400">Searching…</li>}
          {suggestions.isError && <li className="px-3 py-2 text-red-600">Search is unavailable right now.</li>}
          {suggestions.isSuccess && results.length === 0 && (
            <li className="px-3 py-2 text-slate-400">No US places found.</li>
          )}
          {results.map((place, index) => (
            <li
              key={`${place.lat},${place.lng},${place.label}`}
              role="option"
              aria-selected={index === highlighted}
              // mousedown fires before the input's blur closes the list.
              onMouseDown={(event) => {
                event.preventDefault()
                choose(place)
              }}
              onMouseEnter={() => setHighlighted(index)}
              className={`cursor-pointer px-3 py-2 ${index === highlighted ? 'bg-sky-50 text-sky-900' : ''}`}
            >
              {place.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
