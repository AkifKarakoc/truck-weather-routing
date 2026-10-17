import type { LngLat, Route } from '../api/types'

export interface TruckPosition {
  position: LngLat
  status: 'driving' | 'arrived'
}

/** Where the truck is at `time`, interpolated between checkpoint ETAs. */
export function truckPositionAt(route: Route, time: Date): TruckPosition {
  const t = time.getTime()
  const checkpoints = route.checkpoints
  const last = checkpoints[checkpoints.length - 1]

  if (t >= Date.parse(last.eta)) return { position: last.position, status: 'arrived' }

  for (let i = 1; i < checkpoints.length; i++) {
    const end = Date.parse(checkpoints[i].eta)
    if (t < end) {
      const start = Date.parse(checkpoints[i - 1].eta)
      const fraction = end > start ? Math.max(0, (t - start) / (end - start)) : 0
      return { position: alongLine(checkpoints[i - 1].position, checkpoints[i].position, fraction), status: 'driving' }
    }
  }
  return { position: checkpoints[0].position, status: 'driving' }
}

function alongLine(a: LngLat, b: LngLat, fraction: number): LngLat {
  return [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction]
}
