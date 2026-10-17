from django.conf import settings
from django.core.cache import cache
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from . import here_client, trips
from .serializers import (
    IntervalQuerySerializer,
    SuggestQuerySerializer,
    TripRequestSerializer,
    as_latlng,
    serialize_plan,
)

SUGGEST_CACHE_TTL_S = 24 * 60 * 60


@api_view(["GET"])
def health(request):
    return Response({"status": "ok", "here_configured": bool(settings.HERE_API_KEY)})


@api_view(["GET"])
def suggest_places(request):
    query = SuggestQuerySerializer(data=request.query_params)
    query.is_valid(raise_exception=True)
    text = query.validated_data["q"]

    # Typing the same prefix again (or another user doing so) costs no HERE call.
    cache_key = f"suggest:{text.lower()}"
    results = cache.get(cache_key)
    if results is None:
        places = here_client.suggest_places(text)
        results = [{"label": p.label, "lat": p.position[0], "lng": p.position[1]} for p in places]
        cache.set(cache_key, results, SUGGEST_CACHE_TTL_S)
    return Response({"results": results})


@api_view(["POST"])
def create_trip(request):
    form = TripRequestSerializer(data=request.data)
    form.is_valid(raise_exception=True)
    data = form.validated_data

    trip = trips.create_trip(
        origin=as_latlng(data["origin"]),
        destination=as_latlng(data["destination"]),
        departure=data["departure_time"],
        load_lb=data["load_lb"],
    )
    plan = trips.assess_trip(trip, data["interval_mi"])
    return Response(serialize_plan(plan), status=status.HTTP_201_CREATED)


@api_view(["GET"])
def trip_detail(request, trip_id: str):
    """Re-assess a cached trip, e.g. with a different checkpoint interval."""
    query = IntervalQuerySerializer(data=request.query_params)
    query.is_valid(raise_exception=True)

    plan = trips.assess_trip(trips.get_trip(trip_id), query.validated_data["interval"])
    return Response(serialize_plan(plan))
