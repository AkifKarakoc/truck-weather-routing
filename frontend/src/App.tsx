import { useQuery } from '@tanstack/react-query'

import { getJson } from './api/client'
import { RouteMap } from './components/RouteMap'

interface Health {
  status: string
  here_configured: boolean
}

export default function App() {
  const health = useQuery({ queryKey: ['health'], queryFn: () => getJson<Health>('/health/') })

  return (
    <div className="flex h-full flex-col md:flex-row">
      <aside className="flex w-full shrink-0 flex-col gap-4 overflow-y-auto border-slate-200 bg-white p-5 md:w-[400px] md:border-r">
        <h1 className="text-lg font-semibold">Truck Weather Routing</h1>
        <p className="text-sm text-slate-500">
          API: {health.isPending ? 'checking…' : health.isError ? 'unreachable' : health.data.status}
          {health.data && !health.data.here_configured && ' (HERE key missing)'}
        </p>
      </aside>
      <main className="h-[60vh] min-h-0 flex-1 md:h-full">
        <RouteMap />
      </main>
    </div>
  )
}
