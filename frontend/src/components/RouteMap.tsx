import type { FeatureCollection, LineString, Point } from 'geojson'
import { useEffect, useMemo, useRef, useState } from 'react'
import Map, {
  Layer,
  Marker,
  NavigationControl,
  Popup,
  Source,
  type MapLayerMouseEvent,
  type MapRef,
} from 'react-map-gl/maplibre'

import type { LngLat, Route, TripPlan } from '../api/types'
import { BASEMAP_STYLE_URL, US_INITIAL_VIEW } from '../lib/config'
import { RISK_COLOR_EXPRESSION } from '../lib/risk'
import { CheckpointDetails } from './CheckpointDetails'
import { MapLegend } from './MapLegend'

const OTHER_ROUTES_HIT_LAYER = 'other-routes-hit'
const CHECKPOINTS_LAYER = 'checkpoints'
const INTERACTIVE_LAYERS = [OTHER_ROUTES_HIT_LAYER, CHECKPOINTS_LAYER]

interface RouteMapProps {
  plan: TripPlan | null
  selectedRouteId: string | null
  onSelectRoute: (routeId: string) => void
}

export function RouteMap({ plan, selectedRouteId, onSelectRoute }: RouteMapProps) {
  const mapRef = useRef<MapRef>(null)
  const [loaded, setLoaded] = useState(false)
  const [hovering, setHovering] = useState(false)
  // Tagged with the data it belongs to, so it closes when that data changes.
  const [openCheckpoint, setOpenCheckpoint] = useState<{ key: string; index: number } | null>(null)

  const selected = plan?.routes.find((route) => route.id === selectedRouteId) ?? null
  const others = useMemo(() => plan?.routes.filter((route) => route.id !== selectedRouteId) ?? [], [plan, selectedRouteId])

  const otherLines = useMemo(() => routeLines(others), [others])
  const selectedSegments = useMemo(() => riskSegments(selected), [selected])
  const checkpoints = useMemo(() => checkpointPoints(selected), [selected])

  const dataKey = plan ? `${plan.trip_id}:${plan.interval_mi}:${selectedRouteId}` : ''

  // Frame all routes once per trip. The key is a plain string so interval
  // changes and route selection (same trip) leave the view alone.
  const frameKey = useMemo(() => {
    if (!plan) return null
    const bounds = boundsOf(plan.routes.flatMap((r) => r.checkpoints.flatMap((c) => c.segment)))
    return JSON.stringify({ trip: plan.trip_id, bounds })
  }, [plan])
  useEffect(() => {
    if (loaded && frameKey) mapRef.current?.fitBounds(JSON.parse(frameKey).bounds, { padding: 64, duration: 900 })
  }, [loaded, frameKey])

  const handleClick = (event: MapLayerMouseEvent) => {
    const feature = event.features?.[0]
    if (!feature) return
    if (feature.layer.id === CHECKPOINTS_LAYER) {
      setOpenCheckpoint({ key: dataKey, index: feature.properties.index as number })
    } else if (feature.layer.id === OTHER_ROUTES_HIT_LAYER) {
      onSelectRoute(feature.properties.routeId as string)
    }
  }

  const popupCheckpoint =
    selected && openCheckpoint?.key === dataKey ? (selected.checkpoints[openCheckpoint.index] ?? null) : null
  const start = selected?.checkpoints[0]?.position
  const end = selected?.checkpoints.at(-1)?.position

  return (
    <Map
      ref={mapRef}
      initialViewState={US_INITIAL_VIEW}
      mapStyle={BASEMAP_STYLE_URL}
      style={{ width: '100%', height: '100%' }}
      interactiveLayerIds={INTERACTIVE_LAYERS}
      cursor={hovering ? 'pointer' : 'grab'}
      onLoad={() => setLoaded(true)}
      onClick={handleClick}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <NavigationControl position="top-right" />

      <Source id="other-routes" type="geojson" data={otherLines}>
        <Layer
          id="other-routes"
          type="line"
          layout={{ 'line-join': 'round', 'line-cap': 'round' }}
          paint={{ 'line-color': '#64748b', 'line-width': 4, 'line-opacity': 0.55 }}
        />
        {/* Wide invisible line so the thin alternatives are easy to click. */}
        <Layer id={OTHER_ROUTES_HIT_LAYER} type="line" paint={{ 'line-color': '#000', 'line-width': 18, 'line-opacity': 0.01 }} />
      </Source>

      <Source id="selected-route" type="geojson" data={selectedSegments}>
        <Layer
          id="selected-route-casing"
          type="line"
          layout={{ 'line-join': 'round', 'line-cap': 'round' }}
          paint={{ 'line-color': '#ffffff', 'line-width': 9 }}
        />
        <Layer
          id="selected-route"
          type="line"
          layout={{ 'line-join': 'round', 'line-cap': 'round' }}
          paint={{ 'line-color': RISK_COLOR_EXPRESSION, 'line-width': 5 }}
        />
      </Source>

      <Source id="checkpoints" type="geojson" data={checkpoints}>
        <Layer
          id={CHECKPOINTS_LAYER}
          type="circle"
          paint={{
            'circle-color': RISK_COLOR_EXPRESSION,
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 2.5, 7, 4.5, 11, 7],
            'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 4, 0.75, 7, 1.5],
            'circle-stroke-color': '#ffffff',
          }}
        />
      </Source>

      {start && <EndpointMarker position={start} label="A" />}
      {end && <EndpointMarker position={end} label="B" />}

      {popupCheckpoint && selected && (
        <Popup
          longitude={popupCheckpoint.position[0]}
          latitude={popupCheckpoint.position[1]}
          onClose={() => setOpenCheckpoint(null)}
          closeOnClick={false}
          maxWidth="300px"
        >
          <CheckpointDetails
            checkpoint={popupCheckpoint}
            isLast={popupCheckpoint.index === selected.checkpoints.length - 1}
          />
        </Popup>
      )}

      {plan && <MapLegend />}
    </Map>
  )
}

function EndpointMarker({ position, label }: { position: LngLat; label: string }) {
  return (
    <Marker longitude={position[0]} latitude={position[1]} anchor="center">
      <div className="flex size-7 items-center justify-center rounded-full border-2 border-white bg-slate-900 text-xs font-bold text-white shadow-md">
        {label}
      </div>
    </Marker>
  )
}

function routeLines(routes: Route[]): FeatureCollection<LineString> {
  return {
    type: 'FeatureCollection',
    features: routes.map((route) => ({
      type: 'Feature',
      properties: { routeId: route.id },
      geometry: { type: 'LineString', coordinates: route.checkpoints.flatMap((c) => c.segment) },
    })),
  }
}

function riskSegments(route: Route | null): FeatureCollection<LineString> {
  return {
    type: 'FeatureCollection',
    features: (route?.checkpoints ?? []).map((checkpoint) => ({
      type: 'Feature',
      properties: { level: checkpoint.risk.level },
      geometry: { type: 'LineString', coordinates: checkpoint.segment },
    })),
  }
}

function checkpointPoints(route: Route | null): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: (route?.checkpoints ?? []).map((checkpoint) => ({
      type: 'Feature',
      properties: { index: checkpoint.index, level: checkpoint.risk.level },
      geometry: { type: 'Point', coordinates: checkpoint.position },
    })),
  }
}

function boundsOf(points: LngLat[]): [LngLat, LngLat] {
  let [minLng, minLat, maxLng, maxLat] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const [lng, lat] of points) {
    minLng = Math.min(minLng, lng)
    minLat = Math.min(minLat, lat)
    maxLng = Math.max(maxLng, lng)
    maxLat = Math.max(maxLat, lat)
  }
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ]
}
