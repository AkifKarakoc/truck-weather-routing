import { useQuery } from '@tanstack/react-query'
import { useCallback, useState } from 'react'

import { getHeatmap } from './api/client'
import type { HeatmapLayerKind, TripPlan } from './api/types'
import { HeatmapControls } from './components/HeatmapControls'
import { IntervalSelector } from './components/IntervalSelector'
import { RouteList } from './components/RouteList'
import { RouteMap } from './components/RouteMap'
import { TripForm } from './components/TripForm'
import { formatTime, formatWeight } from './lib/format'
import { useTripPlanner } from './lib/useTripPlanner'

export default function App() {
  const { plan, planTrip, changeInterval, isPlanning, isUpdating, error } = useTripPlanner()
  const [selection, setSelection] = useState<{ tripId: string; routeId: string } | null>(null)

  // Default to the recommended route for each new trip; keep the user's
  // choice across interval changes of the same trip.
  const selectedRouteId =
    plan && selection?.tripId === plan.trip_id ? selection.routeId : (plan?.recommendation.route_id ?? null)
  const selectRoute = (routeId: string) => plan && setSelection({ tripId: plan.trip_id, routeId })

  // Loaded after the routes so they appear first; the slider never refetches.
  const tripId = plan?.trip_id
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
    <div className="flex h-full flex-col md:flex-row">
      <aside className="flex w-full shrink-0 flex-col overflow-y-auto border-slate-200 bg-slate-50 md:w-[420px] md:border-r">
        <header className="border-b border-slate-200 bg-white px-5 py-4">
          <h1 className="text-lg font-semibold">Truck Weather Routing</h1>
          <p className="text-xs text-slate-500">Compare truck routes by forecast weather at your ETA.</p>
        </header>

        <section className="border-b border-slate-200 bg-white px-5 py-4">
          <TripForm onSubmit={planTrip} submitting={isPlanning} />
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
              <PlanHeader plan={plan} />
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-xs text-slate-500">Checkpoints every</span>
                <div className="flex-1">
                  <IntervalSelector value={plan.interval_mi} onChange={changeInterval} disabled={isUpdating} />
                </div>
              </div>
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

      <main className="relative h-[60vh] min-h-0 flex-1 md:h-full">
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

function PlanHeader({ plan }: { plan: TripPlan }) {
  return (
    <div className="text-xs text-slate-500">
      <p>
        <span className="font-semibold text-slate-700">{plan.routes.length} routes</span> · departing{' '}
        {formatTime(plan.departure_time)} · {formatWeight(plan.load_lb).primary} load
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
