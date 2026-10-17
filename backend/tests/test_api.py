from datetime import timedelta

import pytest
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APIClient

from routing import here_client, trips, weather_client
from routing.geometry import METERS_PER_MILE, haversine_miles
from routing.here_client import HereRoute, NoRouteFound, Place, Span
from routing.risk import WeatherSample
from routing.weather_client import WeatherRateLimited, WeatherUnavailable


def straight_route(lat: float, hours: float) -> HereRoute:
    coords = [(lat, i * 0.1) for i in range(30)]
    miles = haversine_miles(coords[0], coords[-1])
    return HereRoute(
        coordinates=coords,
        spans=[Span(0, 0, hours * 3600, ("I-10",))],
        length_m=miles * METERS_PER_MILE,
        duration_s=hours * 3600,
        road_lengths_m={"I-10": miles * METERS_PER_MILE, "US-90": 1000},
    )


class StubForecast:
    def __init__(self, wind):
        self.wind = wind

    def sample_at(self, when):
        return WeatherSample(self.wind, self.wind + 5, 0.0, 0.0, 60.0, 0)


class StubForecasts(dict):
    """Windy (50 mph) north of latitude 0.4, calm elsewhere."""

    def __missing__(self, cell):
        return StubForecast(50 if cell[0] >= 4 else 5)


@pytest.fixture(autouse=True)
def fake_services(monkeypatch):
    cache.clear()
    calls = {"routes": [], "weather": 0}

    def fake_routes(origin, destination, departure, gross_weight_lb):
        calls["routes"].append(gross_weight_lb)
        # Route A: fast but windy. Route B: slower and calm.
        return [straight_route(0.5, hours=5), straight_route(0.0, hours=6)]

    def fake_forecasts(points, until):
        calls["weather"] += 1
        return StubForecasts()

    monkeypatch.setattr(here_client, "fetch_truck_routes", fake_routes)
    monkeypatch.setattr(weather_client, "fetch_forecasts", fake_forecasts)
    return calls


@pytest.fixture
def client():
    return APIClient()


def trip_request(**overrides):
    body = {
        "origin": {"lat": 0.0, "lng": 0.0, "label": "Start"},
        "destination": {"lat": 0.0, "lng": 2.9, "label": "End"},
        "departure_time": (timezone.now() + timedelta(hours=1)).isoformat(),
        "load_lb": 35_000,
        "interval_mi": 25,
    }
    body.update(overrides)
    return body


def test_create_trip_recommends_the_calm_route(client, fake_services):
    response = client.post("/api/trips/", trip_request(), format="json")

    assert response.status_code == 201
    body = response.json()
    assert [r["id"] for r in body["routes"]] == ["A", "B"]
    assert body["recommendation"]["route_id"] == "B"
    assert body["recommendation"]["criterion"] == "no_travel_miles"
    # 50 mph wind with a 35,000 lb load is No Travel.
    windy = body["routes"][0]
    assert windy["miles_by_level"]["no_travel"] == pytest.approx(windy["distance_mi"], abs=0.2)
    assert windy["checkpoints"][1]["risk"]["load_rule"].startswith("Wind 50 mph")
    assert body["warnings"] == ["Only 2 reasonable route(s) were found for this trip."]


def test_route_and_checkpoint_shape(client):
    body = client.post("/api/trips/", trip_request(), format="json").json()
    route = body["routes"][1]
    checkpoint = route["checkpoints"][1]

    assert route["via"] == ["I-10", "US-90"]
    assert route["rank"] == 0
    assert checkpoint["mile"] == 25
    assert checkpoint["coverage_mi"] == [12.5, 37.5]
    assert checkpoint["position"][0] == pytest.approx(25 / 69.09, abs=0.01)  # [lng, lat]
    assert checkpoint["risk"]["level"] == "low"
    assert len(checkpoint["segment"]) >= 2
    assert sum(c["coverage_mi"][1] - c["coverage_mi"][0] for c in route["checkpoints"]) == pytest.approx(
        route["distance_mi"], abs=0.1
    )


def test_here_receives_load_plus_empty_truck_weight(client, fake_services):
    client.post("/api/trips/", trip_request(load_lb=20_000), format="json")

    assert fake_services["routes"] == [20_000 + trips.EMPTY_TRUCK_WEIGHT_LB]


def test_changing_interval_reuses_cached_routes(client, fake_services):
    trip_id = client.post("/api/trips/", trip_request(), format="json").json()["trip_id"]

    response = client.get(f"/api/trips/{trip_id}/", {"interval": 10})

    assert response.status_code == 200
    assert response.json()["interval_mi"] == 10
    assert response.json()["routes"][0]["checkpoints"][1]["mile"] == 10
    assert len(fake_services["routes"]) == 1


def test_unknown_trip_is_reported_as_expired(client):
    response = client.get("/api/trips/does-not-exist/")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "trip_expired"


@pytest.mark.parametrize(
    "overrides, field",
    [
        ({"departure_time": "2020-01-01T00:00:00Z"}, "departure_time"),
        ({"departure_time": (timezone.now() + timedelta(days=8)).isoformat()}, "departure_time"),
        ({"load_lb": 60_000}, "load_lb"),
        ({"load_lb": 0}, "load_lb"),
        ({"interval_mi": 15}, "interval_mi"),
        ({"destination": {"lat": 0.0, "lng": 0.0}}, "non_field_errors"),
    ],
)
def test_invalid_input(client, overrides, field):
    response = client.post("/api/trips/", trip_request(**overrides), format="json")

    assert response.status_code == 400
    error = response.json()["error"]
    assert error["code"] == "invalid_input"
    assert field in error["fields"]
    assert error["message"]


def test_departure_slightly_in_the_past_is_moved_to_now(client):
    before = timezone.now()
    body = trip_request(departure_time=(before - timedelta(minutes=2)).isoformat())

    response = client.post("/api/trips/", body, format="json")

    assert response.status_code == 201
    assert response.json()["departure_time"] >= before.replace(microsecond=0).isoformat()


def test_weather_failure_returns_503_without_partial_results(client, monkeypatch):
    def failing(points, until):
        raise WeatherUnavailable("Weather service is unavailable. Please try again.")

    monkeypatch.setattr(weather_client, "fetch_forecasts", failing)

    response = client.post("/api/trips/", trip_request(), format="json")

    assert response.status_code == 503
    assert response.json() == {
        "error": {"code": "weather_unavailable", "message": "Weather service is unavailable. Please try again."}
    }


def test_no_route_returns_422(client, monkeypatch):
    def no_route(*args):
        raise NoRouteFound("No truck route found between these locations.")

    monkeypatch.setattr(here_client, "fetch_truck_routes", no_route)

    response = client.post("/api/trips/", trip_request(), format="json")

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "no_route"


def test_suggest_requires_three_characters(client):
    response = client.get("/api/places/suggest/", {"q": "de"})

    assert response.status_code == 400


def test_suggest_results_are_cached(client, monkeypatch):
    calls = []

    def fake_suggest(query):
        calls.append(query)
        return [Place("Denver, CO, United States", (39.74, -104.99))]

    monkeypatch.setattr(here_client, "suggest_places", fake_suggest)

    first = client.get("/api/places/suggest/", {"q": "Denv"})
    client.get("/api/places/suggest/", {"q": "denv"})

    assert first.json() == {"results": [{"label": "Denver, CO, United States", "lat": 39.74, "lng": -104.99}]}
    assert calls == ["Denv"]


def test_heatmap_covers_49_hours_with_risk_for_the_load(client, fake_services):
    trip_id = client.post("/api/trips/", trip_request(), format="json").json()["trip_id"]

    response = client.get(f"/api/trips/{trip_id}/heatmap/")

    assert response.status_code == 200
    heatmap = response.json()
    assert len(heatmap["hours"]) == 49
    assert len(heatmap["points"]) == len(heatmap["risk"]) == len(heatmap["wind_mph"]) > 0
    assert all(len(series) == 49 for series in heatmap["risk"])
    # Windy cells (north of 0.4 lat) are No Travel for a 35,000 lb load; calm cells are Low.
    by_lat = {round(point[1], 1) >= 0.4: series[0] for point, series in zip(heatmap["points"], heatmap["risk"])}
    assert by_lat[True] == 4
    assert by_lat[False] == 0


def test_heatmap_is_cached_per_trip(client, fake_services):
    trip_id = client.post("/api/trips/", trip_request(), format="json").json()["trip_id"]
    weather_calls = fake_services["weather"]

    client.get(f"/api/trips/{trip_id}/heatmap/")
    client.get(f"/api/trips/{trip_id}/heatmap/")

    assert fake_services["weather"] == weather_calls + 1


def test_heatmap_for_unknown_trip(client):
    assert client.get("/api/trips/nope/heatmap/").status_code == 404


def test_weather_rate_limit_has_its_own_error_code(client, monkeypatch):
    def limited(points, until):
        raise WeatherRateLimited("Please try again in a minute.")

    monkeypatch.setattr(weather_client, "fetch_forecasts", limited)

    response = client.post("/api/trips/", trip_request(), format="json")

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "weather_rate_limited"
