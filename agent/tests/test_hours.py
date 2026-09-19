import pytest

from italy_agent.hours import parse_daily_opening_hours, parse_itinerary_time


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("9:00-19:00", [(540, 1140)]),
        ("Daily 10:00-24:00", [(600, 1440)]),
        ("12:00-14:30, 19:00-22:30", [(720, 870), (1140, 1350)]),
        ("8am-7pm", [(480, 1140)]),
        ("9am-12:30pm", [(540, 750)]),
        ("12am-12pm", [(0, 720)]),
        ("8:00-01:00", [(0, 60), (480, 1440)]),
        ("19:00-00:00", [(1140, 1440)]),
        (" 9:00 – 19:00 ", [(540, 1140)]),
    ],
)
def test_supported_daily_hours(text, expected):
    assert parse_daily_opening_hours(text) == expected


@pytest.mark.parametrize(
    "text",
    [
        None,
        "",
        "Evenings",
        "Morning only",
        "Tues-Sun 9:00-19:00",
        "Mon-Sat 9:30-17:30, Sun 14:00-17:30",
        "9:00-19:00 summer only",
        "9:00-19:00, unknown",
        "9:00-19:00, 18:00-20:00",
        "9:00-9:00",
        "25:00-26:00",
        "9:60-19:00",
        "13am-7pm",
        "9-19",
        "24:00-01:00",
    ],
)
def test_ambiguous_or_invalid_hours_are_not_partially_parsed(text):
    assert parse_daily_opening_hours(text) is None


@pytest.mark.parametrize(("text", "minutes"), [("00:00", 0), ("09:05", 545), ("24:00", 1440)])
def test_itinerary_times(text, minutes):
    assert parse_itinerary_time(text) == minutes


@pytest.mark.parametrize("text", ["9:00", "noon", "12:60", "24:01", "25:00", "-1:00", " 09:00"])
def test_invalid_itinerary_times(text):
    with pytest.raises(ValueError):
        parse_itinerary_time(text)
