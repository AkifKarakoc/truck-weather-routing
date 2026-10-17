import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    // MapLibre loads its web worker via `new URL(..., import.meta.url)`;
    // pre-bundling moves the module away from the worker file and breaks it.
    exclude: ['maplibre-gl'],
  },
  build: {
    // MapLibre is a single ~1 MB chunk (~290 kB gzipped) on its own; that is expected.
    chunkSizeWarningLimit: 1200,
  },
  server: {
    // In development the Django API runs separately; proxy it so the
    // browser talks to a single origin.
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
})
