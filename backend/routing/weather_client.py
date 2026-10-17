"""Hourly forecasts from Open-Meteo, snapped to a coarse grid and cached.

Points are snapped to a 0.1 degree grid (~5-7 miles, close to the forecast
models' own resolution) so nearby checkpoints, overlapping routes and repeat
searches share one forecast. Any failed batch fails the whole lookup: risk is
never computed from partial data.
"""

from __future__ import annotations

import math
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

import requests
from django.core.cache import cache

from .here_client import LatLng
from .risk import WeatherSample

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
GRID_DEG = 0.1
BATCH_SIZE = 100
MAX_WORKERS = 4
MAX_ATTEMPTS = 3
REQUEST_TIMEOUT_S = 30
CACHE_TTL_S = 45 * 60
HOURLY_VARIABLES = "wind_speed_10m,wind_gusts_10m,rain,showers,snowfall,temperature_2m,weather_code"

Cell = tuple[int, int]


class WeatherUnavailable(Exception):
    """Forecast data could not be obtained for every requested point."""


@dataclass(frozen=True)
class HourlyForecast:
    """Hourly series for one grid cell. `times` are unix seconds (UTC, on the hour)."""

    times: tuple[int, ...]
    wind_mph: tuple[float, ...]
    gust_mph: tuple[float, ...]
    rain_in: tuple[float, ...]  # rain + showers over the preceding hour
    snow_in: tuple[float, ...]  # snowfall over the preceding hour
    temperature_f: tuple[float, ...]
    weather_code: tuple[int, ...]

    def sample_at(self, when: datetime) -> WeatherSample:
        """Weather the truck meets at `when`.

        Precipitation values are totals for the hour ending at their
        timestamp, so we use the hour bucket that contains `when` (14:40 ->
        the 15:00 value). Wind, temperature and conditions are instantaneous,
        so we use the nearest hour.
        """
        ts = when.timestamp()
        bucket = self._index(math.ceil(ts / 3600) * 3600)
        nearest = self._index(round(ts / 3600) * 3600)
        return WeatherSample(
            wind_mph=self.wind_mph[nearest],
            gust_mph=self.gust_mph[nearest],
            rain_in_hr=self.rain_in[bucket],
            snow_in_hr=self.snow_in[bucket],
            temperature_f=self.temperature_f[nearest],
            weather_code=self.weather_code[nearest],
        )

    def _index(self, hour_ts: int) -> int:
        offset = (hour_ts - self.times[0]) // 3600
        if not 0 <= offset < len(self.times):
            raise WeatherUnavailable("Requested time is outside the forecast window.")
        return offset


def cell_of(point: LatLng) -> Cell:
    return (round(point[0] / GRID_DEG), round(point[1] / GRID_DEG))


def cell_center(cell: Cell) -> LatLng:
    return (round(cell[0] * GRID_DEG, 4), round(cell[1] * GRID_DEG, 4))


def fetch_forecasts(points: list[LatLng], until: datetime) -> dict[Cell, HourlyForecast]:
    """Forecasts covering now..`until` for every grid cell touched by `points`."""
    start_date = datetime.now(UTC).date()
    # One extra day so the last hour's "next hour" bucket is always present.
    end_date = (until.astimezone(UTC) + timedelta(hours=1)).date()
    window = (start_date, end_date)

    cells = sorted({cell_of(p) for p in points})
    forecasts: dict[Cell, HourlyForecast] = {}
    missing: list[Cell] = []
    cached = cache.get_many([_cache_key(c, window) for c in cells])
    for cell in cells:
        hit = cached.get(_cache_key(cell, window))
        if hit is None:
            missing.append(cell)
        else:
            forecasts[cell] = hit

    batches = [missing[i : i + BATCH_SIZE] for i in range(0, len(missing), BATCH_SIZE)]
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        for fetched in pool.map(lambda batch: _fetch_batch(batch, window), batches):
            forecasts.update(fetched)
            cache.set_many({_cache_key(c, window): f for c, f in fetched.items()}, CACHE_TTL_S)

    return forecasts


def _fetch_batch(cells: list[Cell], window: tuple[date, date]) -> dict[Cell, HourlyForecast]:
    centers = [cell_center(c) for c in cells]
    params = {
        "latitude": ",".join(f"{lat}" for lat, _ in centers),
        "longitude": ",".join(f"{lng}" for _, lng in centers),
        "hourly": HOURLY_VARIABLES,
        "wind_speed_unit": "mph",
        "precipitation_unit": "inch",
        "temperature_unit": "fahrenheit",
        "timezone": "GMT",
        "timeformat": "unixtime",
        "start_date": window[0].isoformat(),
        "end_date": window[1].isoformat(),
    }
    payload = _get_with_retry(params)
    results = payload if isinstance(payload, list) else [payload]
    if len(results) != len(cells):
        raise WeatherUnavailable("Weather service returned an incomplete response.")
    return {cell: _parse_forecast(result["hourly"]) for cell, result in zip(cells, results)}


def _get_with_retry(params: dict):
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            response = requests.get(FORECAST_URL, params=params, timeout=REQUEST_TIMEOUT_S)
            if response.status_code == 200:
                return response.json()
            retryable = response.status_code == 429 or response.status_code >= 500
            if not retryable:
                raise WeatherUnavailable(f"Weather service rejected the request ({response.status_code}).")
        except (requests.RequestException, ValueError):
            pass
        if attempt < MAX_ATTEMPTS:
            time.sleep(0.5 * 2 ** (attempt - 1))
    raise WeatherUnavailable("Weather service is unavailable. Please try again.")


def _parse_forecast(hourly: dict) -> HourlyForecast:
    def series(name: str) -> tuple[float, ...]:
        # Open-Meteo uses null for hours a model does not cover.
        values = hourly[name]
        if any(v is None for v in values):
            raise WeatherUnavailable(f"Weather data has gaps ({name}).")
        return tuple(values)

    rain = series("rain")
    showers = series("showers")
    return HourlyForecast(
        times=tuple(hourly["time"]),
        wind_mph=series("wind_speed_10m"),
        gust_mph=series("wind_gusts_10m"),
        rain_in=tuple(r + s for r, s in zip(rain, showers)),
        snow_in=series("snowfall"),
        temperature_f=series("temperature_2m"),
        weather_code=tuple(int(c) for c in series("weather_code")),
    )


def _cache_key(cell: Cell, window: tuple[date, date]) -> str:
    return f"wx:{cell[0]}:{cell[1]}:{window[0]:%Y%m%d}:{window[1]:%Y%m%d}"
