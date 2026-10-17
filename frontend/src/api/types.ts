// Shapes returned by the Django API. Coordinates are [lng, lat].

export type LngLat = [number, number]

export type RiskLevel = 'low' | 'moderate' | 'high' | 'severe' | 'no_travel'

export type Condition = 'wind' | 'rain' | 'snow'

export type Interval = 10 | 25 | 50

export interface Place {
  label: string
  lat: number
  lng: number
}

export interface TripRequest {
  origin: Place
  destination: Place
  departure_time: string
  load_lb: number
  interval_mi: Interval
}

export interface CheckpointRisk {
  level: RiskLevel
  score: number
  governing: Condition | null
  load_rule: string | null
  by_condition: Record<Condition, RiskLevel>
}

export interface CheckpointWeather {
  wind_mph: number
  gust_mph: number
  rain_in_hr: number
  snow_in_hr: number
  temperature_f: number
  weather_code: number
}

export interface Checkpoint {
  index: number
  mile: number
  position: LngLat
  eta: string
  coverage_mi: [number, number]
  risk: CheckpointRisk
  weather: CheckpointWeather
  segment: LngLat[]
}

export interface Route {
  id: string
  name: string
  via: string[]
  rank: number
  distance_mi: number
  duration_s: number
  arrival_time: string
  miles_by_level: Record<RiskLevel, number>
  average_risk: number
  checkpoints: Checkpoint[]
}

export interface Recommendation {
  route_id: string
  criterion: string | null
  reason: string
  all_routes_blocked: boolean
}

export interface TripPlan {
  trip_id: string
  departure_time: string
  load_lb: number
  interval_mi: Interval
  routes: Route[]
  recommendation: Recommendation
  warnings: string[]
}

export type HeatmapLayerKind = 'risk' | 'wind' | 'rain' | 'snow'

/** Corridor weather; per-point series are indexed [point][hour], hour 0 = departure. */
export interface Heatmap {
  hours: string[]
  points: LngLat[]
  risk: number[][]
  wind_mph: number[][]
  rain_in_hr: number[][]
  snow_in_hr: number[][]
}
