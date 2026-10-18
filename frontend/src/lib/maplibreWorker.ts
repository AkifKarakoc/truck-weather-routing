import { setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'

// MapLibre builds its worker URL at runtime, so bundlers never emit the file.
// Importing it with `?url` makes Vite ship it, and we hand MapLibre its address.
setWorkerUrl(workerUrl)
