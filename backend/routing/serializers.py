"""Request validation and response shaping for the trip API.

Coordinates in responses are [lng, lat] (GeoJSON order) so the frontend can
hand them straight to the map.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from django.utils import timezone
from rest_framework import serializers

from .geometry import haversine_miles
from .here_client import LatLng
from .risk import RiskLevel
from .trips import AssessedCheckpoint, AssessedRoute, TripPlan

MAX_LOAD_LB = 50_000
MAX_DAYS_AHEAD = 7
# A form submitted with "now" arrives a little later; accept small drift.
PAST_GRACE = timedelta(minutes=15)
INTERVAL_CHOICES = (10, 25, 50)
DEFAULT_INTERVAL = 25
MIN_TRIP_MILES = 1


class PointSerializer(serializers.Serializer):
    lat = serializers.FloatField(min_value=-90, max_value=90)
    lng = serializers.FloatField(min_value=-180, max_value=180)
    label = serializers.CharField(required=False, allow_blank=True, max_length=300)


class TripRequestSerializer(serializers.Serializer):
    origin = PointSerializer()
    destination = PointSerializer()
    departure_time = serializers.DateTimeField()
    load_lb = serializers.FloatField(min_value=1, max_value=MAX_LOAD_LB)
    interval_mi = serializers.ChoiceField(choices=INTERVAL_CHOICES, default=DEFAULT_INTERVAL)

    def validate_departure_time(self, value: datetime) -> datetime:
        now = timezone.now()
        if value < now - PAST_GRACE:
            raise serializers.ValidationError("Departure time cannot be in the past.")
        if value > now + timedelta(days=MAX_DAYS_AHEAD):
            raise serializers.ValidationError(f"Departure must be within {MAX_DAYS_AHEAD} days.")
        return max(value, now).replace(microsecond=0)

    def validate(self, attrs):
        if haversine_miles(as_latlng(attrs["origin"]), as_latlng(attrs["destination"])) < MIN_TRIP_MILES:
            raise serializers.ValidationError("Origin and destination are the same place.")
        return attrs


class IntervalQuerySerializer(serializers.Serializer):
    interval = serializers.ChoiceField(choices=INTERVAL_CHOICES, default=DEFAULT_INTERVAL)


class SuggestQuerySerializer(serializers.Serializer):
    q = serializers.CharField(min_length=3, max_length=200, trim_whitespace=True)


def as_latlng(point: dict) -> LatLng:
    return (point["lat"], point["lng"])


def serialize_plan(plan: TripPlan) -> dict:
    trip, recommendation = plan.trip, plan.recommendation
    best = plan.routes[recommendation.best_index]

    warnings = []
    if len(plan.routes) < 3:
        warnings.append(f"Only {len(plan.routes)} reasonable route(s) were found for this trip.")

    return {
        "trip_id": trip.id,
        "departure_time": _iso(trip.departure),
        "load_lb": trip.load_lb,
        "interval_mi": plan.interval_mi,
        "routes": [
            _serialize_route(route, rank=recommendation.ranking.index(i)) for i, route in enumerate(plan.routes)
        ],
        "recommendation": {
            "route_id": best.letter,
            "criterion": recommendation.deciding_criterion,
            "reason": recommendation.reason,
            "all_routes_blocked": recommendation.all_routes_blocked,
        },
        "warnings": warnings,
    }


def _serialize_route(route: AssessedRoute, rank: int) -> dict:
    summary = route.summary
    arrival = route.checkpoints[-1].checkpoint.eta
    return {
        "id": route.letter,
        "name": f"Route {route.letter}",
        "via": route.via,
        "rank": rank,
        "distance_mi": round(route.profile.total_miles, 1),
        "duration_s": round(route.route.duration_s),
        "arrival_time": _iso(arrival),
        "miles_by_level": {level.name.lower(): round(summary.miles(level), 1) for level in RiskLevel},
        "average_risk": round(summary.average_risk, 3),
        "checkpoints": [_serialize_checkpoint(c) for c in route.checkpoints],
    }


def _serialize_checkpoint(assessed: AssessedCheckpoint) -> dict:
    checkpoint, weather, risk = assessed.checkpoint, assessed.weather, assessed.risk
    return {
        "index": checkpoint.index,
        "mile": round(checkpoint.mile, 1),
        "position": _lnglat(checkpoint.position),
        "eta": _iso(checkpoint.eta),
        "coverage_mi": [round(checkpoint.coverage_start_mi, 2), round(checkpoint.coverage_end_mi, 2)],
        "risk": {
            "level": risk.level.name.lower(),
            "score": risk.level.value,
            "governing": risk.governing,
            "load_rule": risk.load_rule,
            "by_condition": {
                "wind": risk.wind.name.lower(),
                "rain": risk.rain.name.lower(),
                "snow": risk.snow.name.lower(),
            },
        },
        "weather": {
            "wind_mph": weather.wind_mph,
            "gust_mph": weather.gust_mph,
            "rain_in_hr": round(weather.rain_in_hr, 3),
            "snow_in_hr": round(weather.snow_in_hr, 3),
            "temperature_f": weather.temperature_f,
            "weather_code": weather.weather_code,
        },
        "segment": [_lnglat(p) for p in assessed.segment],
    }


def _iso(moment: datetime) -> str:
    return moment.replace(microsecond=0).isoformat()


def _lnglat(point: LatLng) -> list[float]:
    return [round(point[1], 5), round(point[0], 5)]
