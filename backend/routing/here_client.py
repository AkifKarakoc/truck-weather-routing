"""Thin client for the HERE Routing API v8 (truck mode).

Responsible only for talking to HERE and turning its response into plain
dataclasses. Geometry and risk logic live elsewhere.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime

import flexpolyline
import requests
from django.conf import settings

ROUTES_URL = "https://router.hereapi.com/v8/routes"
REQUEST_TIMEOUT_S = 30
KG_PER_LB = 0.45359237
# Ask for the main route plus this many alternatives (3 routes total).
ALTERNATIVES = 2

LatLng = tuple[float, float]


class HereApiError(Exception):
    """HERE could not be reached or rejected the request."""


class NoRouteFound(HereApiError):
    """HERE answered but found no route between the two points."""


@dataclass(frozen=True)
class Span:
    """A stretch of the route starting at polyline index `offset`."""

    offset: int
    length_m: float
    duration_s: float
    route_numbers: tuple[str, ...] = ()


@dataclass
class HereRoute:
    coordinates: list[LatLng]
    spans: list[Span]
    length_m: float
    duration_s: float
    # Total metres driven on each numbered road (e.g. "I-25"), used to name the route.
    road_lengths_m: dict[str, float] = field(default_factory=dict)


def fetch_truck_routes(
    origin: LatLng,
    destination: LatLng,
    departure: datetime,
    gross_weight_lb: float,
) -> list[HereRoute]:
    """Return up to three truck routes, fastest first."""
    if not settings.HERE_API_KEY:
        raise HereApiError("HERE_API_KEY is not configured.")

    params = {
        "transportMode": "truck",
        "origin": _format_point(origin),
        "destination": _format_point(destination),
        "departureTime": departure.isoformat(),
        "return": "polyline,summary",
        "spans": "duration,length,routeNumbers",
        "alternatives": ALTERNATIVES,
        "vehicle[grossWeight]": round(gross_weight_lb * KG_PER_LB),
        "apiKey": settings.HERE_API_KEY,
    }
    try:
        response = requests.get(ROUTES_URL, params=params, timeout=REQUEST_TIMEOUT_S)
    except requests.RequestException as exc:
        # Do not include the request URL: it contains the API key.
        raise HereApiError("Could not reach the HERE routing service.") from exc

    if response.status_code != 200:
        raise HereApiError(f"HERE routing failed ({response.status_code}): {_error_title(response)}")

    routes = [parse_route(route) for route in response.json().get("routes", [])]
    if not routes:
        raise NoRouteFound("No truck route found between these locations.")
    return routes


def parse_route(route: dict) -> HereRoute:
    """Merge a HERE route's sections into one continuous polyline with spans."""
    coordinates: list[LatLng] = []
    spans: list[Span] = []
    length_m = 0.0
    duration_s = 0.0

    for section in route["sections"]:
        points = [(lat, lng) for lat, lng, *_ in flexpolyline.decode(section["polyline"])]
        # Consecutive sections share their junction point; keep it only once.
        index_shift = len(coordinates) - 1 if coordinates else 0
        coordinates.extend(points[1:] if coordinates else points)

        for span in section.get("spans", []):
            spans.append(
                Span(
                    offset=span["offset"] + index_shift,
                    length_m=span.get("length", 0),
                    duration_s=span.get("duration", 0),
                    route_numbers=tuple(rn["value"] for rn in span.get("routeNumbers", [])),
                )
            )
        length_m += section["summary"]["length"]
        duration_s += section["summary"]["duration"]

    return HereRoute(
        coordinates=coordinates,
        spans=spans,
        length_m=length_m,
        duration_s=duration_s,
        road_lengths_m=_road_lengths(spans),
    )


def _road_lengths(spans: list[Span]) -> dict[str, float]:
    totals: dict[str, float] = defaultdict(float)
    for span in spans:
        for number in span.route_numbers:
            totals[number] += span.length_m
    return dict(totals)


def _format_point(point: LatLng) -> str:
    return f"{point[0]:.6f},{point[1]:.6f}"


def _error_title(response: requests.Response) -> str:
    try:
        return response.json().get("title", "unknown error")
    except ValueError:
        return "unknown error"
