"""Trip planning: ties routing, checkpoints, weather, risk and the recommendation together.

A planned trip (the HERE routes plus the user's inputs) is cached for an hour
under a random id, so changing the checkpoint interval or loading the
heatmap never calls HERE again.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime

from django.core.cache import cache

from . import here_client, weather_client
from .geometry import Checkpoint, RouteProfile, build_profile, place_checkpoints, simplify, slice_line
from .here_client import HereRoute, LatLng
from .recommend import Recommendation, RouteRisk, recommend, summarize_route
from .risk import RiskAssessment, WeatherSample, assess

# Average empty weight of a tractor and trailer; HERE needs the gross weight
# for road restrictions, while the risk rules use the load weight alone.
EMPTY_TRUCK_WEIGHT_LB = 35_000
TRIP_TTL_S = 60 * 60
# ~30 m; keeps route lines visually exact with a fraction of the points.
SIMPLIFY_TOLERANCE_DEG = 0.0003
ROUTE_LETTERS = "ABC"


class TripNotFound(Exception):
    """The trip id is unknown or its cache entry expired."""


@dataclass
class Trip:
    id: str
    origin: LatLng
    destination: LatLng
    departure: datetime
    load_lb: float
    routes: list[HereRoute]
    profiles: list[RouteProfile] = field(default_factory=list)
    # Polyline indexes kept for drawing, one list per route.
    drawn_points: list[list[int]] = field(default_factory=list)


@dataclass(frozen=True)
class AssessedCheckpoint:
    checkpoint: Checkpoint
    weather: WeatherSample
    risk: RiskAssessment
    segment: list[LatLng]


@dataclass(frozen=True)
class AssessedRoute:
    letter: str
    via: list[str]
    route: HereRoute
    profile: RouteProfile
    checkpoints: list[AssessedCheckpoint]
    summary: RouteRisk


@dataclass(frozen=True)
class TripPlan:
    trip: Trip
    interval_mi: int
    routes: list[AssessedRoute]
    recommendation: Recommendation


def create_trip(origin: LatLng, destination: LatLng, departure: datetime, load_lb: float) -> Trip:
    routes = here_client.fetch_truck_routes(origin, destination, departure, load_lb + EMPTY_TRUCK_WEIGHT_LB)
    profiles = [build_profile(r) for r in routes]
    trip = Trip(
        id=uuid.uuid4().hex,
        origin=origin,
        destination=destination,
        departure=departure,
        load_lb=load_lb,
        routes=routes,
        profiles=profiles,
        drawn_points=[simplify(r.coordinates, SIMPLIFY_TOLERANCE_DEG) for r in routes],
    )
    cache.set(_cache_key(trip.id), trip, TRIP_TTL_S)
    return trip


def get_trip(trip_id: str) -> Trip:
    trip = cache.get(_cache_key(trip_id))
    if trip is None:
        raise TripNotFound(trip_id)
    return trip


def assess_trip(trip: Trip, interval_mi: int) -> TripPlan:
    """Place checkpoints, look up the weather at each ETA and rank the routes."""
    checkpoints_per_route = [place_checkpoints(p, interval_mi, trip.departure) for p in trip.profiles]

    all_checkpoints = [c for checkpoints in checkpoints_per_route for c in checkpoints]
    latest_eta = max(c.eta for c in all_checkpoints)
    forecasts = weather_client.fetch_forecasts([c.position for c in all_checkpoints], until=latest_eta)

    assessed_routes = []
    for i, checkpoints in enumerate(checkpoints_per_route):
        profile, kept = trip.profiles[i], trip.drawn_points[i]
        assessed = []
        for checkpoint in checkpoints:
            weather = forecasts[weather_client.cell_of(checkpoint.position)].sample_at(checkpoint.eta)
            assessed.append(
                AssessedCheckpoint(
                    checkpoint=checkpoint,
                    weather=weather,
                    risk=assess(weather, trip.load_lb),
                    segment=slice_line(profile, kept, checkpoint.coverage_start_mi, checkpoint.coverage_end_mi),
                )
            )
        summary = summarize_route(
            ((a.checkpoint.coverage_miles, a.risk.level) for a in assessed), trip.routes[i].duration_s
        )
        assessed_routes.append(
            AssessedRoute(
                letter=ROUTE_LETTERS[i],
                via=main_roads(trip.routes[i]),
                route=trip.routes[i],
                profile=profile,
                checkpoints=assessed,
                summary=summary,
            )
        )

    recommendation = recommend([r.summary for r in assessed_routes])
    return TripPlan(trip=trip, interval_mi=interval_mi, routes=assessed_routes, recommendation=recommendation)


def main_roads(route: HereRoute, count: int = 2) -> list[str]:
    """The numbered roads carrying the most distance, e.g. ["I-70", "I-35"]."""
    ranked = sorted(route.road_lengths_m.items(), key=lambda item: item[1], reverse=True)
    return [name for name, _ in ranked[:count]]


def _cache_key(trip_id: str) -> str:
    return f"trip:{trip_id}"
