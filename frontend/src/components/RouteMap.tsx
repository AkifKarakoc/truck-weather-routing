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

import type { Heatmap, HeatmapLayerKind, LngLat, Route, TripPlan } from '../api/types'
import { BASEMAP_STYLE_URL, US_INITIAL_VIEW } from '../lib/config'
import { heatmapFeatures, heatmapPaint } from '../lib/heatmap'
import { RISK_COLOR_EXPRESSION } from '../lib/risk'
import { truckPositionAt } from '../lib/truckPosition'
import { CheckpointDetails } from './CheckpointDetails'
import { MapLegend } from './MapLegend'

const OTHER_ROUTES_HIT_LAYER = 'other-routes-hit'
const CHECKPOINTS_LAYER = 'checkpoints'
const INTERACTIVE_LAYERS = [OTHER_ROUTES_HIT_LAYER, CHECKPOINTS_LAYER]

interface RouteMapProps {
  plan: TripPlan | null
  selectedRouteId: string | null
  onSelectRoute: (routeId: string) => void
  heatmap: Heatmap | null
  heatmapLayer: HeatmapLayerKind
  hour: number
}

export function RouteMap({ plan, selectedRouteId, onSelectRoute, heatmap, heatmapLayer, hour }: RouteMapProps) {
  const mapRef = useRef<MapRef>(null)
  const [loaded, setLoaded] = useState(false)
  // Basemap label layer to slide the heatmap under, so place names stay readable.
  const [firstLabelLayer, setFirstLabelLayer] = useState<string | undefined>()
  const [hovering, setHovering] = useState(false)
  // Tagged with the data it belongs to, so it closes when that data changes.
  const [openCheckpoint, setOpenCheckpoint] = useState<{ key: string; index: number } | null>(null)

  const selected = plan?.routes.find((route) => route.id === selectedRouteId) ?? null
  const others = useMemo(() => plan?.routes.filter((route) => route.id !== selectedRouteId) ?? [], [plan, selectedRouteId])

  const otherLines = useMemo(() => routeLines(others), [others])
  const selectedSegments = useMemo(() => riskSegments(selected), [selected])
  const checkpoints = useMemo(() => checkpointPoints(selected), [selected])
  const heatmapData = useMemo(() => (heatmap ? heatmapFeatures(heatmap) : null), [heatmap])
  const heatmapStyle = useMemo(() => heatmapPaint(heatmapLayer, hour), [heatmapLayer, hour])
  const truck = selected && heatmap ? truckPositionAt(selected, new Date(heatmap.hours[hour])) : null

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
      onLoad={(event) => {
        setFirstLabelLayer(event.target.getStyle().layers.find((layer) => layer.type === 'symbol')?.id)
        setLoaded(true)
      }}
      onClick={handleClick}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <NavigationControl position="top-right" />

      {heatmapData && (
        <Source id="heatmap" type="geojson" data={heatmapData}>
          <Layer id="heatmap" type="circle" beforeId={firstLabelLayer} paint={heatmapStyle} />
        </Source>
      )}

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
      {truck && <TruckMarker position={truck.position} arrived={truck.status === 'arrived'} />}

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

      {plan && <MapLegend showHeatmap={Boolean(heatmap)} />}
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

function TruckMarker({ position, arrived }: { position: LngLat; arrived: boolean }) {
  return (
    <Marker longitude={position[0]} latitude={position[1]} anchor="center" style={{ zIndex: 2 }}>
      <div
        title={arrived ? 'Truck has arrived at this hour' : 'Truck position at the selected hour'}
        className="flex size-8 items-center justify-center rounded-full border-2 border-white bg-sky-700 text-white shadow-lg"
      >
        <svg viewBox="0 0 24 24" className="size-4.5" fill="currentColor" aria-hidden="true">
          <path d="M2 6a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v2h3.6a1 1 0 0 1 .8.4l2.4 3.2a1 1 0 0 1 .2.6V16a1 1 0 0 1-1 1h-1.2a2.5 2.5 0 0 1-4.6 0H9.8a2.5 2.5 0 0 1-4.6 0H3a1 1 0 0 1-1-1V6Zm13 4v3h4.8l-1.7-2.3-.5-.7H15ZM7.5 17.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm9 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" />
        </svg>
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
