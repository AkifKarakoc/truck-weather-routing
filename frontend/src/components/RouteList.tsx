import type { TripPlan } from '../api/types'
import { RouteCard } from './RouteCard'

interface RouteListProps {
  plan: TripPlan
  selectedRouteId: string
  onSelect: (routeId: string) => void
}

export function RouteList({ plan, selectedRouteId, onSelect }: RouteListProps) {
  const { recommendation } = plan
  const ordered = [...plan.routes].sort((a, b) => a.rank - b.rank)

  return (
    <div className="flex flex-col gap-3">
      {recommendation.all_routes_blocked && (
        <div role="alert" className="rounded-md border border-purple-300 bg-purple-50 p-3 text-sm text-purple-900">
          <strong className="font-semibold">Travel not advised.</strong> Every route crosses a No Travel stretch. The
          least risky option is shown as recommended.
        </div>
      )}
      {plan.warnings.map((warning) => (
        <p key={warning} className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {warning}
        </p>
      ))}
      {ordered.map((route) => (
        <RouteCard
          key={route.id}
          route={route}
          selected={route.id === selectedRouteId}
          recommended={route.id === recommendation.route_id}
          reason={recommendation.reason}
          onSelect={() => onSelect(route.id)}
        />
      ))}
    </div>
  )
}
