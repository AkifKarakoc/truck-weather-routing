import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'

import { getHeatmap } from './api/client'
import type { HeatmapLayerKind, Interval, TripPlan } from './api/types'
import { HeatmapControls } from './components/HeatmapControls'
import { RouteList } from './components/RouteList'
import { RouteMap } from './components/RouteMap'
import { TripForm } from './components/TripForm'
import { formatTime, formatWeight } from './lib/format'
import { isDesktopLayout } from './lib/media'
import { useTripPlanner } from './lib/useTripPlanner'

export default function App() {
  const { plan, pendingInterval, planTrip, changeInterval, isPlanning, isUpdating, error } = useTripPlanner()
  // One checkpoint-interval control: it applies to the trip on screen and to the next search.
  const [draftInterval, setDraftInterval] = useState<Interval>(25)
  const interval = pendingInterval ?? plan?.interval_mi ?? draftInterval
  const selectInterval = (next: Interval) => {
    setDraftInterval(next)
    changeInterval(next)
  }
  const [selection, setSelection] = useState<{ tripId: string; routeId: string } | null>(null)

  // Default to the recommended route for each new trip; keep the user's
  // choice across interval changes of the same trip.
  const selectedRouteId =
    plan && selection?.tripId === plan.trip_id ? selection.routeId : (plan?.recommendation.route_id ?? null)
  const selectRoute = (routeId: string) => plan && setSelection({ tripId: plan.trip_id, routeId })
  const selectedRoute = plan?.routes.find((route) => route.id === selectedRouteId) ?? null
  const tripId = plan?.trip_id

  // On phones the form sits below the map; bring the map into view for each new trip.
  useEffect(() => {
    if (tripId && !isDesktopLayout()) window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [tripId])

  // Loaded after the routes so they appear first; the slider never refetches.
  const heatmap = useQuery({
    queryKey: ['heatmap', tripId],
    queryFn: () => getHeatmap(tripId!),
    enabled: Boolean(tripId),
    staleTime: Infinity,
    retry: false,
  })
  const [heatmapLayer, setHeatmapLayer] = useState<HeatmapLayerKind>('risk')
  const [hourState, setHourState] = useState<{ tripId: string; hour: number } | null>(null)
  const hour = hourState && hourState.tripId === tripId ? hourState.hour : 0
  const setHour = useCallback((next: number) => tripId && setHourState({ tripId, hour: next }), [tripId])

  return (
    // Phones: map on top, form and results scroll below. Desktop: sidebar + full-height map.
    <div className="flex min-h-full flex-col md:h-full md:flex-row">
      <aside className="flex w-full shrink-0 flex-col border-slate-200 bg-slate-50 md:w-[420px] md:overflow-y-auto md:border-r">
        <header className="border-b border-slate-200 bg-white px-5 py-4">
          <h1 className="text-lg font-semibold">Truck Weather Routing</h1>
          <p className="text-xs text-slate-500">Compare truck routes by forecast weather at your ETA.</p>
        </header>

        <section className="border-b border-slate-200 bg-white px-5 py-4">
          <TripForm
            onSubmit={planTrip}
            submitting={isPlanning}
            interval={interval}
            onIntervalChange={selectInterval}
            intervalBusy={isUpdating}
          />
        </section>

        <section className="flex flex-col gap-3 px-5 py-4" aria-live="polite">
          {error && (
            <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {error.message}
            </div>
          )}
          {isPlanning && <ResultsSkeleton />}
          {plan && selectedRouteId && (
            <>
              <PlanHeader plan={plan} updating={isUpdating} />
              <div className={isUpdating ? 'pointer-events-none opacity-50 transition-opacity' : 'transition-opacity'}>
                <RouteList plan={plan} selectedRouteId={selectedRouteId} onSelect={selectRoute} />
              </div>
            </>
          )}
          {!plan && !isPlanning && !error && (
            <p className="text-sm text-slate-500">
              Enter a trip to compare up to three truck routes. Weather is checked along each route at the time the
              truck is expected to pass.
            </p>
          )}
        </section>
      </aside>

      <main className="relative order-first h-[70svh] shrink-0 md:order-none md:h-full md:min-h-0 md:flex-1 md:shrink">
        <RouteMap
          plan={plan}
          selectedRouteId={selectedRouteId}
          onSelectRoute={selectRoute}
          heatmap={heatmap.data ?? null}
          heatmapLayer={heatmapLayer}
          hour={hour}
        />
        {plan && (
          <HeatmapControls
            hours={heatmap.data?.hours ?? null}
            arrivalHour={selectedRoute ? hoursBetween(plan.departure_time, selectedRoute.arrival_time) : null}
            hour={hour}
            onHourChange={setHour}
            layer={heatmapLayer}
            onLayerChange={setHeatmapLayer}
            status={heatmap.isError ? 'error' : heatmap.data ? 'ready' : 'loading'}
            errorMessage={heatmap.error?.message}
          />
        )}
      </main>
    </div>
  )
}

function hoursBetween(startIso: string, endIso: string): number {
  return (Date.parse(endIso) - Date.parse(startIso)) / 3_600_000
}

function PlanHeader({ plan, updating }: { plan: TripPlan; updating: boolean }) {
  return (
    <div className="text-xs text-slate-500">
      <p>
        <span className="font-semibold text-slate-700">{plan.routes.length} routes</span> · departing{' '}
        {formatTime(plan.departure_time)} · {formatWeight(plan.load_lb).primary} load · checkpoints every{' '}
        {plan.interval_mi} mi
        {updating && <span className="ml-1 text-sky-700">· updating…</span>}
      </p>
    </div>
  )
}

function ResultsSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-label="Loading routes">
      <p className="text-sm text-slate-500">Finding routes and checking the forecast along each one…</p>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-36 animate-pulse rounded-lg border border-slate-200 bg-white" />
      ))}
    </div>
  )
}
