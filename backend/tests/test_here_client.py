from datetime import UTC, datetime

import flexpolyline
import pytest
import responses

from routing.here_client import (
    ROUTES_URL,
    HereApiError,
    NoRouteFound,
    fetch_truck_routes,
    parse_route,
)

DEPARTURE = datetime(2026, 10, 20, 8, 0, tzinfo=UTC)


def section(points, spans, length=1000, duration=60):
    return {
        "polyline": flexpolyline.encode(points),
        "spans": spans,
        "summary": {"length": length, "duration": duration},
    }


@pytest.fixture(autouse=True)
def here_key(settings):
    settings.HERE_API_KEY = "test-key"


def test_parse_route_merges_sections_and_shifts_span_offsets():
    route = {
        "sections": [
            section([(0, 0), (0, 0.1), (0, 0.2)], [{"offset": 0, "length": 1000, "duration": 60}]),
            section(
                [(0, 0.2), (0, 0.3)],
                [{"offset": 0, "length": 500, "duration": 30, "routeNumbers": [{"value": "I-25"}]}],
                length=500,
                duration=30,
            ),
        ]
    }

    parsed = parse_route(route)

    assert parsed.coordinates == [(0, 0), (0, 0.1), (0, 0.2), (0, 0.3)]
    assert [s.offset for s in parsed.spans] == [0, 2]
    assert parsed.length_m == 1500
    assert parsed.duration_s == 90
    assert parsed.road_lengths_m == {"I-25": 500}


@responses.activate
def test_fetch_sends_truck_parameters_in_kg():
    responses.get(
        ROUTES_URL,
        json={"routes": [{"sections": [section([(0, 0), (0, 0.1)], [{"offset": 0, "length": 1000, "duration": 60}])]}]},
    )

    routes = fetch_truck_routes((32.7, -96.8), (39.7, -105.0), DEPARTURE, gross_weight_lb=75_000)

    assert len(routes) == 1
    params = responses.calls[0].request.params
    assert params["transportMode"] == "truck"
    assert params["alternatives"] == "2"
    assert params["vehicle[grossWeight]"] == "34019"
    assert params["departureTime"] == "2026-10-20T08:00:00+00:00"


@responses.activate
def test_http_error_message_does_not_leak_api_key():
    responses.get(ROUTES_URL, status=401, json={"title": "Unauthorized"})

    with pytest.raises(HereApiError) as exc_info:
        fetch_truck_routes((0, 0), (1, 1), DEPARTURE, 50_000)

    assert "Unauthorized" in str(exc_info.value)
    assert "test-key" not in str(exc_info.value)


@responses.activate
def test_empty_route_list_raises_no_route_found():
    responses.get(ROUTES_URL, json={"routes": []})

    with pytest.raises(NoRouteFound):
        fetch_truck_routes((0, 0), (1, 1), DEPARTURE, 50_000)


def test_missing_api_key_is_reported(settings):
    settings.HERE_API_KEY = ""

    with pytest.raises(HereApiError, match="not configured"):
        fetch_truck_routes((0, 0), (1, 1), DEPARTURE, 50_000)
