import type { FeatureCollection, Point } from 'geojson'
import type { CircleLayerSpecification, ExpressionSpecification } from 'maplibre-gl'

import type { Heatmap, HeatmapLayerKind } from '../api/types'
import { RISK_COLORS } from './risk'

export const HEATMAP_LAYERS: { kind: HeatmapLayerKind; label: string; description: string }[] = [
  {
    kind: 'risk',
    label: 'Risk',
    description: 'overall risk at the slider hour (worst of wind, rain, snow, with load rules).',
  },
  { kind: 'wind', label: 'Wind', description: 'sustained wind at the slider hour.' },
  { kind: 'rain', label: 'Rain', description: 'rain incl. showers at the slider hour.' },
  { kind: 'snow', label: 'Snow', description: 'snowfall at the slider hour.' },
]

export type ValueLayerKind = Exclude<HeatmapLayerKind, 'risk'>

export interface ValueScale {
  unit: string
  // Right end of the legend bar; higher values use the last colour.
  max: number
  // [value, colour, opacity]: light and faint when calm, dark and solid when extreme.
  stops: [number, string, number][]
  // Risk thresholds marked on the legend (same rules as the backend).
  thresholds: [number, string][]
}

/**
 * Wind, rain and snow show the actual value on their own colour ramp, so the
 * layers stay informative on calm days. The ramps avoid the risk colours,
 * which keep their meaning for the route and the Risk layer.
 */
export const VALUE_SCALES: Record<ValueLayerKind, ValueScale> = {
  wind: {
    unit: 'mph',
    max: 60,
    stops: [
      [0, '#eff6ff', 0.1],
      [10, '#bfdbfe', 0.3],
      [20, '#60a5fa', 0.45],
      [30, '#2563eb', 0.55],
      [45, '#1e40af', 0.65],
      [60, '#172554', 0.7],
    ],
    thresholds: [
      [25, 'Moderate'],
      [35, 'High'],
      [45, 'Severe'],
      [55, 'No Travel'],
    ],
  },
  rain: {
    unit: 'in/hr',
    max: 1.2,
    stops: [
      [0, '#f0fdfa', 0],
      [0.01, '#99f6e4', 0.3],
      [0.1, '#2dd4bf', 0.45],
      [0.25, '#0d9488', 0.55],
      [0.5, '#115e59', 0.65],
      [1.2, '#042f2e', 0.7],
    ],
    thresholds: [
      [0.1, 'Moderate'],
      [0.25, 'High'],
      [0.5, 'Severe'],
      [1.0, 'No Travel'],
    ],
  },
  snow: {
    unit: 'in/hr',
    max: 3.5,
    stops: [
      [0, '#f5f3ff', 0],
      [0.05, '#ddd6fe', 0.3],
      [0.5, '#a78bfa', 0.45],
      [1.0, '#8b5cf6', 0.55],
      [2.0, '#6d28d9', 0.65],
      [3.5, '#3b0764', 0.7],
    ],
    thresholds: [
      [0.5, 'Moderate'],
      [1.0, 'High'],
      [2.0, 'Severe'],
      [3.0, 'No Travel'],
    ],
  },
}

/** CSS gradient matching a value scale, for the legend bar. */
export function scaleGradient(scale: ValueScale): string {
  const stops = scale.stops.map(([value, color]) => `${color} ${(value / scale.max) * 100}%`)
  return `linear-gradient(to right, ${stops.join(', ')})`
}

// Per-hour property names: r3 = risk at departure + 3h, w3 = wind, p3 = rain, s3 = snow.
const PREFIX: Record<HeatmapLayerKind, string> = { risk: 'r', wind: 'w', rain: 'p', snow: 's' }

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

const RISK_RAMP = [RISK_COLORS.low, RISK_COLORS.moderate, RISK_COLORS.high, RISK_COLORS.severe, RISK_COLORS.no_travel]

const CIRCLE_SHAPE = {
  'circle-blur': 1,
  // Grid points are ~30 mi (48 km) apart. Radii are set in ground distance
  // (~60 km, doubling per zoom level) so the soft circles overlap into a
  // continuous field at every zoom.
  'circle-radius': [
    'interpolate',
    ['exponential', 2],
    ['zoom'],
    0,
    RADIUS_PX_AT_ZOOM_0,
    22,
    RADIUS_PX_AT_ZOOM_0 * 2 ** 22,
  ] as ExpressionSpecification,
  'circle-pitch-alignment': 'map',
} satisfies CircleLayerSpecification['paint']

/**
 * Paint for the selected layer and hour. Only these expressions change while
 * the slider moves; the GeoJSON source is never re-uploaded.
 */
export function heatmapPaint(kind: HeatmapLayerKind, hour: number): CircleLayerSpecification['paint'] {
  const value: ExpressionSpecification = ['get', `${PREFIX[kind]}${hour}`]
  const colors = kind === 'risk' ? riskColors(value) : valueColors(value, VALUE_SCALES[kind])
  return { ...colors, ...CIRCLE_SHAPE }
}

function riskColors(level: ExpressionSpecification): CircleLayerSpecification['paint'] {
  return {
    'circle-color': [
      'match',
      level,
      ...RISK_RAMP.flatMap((color, i) => [i, color]),
      RISK_COLORS.low,
    ] as ExpressionSpecification,
    // Calm areas stay faint so hazards stand out.
    'circle-opacity': ['case', ['==', level, 0], 0.22, 0.6],
  }
}

function valueColors(value: ExpressionSpecification, scale: ValueScale): CircleLayerSpecification['paint'] {
  return {
    'circle-color': [
      'interpolate',
      ['linear'],
      value,
      ...scale.stops.flatMap(([stop, color]) => [stop, color]),
    ] as ExpressionSpecification,
    'circle-opacity': [
      'interpolate',
      ['linear'],
      value,
      ...scale.stops.flatMap(([stop, , opacity]) => [stop, opacity]),
    ] as ExpressionSpecification,
  }
}
