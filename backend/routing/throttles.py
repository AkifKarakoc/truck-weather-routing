"""Per-client request limits (rates are in settings.DEFAULT_THROTTLE_RATES)."""

from rest_framework.throttling import AnonRateThrottle


class TripCreateThrottle(AnonRateThrottle):
    """Planning a trip calls HERE once and Open-Meteo for every checkpoint."""

    scope = "trip_create"


class TripReadThrottle(AnonRateThrottle):
    """Interval changes and heatmaps reuse the cached routes."""

    scope = "trip_read"


class SuggestThrottle(AnonRateThrottle):
    """Address autosuggest (already debounced by the frontend)."""

    scope = "suggest"
