import pytest

from routing.recommend import recommend, summarize_route
from routing.risk import RiskLevel

L, M, H, S, NT = (
    RiskLevel.LOW,
    RiskLevel.MODERATE,
    RiskLevel.HIGH,
    RiskLevel.SEVERE,
    RiskLevel.NO_TRAVEL,
)
HOUR = 3600


def route(duration_h=10.0, **miles):
    """route(low=80, severe=20) -> a summarized route with those miles."""
    levels = {"low": L, "moderate": M, "high": H, "severe": S, "no_travel": NT}
    return summarize_route([(m, levels[name]) for name, m in miles.items()], duration_h * HOUR)


def test_summary_totals_and_mile_weighted_average():
    summary = summarize_route([(12.5, L), (25, S), (25, M), (25, L), (12.5, NT)], 3 * HOUR)

    assert summary.total_miles == pytest.approx(100)
    assert summary.miles(S) == pytest.approx(25)
    assert summary.miles(H) == 0
    # (25*3 + 25*1 + 12.5*4) / 100
    assert summary.average_risk == pytest.approx(1.5)


def test_no_travel_miles_outrank_severe_miles():
    # The assessment's list alone would pick A (0 Severe miles); A has a
    # No Travel stretch, so B must win.
    a = route(low=60, no_travel=40)
    b = route(low=90, severe=10)

    result = recommend([a, b])

    assert result.best_index == 1
    assert result.deciding_criterion == "no_travel_miles"
    assert result.reason == "Fewest No Travel miles (0 vs 40 mi on the next best route)"


def test_fewest_severe_miles_beats_faster_route():
    fast = route(duration_h=8, low=70, severe=30)
    safe = route(duration_h=11, low=90, severe=10)

    result = recommend([fast, safe])

    assert result.best_index == 1
    assert result.deciding_criterion == "severe_miles"


def test_high_miles_break_a_severe_tie():
    a = route(low=50, severe=10, high=40)
    b = route(low=80, severe=10, high=10)

    assert recommend([a, b]).deciding_criterion == "high_miles"
    assert recommend([a, b]).best_index == 1


def test_average_risk_breaks_a_severe_and_high_tie():
    a = route(low=40, moderate=60)
    b = route(low=90, moderate=10)

    result = recommend([a, b])

    assert result.best_index == 1
    assert result.deciding_criterion == "average_risk"


def test_travel_time_decides_when_risk_is_equal():
    slow = route(duration_h=12, low=100)
    fast = route(duration_h=10, low=100)

    result = recommend([slow, fast])

    assert result.best_index == 1
    assert result.deciding_criterion == "duration"
    assert result.reason == "Same weather risk as the alternatives, and the fastest (10h 00m vs 12h 00m)"


def test_floating_point_noise_does_not_decide():
    # 10.00001 vs 10.0 Severe miles is a tie; the faster route should win.
    a = route(duration_h=9, low=89.99999, severe=10.00001)
    b = route(duration_h=10, low=90, severe=10.0)

    result = recommend([a, b])

    assert result.best_index == 0
    assert result.deciding_criterion == "duration"


def test_ranking_orders_all_routes():
    a = route(low=50, severe=50)
    b = route(low=100)
    c = route(low=80, severe=20)

    assert recommend([a, b, c]).ranking == [1, 2, 0]


def test_all_routes_blocked_flag():
    a = route(low=90, no_travel=10)
    b = route(low=95, no_travel=5)

    result = recommend([a, b])

    assert result.all_routes_blocked
    assert result.best_index == 1


def test_not_blocked_when_one_route_is_clear():
    assert not recommend([route(low=90, no_travel=10), route(low=100)]).all_routes_blocked


def test_single_route():
    result = recommend([route(low=100)])

    assert result.best_index == 0
    assert result.deciding_criterion is None
    assert result.reason == "Only one route was found."


def test_identical_routes():
    result = recommend([route(low=100), route(low=100)])

    assert result.best_index == 0
    assert result.deciding_criterion is None


def test_requires_routes():
    with pytest.raises(ValueError):
        recommend([])
