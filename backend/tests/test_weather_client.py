from datetime import UTC, datetime, timedelta

import pytest
import responses
from django.core.cache import cache

from routing import weather_client
from routing.weather_client import (
    FORECAST_URL,
    HourlyForecast,
    WeatherRateLimited,
    WeatherUnavailable,
    cell_center,
    cell_of,
    fetch_forecasts,
)

T0 = datetime(2026, 10, 20, 0, 0, tzinfo=UTC)


def hourly_payload(hours=48, wind=10.0, rain=0.0, showers=0.0, snow=0.0):
    start = int(T0.timestamp())
    return {
        "hourly": {
            "time": [start + 3600 * i for i in range(hours)],
            "wind_speed_10m": [wind] * hours,
            "wind_gusts_10m": [wind + 5] * hours,
            "rain": [rain] * hours,
            "showers": [showers] * hours,
            "snowfall": [snow] * hours,
            "temperature_2m": [40.0] * hours,
            "weather_code": [3] * hours,
        }
    }


def forecast_with_hourly_index_values() -> HourlyForecast:
    """Each series value equals its hour index, so lookups are easy to read."""
    hours = range(6)
    return HourlyForecast(
        times=tuple(int((T0 + timedelta(hours=h)).timestamp()) for h in hours),
        wind_mph=tuple(float(h) for h in hours),
        gust_mph=tuple(float(h) for h in hours),
        rain_in=tuple(float(h) for h in hours),
        snow_in=tuple(float(h) for h in hours),
        temperature_f=tuple(float(h) for h in hours),
        weather_code=tuple(h for h in hours),
    )


@pytest.fixture(autouse=True)
def clean_cache_and_no_sleep(monkeypatch):
    cache.clear()
    monkeypatch.setattr(weather_client.time, "sleep", lambda _: None)


def test_precipitation_uses_hour_bucket_and_wind_uses_nearest_hour():
    forecast = forecast_with_hourly_index_values()

    # 02:40 -> precipitation from the 02:00-03:00 bucket (value at 03:00),
    # wind from the nearest hour (03:00).
    early = forecast.sample_at(T0 + timedelta(hours=2, minutes=40))
    assert (early.rain_in_hr, early.wind_mph) == (3, 3)

    # 02:10 -> still the 03:00 precipitation bucket, but wind from 02:00.
    late = forecast.sample_at(T0 + timedelta(hours=2, minutes=10))
    assert (late.rain_in_hr, late.wind_mph) == (3, 2)


def test_sample_outside_window_is_an_error():
    with pytest.raises(WeatherUnavailable):
        forecast_with_hourly_index_values().sample_at(T0 + timedelta(hours=10))


def test_nearby_points_share_a_grid_cell():
    assert cell_of((39.7392, -104.9903)) == cell_of((39.7101, -104.9701))
    assert cell_center(cell_of((39.7392, -104.9903))) == (39.7, -105.0)


@responses.activate
def test_rain_includes_showers_and_cells_are_deduplicated():
    responses.get(FORECAST_URL, json=[hourly_payload(rain=0.1, showers=0.3), hourly_payload()])

    points = [(39.74, -104.99), (39.71, -104.97), (40.5, -105.0)]
    forecasts = fetch_forecasts(points, until=T0 + timedelta(hours=10))

    assert len(responses.calls) == 1
    assert len(forecasts) == 2
    params = responses.calls[0].request.params
    assert params["latitude"].count(",") == 1
    first = forecasts[cell_of(points[0])]
    assert first.rain_in[0] == pytest.approx(0.4)


@responses.activate
def test_cached_cells_are_not_requested_again():
    responses.get(FORECAST_URL, json=[hourly_payload()])
    point = [(39.74, -104.99)]

    fetch_forecasts(point, until=T0 + timedelta(hours=5))
    fetch_forecasts(point, until=T0 + timedelta(hours=5))

    assert len(responses.calls) == 1


@responses.activate
def test_server_errors_are_retried_then_succeed():
    responses.get(FORECAST_URL, status=503)
    responses.get(FORECAST_URL, json=[hourly_payload()])

    forecasts = fetch_forecasts([(39.74, -104.99)], until=T0 + timedelta(hours=5))

    assert len(forecasts) == 1
    assert len(responses.calls) == 2


@responses.activate
def test_persistent_failure_raises_instead_of_returning_partial_data():
    responses.get(FORECAST_URL, status=503)

    with pytest.raises(WeatherUnavailable):
        fetch_forecasts([(39.74, -104.99)], until=T0 + timedelta(hours=5))

    assert len(responses.calls) == weather_client.MAX_ATTEMPTS


@responses.activate
def test_client_errors_are_not_retried():
    responses.get(FORECAST_URL, status=400, json={"reason": "bad"})

    with pytest.raises(WeatherUnavailable):
        fetch_forecasts([(39.74, -104.99)], until=T0 + timedelta(hours=5))

    assert len(responses.calls) == 1


@responses.activate
def test_gaps_in_data_are_rejected():
    payload = hourly_payload()
    payload["hourly"]["wind_speed_10m"][3] = None
    responses.get(FORECAST_URL, json=[payload])

    with pytest.raises(WeatherUnavailable):
        fetch_forecasts([(39.74, -104.99)], until=T0 + timedelta(hours=5))


@responses.activate
def test_incomplete_batch_response_is_rejected():
    responses.get(FORECAST_URL, json=[hourly_payload()])

    with pytest.raises(WeatherUnavailable):
        fetch_forecasts([(39.74, -104.99), (45.0, -100.0)], until=T0 + timedelta(hours=5))


@responses.activate
def test_rate_limit_is_reported_without_retrying():
    responses.get(FORECAST_URL, status=429, json={"reason": "Minutely API request limit exceeded."})

    with pytest.raises(WeatherRateLimited, match="try again in a minute"):
        fetch_forecasts([(39.74, -104.99)], until=T0 + timedelta(hours=5))

    assert len(responses.calls) == 1
