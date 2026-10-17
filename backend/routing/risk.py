"""Weather risk classification from the assessment's risk and load rules.

Pure functions only: no I/O, no Django. Boundary conventions (documented in
the README):
- Ranges include their lower bound: 25 mph is Moderate, 0.25 in/hr is High.
- Rain and snow "No Travel" are strictly greater than 1.00 / 3.0, so exactly
  1.00 in/hr rain or 3.0 in/hr snow is Severe. Wind "No Travel" is >= 55 mph.
- A checkpoint takes the worst level across wind, rain and snow.
- Load rules can only raise the wind level, never lower it.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import IntEnum


class RiskLevel(IntEnum):
    LOW = 0
    MODERATE = 1
    HIGH = 2
    SEVERE = 3
    NO_TRAVEL = 4

    @property
    def label(self) -> str:
        return self.name.replace("_", " ").title()


@dataclass(frozen=True)
class WeatherSample:
    wind_mph: float
    gust_mph: float
    rain_in_hr: float
    snow_in_hr: float
    temperature_f: float
    weather_code: int


@dataclass(frozen=True)
class Thresholds:
    """Lower bounds of Moderate, High, Severe and No Travel."""

    moderate: float
    high: float
    severe: float
    no_travel: float
    no_travel_inclusive: bool


WIND_MPH = Thresholds(25, 35, 45, 55, no_travel_inclusive=True)
RAIN_IN_HR = Thresholds(0.10, 0.25, 0.50, 1.00, no_travel_inclusive=False)
SNOW_IN_HR = Thresholds(0.5, 1.0, 2.0, 3.0, no_travel_inclusive=False)

# Load rules (wind band + load above limit -> minimum level).
LOAD_RULES = (
    # (min wind mph, max wind mph exclusive, load limit lb, resulting level)
    (45, 55, 30_000, RiskLevel.NO_TRAVEL),
    (35, 45, 40_000, RiskLevel.SEVERE),
)


@dataclass(frozen=True)
class RiskAssessment:
    level: RiskLevel
    wind: RiskLevel
    rain: RiskLevel
    snow: RiskLevel
    # Condition that set the level: "wind", "rain", "snow", or None when Low.
    governing: str | None
    # Human-readable note when a load rule raised the level.
    load_rule: str | None


def classify(value: float, thresholds: Thresholds) -> RiskLevel:
    no_travel = value >= thresholds.no_travel if thresholds.no_travel_inclusive else value > thresholds.no_travel
    if no_travel:
        return RiskLevel.NO_TRAVEL
    if value >= thresholds.severe:
        return RiskLevel.SEVERE
    if value >= thresholds.high:
        return RiskLevel.HIGH
    if value >= thresholds.moderate:
        return RiskLevel.MODERATE
    return RiskLevel.LOW


def apply_load_rules(wind_mph: float, wind_level: RiskLevel, load_lb: float) -> tuple[RiskLevel, str | None]:
    for low, high, limit, level in LOAD_RULES:
        if low <= wind_mph < high and load_lb > limit and level > wind_level:
            note = f"Wind {wind_mph:.0f} mph with load over {limit:,} lb → {level.label}"
            return level, note
    return wind_level, None


def assess(sample: WeatherSample, load_lb: float) -> RiskAssessment:
    wind, load_rule = apply_load_rules(sample.wind_mph, classify(sample.wind_mph, WIND_MPH), load_lb)
    rain = classify(sample.rain_in_hr, RAIN_IN_HR)
    snow = classify(sample.snow_in_hr, SNOW_IN_HR)

    levels = {"wind": wind, "snow": snow, "rain": rain}
    worst = max(levels.values())
    # Ties go to the first condition in the dict order above.
    governing = next(name for name, level in levels.items() if level == worst) if worst > RiskLevel.LOW else None

    return RiskAssessment(level=worst, wind=wind, rain=rain, snow=snow, governing=governing, load_rule=load_rule)
