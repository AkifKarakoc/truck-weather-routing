from datetime import UTC, datetime, timedelta

import pytest

from routing.geometry import (
    METERS_PER_MILE,
    build_profile,
    haversine_miles,
    place_checkpoints,
    position_at_mile,
    simplify,
    slice_line,
)
from routing.here_client import HereRoute, Span

DEPARTURE = datetime(2026, 10, 20, 8, 0, tzinfo=UTC)


def straight_route(num_points: int, spans: list[Span], length_miles: float | None = None) -> HereRoute:
    """Points along the equator, evenly spaced 0.1 degrees apart (~6.9 mi)."""
    coords = [(0.0, i * 0.1) for i in range(num_points)]
    measured = haversine_miles(coords[0], coords[-1])
    length_mi = length_miles if length_miles is not None else measured
    return HereRoute(
        coordinates=coords,
        spans=spans,
        length_m=length_mi * METERS_PER_MILE,
        duration_s=sum(s.duration_s for s in spans),
    )


def test_haversine_one_degree_at_equator():
    assert haversine_miles((0, 0), (0, 1)) == pytest.approx(69.09, abs=0.05)


def test_profile_scales_distance_to_reported_length():
    route = straight_route(11, [Span(0, 0, 3600)], length_miles=100)

    profile = build_profile(route)

    assert profile.total_miles == pytest.approx(100)
    assert profile.cum_miles[5] == pytest.approx(50)


def test_eta_follows_span_speeds_not_average_speed():
    # First half driven in 1 hour, second half in 3 hours.
    route = straight_route(11, [Span(0, 0, 3600), Span(5, 0, 3 * 3600)], length_miles=100)

    profile = build_profile(route)

    assert profile.total_seconds == pytest.approx(4 * 3600)
    assert profile.cum_seconds[5] == pytest.approx(3600)
    # Mile 75 is midway through the slow half: 1h + 1.5h.
    checkpoint_75 = place_checkpoints(profile, 25, DEPARTURE)[3]
    assert checkpoint_75.mile == pytest.approx(75)
    assert checkpoint_75.elapsed_s == pytest.approx(2.5 * 3600)


def test_checkpoints_every_interval_plus_destination():
    route = straight_route(11, [Span(0, 0, 3600)], length_miles=100)

    checkpoints = place_checkpoints(build_profile(route), 25, DEPARTURE)

    assert [c.mile for c in checkpoints] == pytest.approx([0, 25, 50, 75, 100])
    assert checkpoints[2].eta == DEPARTURE + timedelta(minutes=30)
    assert checkpoints[-1].eta == DEPARTURE + timedelta(hours=1)


def test_last_checkpoint_gap_can_be_shorter_than_interval():
    route = straight_route(11, [Span(0, 0, 3600)], length_miles=110)

    checkpoints = place_checkpoints(build_profile(route), 50, DEPARTURE)

    assert [c.mile for c in checkpoints] == pytest.approx([0, 50, 100, 110])


def test_coverage_uses_midpoints_and_sums_to_route_length():
    route = straight_route(11, [Span(0, 0, 3600)], length_miles=100)

    checkpoints = place_checkpoints(build_profile(route), 25, DEPARTURE)

    assert [c.coverage_miles for c in checkpoints] == pytest.approx([12.5, 25, 25, 25, 12.5])
    assert checkpoints[2].coverage_start_mi == pytest.approx(37.5)
    assert checkpoints[2].coverage_end_mi == pytest.approx(62.5)
    assert sum(c.coverage_miles for c in checkpoints) == pytest.approx(100)


@pytest.mark.parametrize("interval", [10, 25, 50])
def test_coverage_total_is_independent_of_interval(interval):
    route = straight_route(40, [Span(0, 0, 7200)], length_miles=271.3)

    checkpoints = place_checkpoints(build_profile(route), interval, DEPARTURE)

    assert sum(c.coverage_miles for c in checkpoints) == pytest.approx(271.3)


def test_checkpoint_positions_are_interpolated_between_points():
    route = straight_route(3, [Span(0, 0, 600)])
    profile = build_profile(route)

    lat, lng = position_at_mile(profile, profile.total_miles / 4)

    assert lat == pytest.approx(0)
    assert lng == pytest.approx(0.05)


def test_missing_spans_fall_back_to_distance_proportional_time():
    route = straight_route(11, [], length_miles=100)
    route.duration_s = 7200

    profile = build_profile(route)

    assert profile.cum_seconds[5] == pytest.approx(3600)
    assert profile.total_seconds == pytest.approx(7200)


def test_duplicate_points_do_not_break_interpolation():
    route = HereRoute(
        coordinates=[(0, 0), (0, 0), (0, 0.1), (0, 0.2)],
        spans=[Span(0, 0, 600)],
        length_m=haversine_miles((0, 0), (0, 0.2)) * METERS_PER_MILE,
        duration_s=600,
    )

    checkpoints = place_checkpoints(build_profile(route), 5, DEPARTURE)

    assert checkpoints[0].position == (0, 0)
    assert checkpoints[-1].elapsed_s == pytest.approx(600)


def test_rejects_non_positive_interval():
    route = straight_route(3, [Span(0, 0, 600)])

    with pytest.raises(ValueError):
        place_checkpoints(build_profile(route), 0, DEPARTURE)


def test_simplify_drops_collinear_points_and_keeps_corners():
    coords = [(0, 0), (0, 0.1), (0, 0.2), (0.1, 0.2), (0.2, 0.2)]

    assert simplify(coords, tolerance_deg=0.001) == [0, 2, 4]


def test_simplify_keeps_short_lines():
    assert simplify([(0, 0), (1, 1)], 0.1) == [0, 1]


def test_slice_line_starts_and_ends_on_mile_marks():
    route = straight_route(11, [Span(0, 0, 3600)], length_miles=100)
    profile = build_profile(route)
    kept = list(range(11))

    line = slice_line(profile, kept, 25, 45)

    assert line[0][1] == pytest.approx(0.25)
    assert [p[1] for p in line[1:-1]] == pytest.approx([0.3, 0.4])
    assert line[-1][1] == pytest.approx(0.45)
