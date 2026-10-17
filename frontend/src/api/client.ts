import { API_BASE_URL } from '../lib/config'
import type { Heatmap, Interval, Place, TripPlan, TripRequest } from './types'

/** Error with the API's `{error: {code, message}}` details attached. */
export class ApiError extends Error {
  readonly code: string
  readonly status: number

  constructor(message: string, code: string, status: number) {
    super(message)
    this.code = code
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    })
  } catch {
    throw new ApiError('Cannot reach the server. Check your connection and try again.', 'network', 0)
  }

  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const error = body?.error
    throw new ApiError(error?.message ?? `Request failed (${response.status}).`, error?.code ?? 'error', response.status)
  }
  return body as T
}

export function getJson<T>(path: string): Promise<T> {
  return request<T>(path)
}

export async function suggestPlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
  const data = await request<{ results: Place[] }>(`/places/suggest/?q=${encodeURIComponent(query)}`, { signal })
  return data.results
}

export function createTrip(trip: TripRequest): Promise<TripPlan> {
  return request<TripPlan>('/trips/', { method: 'POST', body: JSON.stringify(trip) })
}

export function getTrip(tripId: string, interval: Interval): Promise<TripPlan> {
  return request<TripPlan>(`/trips/${tripId}/?interval=${interval}`)
}

export function getHeatmap(tripId: string): Promise<Heatmap> {
  return request<Heatmap>(`/trips/${tripId}/heatmap/`)
}
