import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import { ApiError, createTrip, getTrip } from '../api/client'
import type { Interval, TripPlan, TripRequest } from '../api/types'

interface PlanVariables {
  request: TripRequest
  // Set when re-assessing an existing trip with another interval.
  tripId?: string
}

async function fetchPlan({ request, tripId }: PlanVariables): Promise<TripPlan> {
  if (!tripId) return createTrip(request)
  try {
    return await getTrip(tripId, request.interval_mi)
  } catch (error) {
    // Trips live in the server cache for an hour; plan again transparently.
    if (error instanceof ApiError && error.code === 'trip_expired') return createTrip(request)
    throw error
  }
}

/** Holds the current plan and the request that produced it. */
export function useTripPlanner() {
  const [request, setRequest] = useState<TripRequest | null>(null)
  const [plan, setPlan] = useState<TripPlan | null>(null)

  const mutation = useMutation({
    mutationFn: fetchPlan,
    onSuccess: (result, variables) => {
      setPlan(result)
      setRequest(variables.request)
    },
  })

  const planTrip = (next: TripRequest) => {
    setPlan(null)
    mutation.mutate({ request: next })
  }

  const changeInterval = (interval: Interval) => {
    if (!request || !plan || interval === plan.interval_mi) return
    mutation.mutate({ request: { ...request, interval_mi: interval }, tripId: plan.trip_id })
  }

  const reset = () => {
    mutation.reset()
    setPlan(null)
    setRequest(null)
  }

  // The interval being applied right now, so the selector reflects the click immediately.
  const pendingInterval =
    mutation.isPending && mutation.variables?.tripId ? mutation.variables.request.interval_mi : null

  return {
    plan,
    pendingInterval,
    planTrip,
    changeInterval,
    reset,
    isPlanning: mutation.isPending && !mutation.variables?.tripId,
    isUpdating: mutation.isPending && Boolean(mutation.variables?.tripId),
    error: mutation.error,
  }
}
