"""One JSON error shape for every failure: {"error": {"code", "message", "fields"?}}."""

from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import exception_handler

from .here_client import HereApiError, NoRouteFound
from .trips import TripNotFound
from .weather_client import WeatherRateLimited, WeatherUnavailable

# Most specific first: subclasses before their base classes.
SERVICE_ERRORS = (
    (NoRouteFound, status.HTTP_422_UNPROCESSABLE_ENTITY, "no_route", None),
    (HereApiError, status.HTTP_502_BAD_GATEWAY, "routing_unavailable", None),
    (WeatherRateLimited, status.HTTP_503_SERVICE_UNAVAILABLE, "weather_rate_limited", None),
    (WeatherUnavailable, status.HTTP_503_SERVICE_UNAVAILABLE, "weather_unavailable", None),
    (TripNotFound, status.HTTP_404_NOT_FOUND, "trip_expired", "This trip has expired. Please search again."),
)


def api_exception_handler(exc, context):
    for error_type, status_code, code, message in SERVICE_ERRORS:
        if isinstance(exc, error_type):
            return _error(status_code, code, message or str(exc))

    response = exception_handler(exc, context)
    if response is None:
        return None
    if isinstance(exc, ValidationError):
        return _error(response.status_code, "invalid_input", _first_message(response.data), fields=response.data)
    return _error(response.status_code, getattr(exc, "default_code", "error"), str(exc))


def _error(status_code: int, code: str, message: str, fields=None) -> Response:
    body = {"code": code, "message": message}
    if fields is not None:
        body["fields"] = fields
    return Response({"error": body}, status=status_code)


def _first_message(data) -> str:
    """Dig the first human-readable message out of DRF's nested error data."""
    while isinstance(data, (dict, list)) and data:
        data = next(iter(data.values())) if isinstance(data, dict) else data[0]
    return str(data) if data else "Invalid input."
