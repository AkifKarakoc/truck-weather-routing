import type { FeatureCollection, Point } from 'geojson'
import type { CircleLayerSpecification, ExpressionSpecification } from 'maplibre-gl'

import type { Heatmap, HeatmapLayerKind } from '../api/types'
import { RISK_COLORS } from './risk'

export const HEATMAP_LAYERS: { kind: HeatmapLayerKind; label: string }[] = [
  { kind: 'risk', label: 'Risk' },
  { kind: 'wind', label: 'Wind' },
  { kind: 'rain', label: 'Rain' },
  { kind: 'snow', label: 'Snow' },
]

// Per-hour property names: r3 = risk at departure + 3h, w3 = wind, p3 = rain, s3 = snow.
const PREFIX: Record<HeatmapLayerKind, string> = { risk: 'r', wind: 'w', rain: 'p', snow: 's' }

/**
 * Lower bounds of Moderate, High, Severe and No Travel per condition (same
 * rules as the backend). Rain/snow No Travel is strictly above 1.00 / 3.0;
 * values arrive rounded to 0.01, so the next step is 1.01 / 3.01.
 */
const STEPS: Record<Exclude<HeatmapLayerKind, 'risk'>, number[]> = {
  wind: [25, 35, 45, 55],
  rain: [0.1, 0.25, 0.5, 1.01],
  snow: [0.5, 1.0, 2.0, 3.01],
}

/** One point feature per grid cell carrying every hour's values as properties. */
export function heatmapFeatures(heatmap: Heatmap): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: heatmap.points.map((coordinates, i) => {
      const properties: Record<string, number> = {}
      heatmap.hours.forEach((_, h) => {
        properties[`r${h}`] = heatmap.risk[i][h]
        properties[`w${h}`] = heatmap.wind_mph[i][h]
        properties[`p${h}`] = heatmap.rain_in_hr[i][h]
        properties[`s${h}`] = heatmap.snow_in_hr[i][h]
      })
      return { type: 'Feature', properties, geometry: { type: 'Point', coordinates } }
    }),
  }
}

// ~60 km at mid-US latitudes: 60,000 m / (78,271 m/px * cos 38°) at zoom 0 (512 px tiles).
const RADIUS_PX_AT_ZOOM_0 = 0.97

const COLOR_RAMP = [RISK_COLORS.low, RISK_COLORS.moderate, RISK_COLORS.high, RISK_COLORS.severe, RISK_COLORS.no_travel]

/**
 * Paint for the selected layer and hour. Only these expressions change while
 * the slider moves; the GeoJSON source is never re-uploaded.
 */
export function heatmapPaint(kind: HeatmapLayerKind, hour: number): CircleLayerSpecification['paint'] {
  const value: ExpressionSpecification = ['get', `${PREFIX[kind]}${hour}`]
  // Expressed as a risk level 0-4 so colour and opacity share one scale.
  const level =
    kind === 'risk'
      ? value
      : (['step', value, 0, ...STEPS[kind].flatMap((bound, i) => [bound, i + 1])] as ExpressionSpecification)

  return {
    'circle-color': [
      'match',
      level,
      ...COLOR_RAMP.flatMap((color, i) => [i, color]),
      RISK_COLORS.low,
    ] as ExpressionSpecification,
    // Calm areas stay faint so hazards stand out.
    'circle-opacity': ['case', ['==', level, 0], 0.22, 0.6],
    'circle-blur': 1,
    // Grid points are ~30 mi (48 km) apart. Radii are set in ground distance
    // (~60 km, doubling per zoom level) so the soft circles overlap into a
    // continuous field at every zoom.
    'circle-radius': ['interpolate', ['exponential', 2], ['zoom'], 0, RADIUS_PX_AT_ZOOM_0, 22, RADIUS_PX_AT_ZOOM_0 * 2 ** 22],
    'circle-pitch-alignment': 'map',
  }
}
