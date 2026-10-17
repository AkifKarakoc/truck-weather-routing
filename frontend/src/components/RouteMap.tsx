import Map, { NavigationControl } from 'react-map-gl/maplibre'

import { BASEMAP_STYLE_URL, US_INITIAL_VIEW } from '../lib/config'

export function RouteMap() {
  return (
    <Map initialViewState={US_INITIAL_VIEW} mapStyle={BASEMAP_STYLE_URL} style={{ width: '100%', height: '100%' }}>
      <NavigationControl position="top-right" />
    </Map>
  )
}
