"""Route summaries and the route recommendation.

Pure functions only. Routes are ranked by, in order:
1. fewest No Travel miles (added: the assessment's list omits No Travel,
   which would otherwise let a route with No Travel stretches win)
2. fewest Severe miles
3. fewest High miles
4. lowest mile-weighted average risk (Low=0 ... No Travel=4)
5. shortest travel time
"""

from __future__ import annotations

from collections.abc import Callable, Iterable
from dataclasses import dataclass

from .risk import RiskLevel

# Values are rounded before comparing, so floating-point noise in checkpoint
# coverage never decides a recommendation.
MILE_DIGITS = 1
AVERAGE_DIGITS = 3


@dataclass(frozen=True)
class RouteRisk:
    miles_by_level: dict[RiskLevel, float]
    average_risk: float
    duration_s: float

    @property
    def total_miles(self) -> float:
        return sum(self.miles_by_level.values())

    def miles(self, level: RiskLevel) -> float:
        return self.miles_by_level.get(level, 0.0)


@dataclass(frozen=True)
class Recommendation:
    best_index: int
    # Route indexes from best to worst.
    ranking: list[int]
    # Which criterion separated the best route from the runner-up.
    deciding_criterion: str | None
    reason: str
    # True when every route crosses at least one No Travel stretch.
    all_routes_blocked: bool


def summarize_route(segments: Iterable[tuple[float, RiskLevel]], duration_s: float) -> RouteRisk:
    """`segments` are (miles, level) pairs, e.g. checkpoint coverage and risk."""
    miles_by_level = {level: 0.0 for level in RiskLevel}
    for miles, level in segments:
        miles_by_level[level] += miles

    total = sum(miles_by_level.values())
    weighted = sum(miles * level.value for level, miles in miles_by_level.items())
    average = weighted / total if total > 0 else 0.0
    return RouteRisk(miles_by_level=miles_by_level, average_risk=average, duration_s=duration_s)


@dataclass(frozen=True)
class _Criterion:
    key: str
    measure: Callable[[RouteRisk], float]
    digits: int
    describe: Callable[[float, float], str]

    def value(self, route: RouteRisk) -> float:
        return round(self.measure(route), self.digits)


CRITERIA = (
    _Criterion(
        "no_travel_miles",
        lambda r: r.miles(RiskLevel.NO_TRAVEL),
        MILE_DIGITS,
        lambda a, b: f"Fewest No Travel miles ({_miles(a)} vs {_miles(b)} mi on the next best route)",
    ),
    _Criterion(
        "severe_miles",
        lambda r: r.miles(RiskLevel.SEVERE),
        MILE_DIGITS,
        lambda a, b: f"Fewest Severe miles ({_miles(a)} vs {_miles(b)} mi on the next best route)",
    ),
    _Criterion(
        "high_miles",
        lambda r: r.miles(RiskLevel.HIGH),
        MILE_DIGITS,
        lambda a, b: f"Fewest High-risk miles ({_miles(a)} vs {_miles(b)} mi on the next best route)",
    ),
    _Criterion(
        "average_risk",
        lambda r: r.average_risk,
        AVERAGE_DIGITS,
        lambda a, b: f"Lowest average risk ({a:.2f} vs {b:.2f} on the next best route)",
    ),
    _Criterion(
        "duration",
        lambda r: r.duration_s,
        0,
        lambda a, b: f"Same weather risk as the alternatives, and the fastest ({_hours(a)} vs {_hours(b)})",
    ),
)


def recommend(routes: list[RouteRisk]) -> Recommendation:
    if not routes:
        raise ValueError("At least one route is required.")

    ranking = sorted(range(len(routes)), key=lambda i: _sort_key(routes[i]))
    blocked = all(r.miles(RiskLevel.NO_TRAVEL) > 0 for r in routes)

    if len(routes) == 1:
        return Recommendation(0, ranking, None, "Only one route was found.", blocked)

    best, runner_up = routes[ranking[0]], routes[ranking[1]]
    for criterion in CRITERIA:
        a, b = criterion.value(best), criterion.value(runner_up)
        if a < b:
            return Recommendation(ranking[0], ranking, criterion.key, criterion.describe(a, b), blocked)

    return Recommendation(ranking[0], ranking, None, "All routes have the same risk and travel time.", blocked)


def _sort_key(route: RouteRisk) -> tuple[float, ...]:
    return tuple(criterion.value(route) for criterion in CRITERIA)


def _miles(value: float) -> str:
    return f"{value:.0f}" if value >= 10 or value == 0 else f"{value:.1f}"


def _hours(seconds: float) -> str:
    minutes = round(seconds / 60)
    return f"{minutes // 60}h {minutes % 60:02d}m"
