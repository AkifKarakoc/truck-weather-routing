import pytest

from routing.risk import (
    RAIN_IN_HR,
    SNOW_IN_HR,
    WIND_MPH,
    RiskLevel,
    WeatherSample,
    assess,
    classify,
)

L, M, H, S, NT = (
    RiskLevel.LOW,
    RiskLevel.MODERATE,
    RiskLevel.HIGH,
    RiskLevel.SEVERE,
    RiskLevel.NO_TRAVEL,
)


def sample(wind=0.0, rain=0.0, snow=0.0):
    return WeatherSample(wind_mph=wind, gust_mph=wind, rain_in_hr=rain, snow_in_hr=snow, temperature_f=50, weather_code=0)


@pytest.mark.parametrize(
    "mph, expected",
    [(0, L), (24.9, L), (25, M), (34.9, M), (35, H), (44.9, H), (45, S), (54.9, S), (55, NT), (80, NT)],
)
def test_wind_thresholds(mph, expected):
    assert classify(mph, WIND_MPH) == expected


@pytest.mark.parametrize(
    "inches, expected",
    [(0, L), (0.09, L), (0.10, M), (0.24, M), (0.25, H), (0.49, H), (0.50, S), (1.00, S), (1.01, NT)],
)
def test_rain_thresholds(inches, expected):
    assert classify(inches, RAIN_IN_HR) == expected


@pytest.mark.parametrize(
    "inches, expected",
    [(0, L), (0.49, L), (0.5, M), (0.99, M), (1.0, H), (1.99, H), (2.0, S), (3.0, S), (3.01, NT)],
)
def test_snow_thresholds(inches, expected):
    assert classify(inches, SNOW_IN_HR) == expected


def test_worst_condition_wins_and_is_reported():
    result = assess(sample(wind=30, rain=0.6, snow=1.2), load_lb=10_000)

    assert (result.wind, result.rain, result.snow) == (M, S, H)
    assert result.level == S
    assert result.governing == "rain"


def test_calm_weather_has_no_governing_condition():
    result = assess(sample(), load_lb=45_000)

    assert result.level == L
    assert result.governing is None
    assert result.load_rule is None


@pytest.mark.parametrize("load", [0, 30_000, 45_000])
def test_55_mph_is_no_travel_for_any_load(load):
    assert assess(sample(wind=55), load).level == NT


@pytest.mark.parametrize(
    "wind, load, expected, rule_applied",
    [
        (45, 30_001, NT, True),
        (54.9, 45_000, NT, True),
        (45, 30_000, S, False),  # exactly 30,000 lb is not "> 30,000"
        (50, 20_000, S, False),
        (35, 40_001, S, True),
        (44.9, 45_000, S, True),
        (35, 40_000, H, False),  # exactly 40,000 lb is not "> 40,000"
        (40, 35_000, H, False),
        (34.9, 45_000, M, False),  # below the 35-44 band
    ],
)
def test_load_rules(wind, load, expected, rule_applied):
    result = assess(sample(wind=wind), load)

    assert result.level == expected
    assert (result.load_rule is not None) == rule_applied


def test_load_rule_never_lowers_a_worse_condition():
    result = assess(sample(wind=38, snow=3.5), load_lb=42_000)

    assert result.wind == S
    assert result.level == NT
    assert result.governing == "snow"


def test_load_rule_note_mentions_wind_and_limit():
    note = assess(sample(wind=38), load_lb=42_000).load_rule

    assert note == "Wind 38 mph with load over 40,000 lb → Severe"


def test_level_labels():
    assert [level.label for level in RiskLevel] == ["Low", "Moderate", "High", "Severe", "No Travel"]
