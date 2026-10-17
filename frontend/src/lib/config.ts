export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'

export const BASEMAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron'

// Continental US, used as the initial map view.
export const US_INITIAL_VIEW = { longitude: -98.5, latitude: 39.5, zoom: 3.6 }
