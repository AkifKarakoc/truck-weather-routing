"""Distance/time bookkeeping along a route polyline and checkpoint placement.

A route is turned into a `RouteProfile`: for every polyline point we know how
many miles and seconds into the trip it is. Checkpoints are then placed at
fixed mile intervals and their ETA is interpolated from that profile, so ETAs
reflect HERE's per-span travel times (highway vs. city) rather than an
average speed.
"""

from __future__ import annotations

import math
from bisect import bisect_right
from dataclasses import dataclass
from datetime import datetime, timedelta

from .here_client import HereRoute, LatLng, Span

METERS_PER_MILE = 1609.344
EARTH_RADIUS_MI = 3958.7613


@dataclass(frozen=True)
class RouteProfile:
    coordinates: list[LatLng]
    cum_miles: list[float]
    cum_seconds: list[float]

    @property
    def total_miles(self) -> float:
        return self.cum_miles[-1]

    @property
    def total_seconds(self) -> float:
        return self.cum_seconds[-1]


@dataclass(frozen=True)
class Checkpoint:
    index: int
    mile: float
    position: LatLng
    elapsed_s: float
    eta: datetime
    # The stretch of road this checkpoint's weather stands for (midpoint rule).
    coverage_start_mi: float
    coverage_end_mi: float

    @property
    def coverage_miles(self) -> float:
        return self.coverage_end_mi - self.coverage_start_mi


def haversine_miles(a: LatLng, b: LatLng) -> float:
    lat1, lng1, lat2, lng2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    return 2 * EARTH_RADIUS_MI * math.asin(math.sqrt(h))


def build_profile(route: HereRoute) -> RouteProfile:
    coords = route.coordinates
    step_miles = [0.0] + [haversine_miles(coords[i - 1], coords[i]) for i in range(1, len(coords))]

    # Straight-line steps slightly undercount the road; scale so the last
    # point lands exactly on HERE's reported route length.
    measured = sum(step_miles)
    scale = (route.length_m / METERS_PER_MILE) / measured if measured > 0 else 1.0
    cum_miles = _accumulate(step * scale for step in step_miles)

    step_seconds = _distribute_span_durations(step_miles, route.spans, route.duration_s)
    cum_seconds = _accumulate(step_seconds)

    return RouteProfile(coordinates=coords, cum_miles=cum_miles, cum_seconds=cum_seconds)


def place_checkpoints(profile: RouteProfile, interval_miles: float, departure: datetime) -> list[Checkpoint]:
    """Checkpoints at 0, interval, 2*interval, ... and at the destination."""
    if interval_miles <= 0:
        raise ValueError("interval_miles must be positive")

    total = profile.total_miles
    count = math.ceil(total / interval_miles) if total > 0 else 0
    miles = [i * interval_miles for i in range(count)] + [total]

    checkpoints = []
    for i, mile in enumerate(miles):
        position, elapsed = _interpolate(profile, mile)
        start = 0.0 if i == 0 else (miles[i - 1] + mile) / 2
        end = total if i == len(miles) - 1 else (mile + miles[i + 1]) / 2
        checkpoints.append(
            Checkpoint(
                index=i,
                mile=mile,
                position=position,
                elapsed_s=elapsed,
                eta=departure + timedelta(seconds=elapsed),
                coverage_start_mi=start,
                coverage_end_mi=end,
            )
        )
    return checkpoints


def position_at_mile(profile: RouteProfile, mile: float) -> LatLng:
    return _interpolate(profile, mile)[0]


def _distribute_span_durations(step_miles: list[float], spans: list[Span], total_duration_s: float) -> list[float]:
    """Spread each span's duration over its polyline steps, by distance.

    Span k covers points spans[k].offset .. spans[k+1].offset. Step i is the
    hop from point i-1 to point i, so it belongs to the span containing i-1.
    """
    n = len(step_miles)
    if not spans:
        spans = [Span(offset=0, length_m=0, duration_s=total_duration_s)]

    seconds = [0.0] * n
    for k, span in enumerate(spans):
        first_step = span.offset + 1
        last_step = spans[k + 1].offset if k + 1 < len(spans) else n - 1
        steps = range(first_step, last_step + 1)
        span_miles = sum(step_miles[i] for i in steps)
        for i in steps:
            if span_miles > 0:
                seconds[i] = span.duration_s * step_miles[i] / span_miles
            elif i == last_step:
                seconds[i] = span.duration_s
    return seconds


def _interpolate(profile: RouteProfile, mile: float) -> tuple[LatLng, float]:
    cum = profile.cum_miles
    mile = min(max(mile, 0.0), cum[-1])
    hi = min(bisect_right(cum, mile), len(cum) - 1)
    lo = max(hi - 1, 0)
    span = cum[hi] - cum[lo]
    t = (mile - cum[lo]) / span if span > 0 else 0.0

    (lat1, lng1), (lat2, lng2) = profile.coordinates[lo], profile.coordinates[hi]
    position = (lat1 + (lat2 - lat1) * t, lng1 + (lng2 - lng1) * t)
    elapsed = profile.cum_seconds[lo] + (profile.cum_seconds[hi] - profile.cum_seconds[lo]) * t
    return position, elapsed


def _accumulate(values) -> list[float]:
    total, out = 0.0, []
    for value in values:
        total += value
        out.append(total)
    return out


def simplify(coords: list[LatLng], tolerance_deg: float) -> list[int]:
    """Indexes of points kept by Ramer-Douglas-Peucker simplification.

    Route polylines have thousands of points; the map needs far fewer.
    Distances are planar in degrees, which is fine at this tolerance.
    """
    if len(coords) < 3:
        return list(range(len(coords)))

    keep = {0, len(coords) - 1}
    stack = [(0, len(coords) - 1)]
    while stack:
        first, last = stack.pop()
        worst_index, worst_distance = -1, tolerance_deg
        for i in range(first + 1, last):
            distance = _distance_to_segment(coords[i], coords[first], coords[last])
            if distance > worst_distance:
                worst_index, worst_distance = i, distance
        if worst_index != -1:
            keep.add(worst_index)
            stack.extend([(first, worst_index), (worst_index, last)])
    return sorted(keep)


def slice_line(profile: RouteProfile, kept: list[int], start_mi: float, end_mi: float) -> list[LatLng]:
    """The part of the route between two mile marks, using the kept points."""
    inner = [profile.coordinates[i] for i in kept if start_mi < profile.cum_miles[i] < end_mi]
    return [position_at_mile(profile, start_mi), *inner, position_at_mile(profile, end_mi)]


def _distance_to_segment(p: LatLng, a: LatLng, b: LatLng) -> float:
    (py, px), (ay, ax), (by, bx) = p, a, b
    dx, dy = bx - ax, by - ay
    length_sq = dx * dx + dy * dy
    if length_sq == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / length_sq))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))
