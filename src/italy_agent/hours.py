"""Conservative parsing of the daily hour formats present in the dataset."""

import re


def parse_itinerary_time(value: str) -> int:
    """Parse local HH:MM into minutes, including 24:00 as an end-of-day boundary."""
    if value == "24:00":
        return 1440
    if not re.fullmatch(r"(?:[01][0-9]|2[0-3]):[0-5][0-9]", value):
        raise ValueError(f"Invalid time {value!r}; use HH:MM (24:00 only for an end)")
    hour, minute = value.split(":")
    return int(hour) * 60 + int(minute)


def parse_visit_interval(start_time: str | None, end_time: str | None) -> tuple[int, int] | None:
    """Return a same-day interval, or None for an incomplete schedule.

    Supplied times are validated even when the other endpoint is missing.
    Invalid times or reversed/empty intervals raise ValueError.
    """
    start = parse_itinerary_time(start_time) if start_time is not None else None
    if start == 1440:
        raise ValueError("24:00 is only allowed as an end time")
    end = parse_itinerary_time(end_time) if end_time is not None else None
    if start is None or end is None:
        return None
    if end <= start:
        raise ValueError("Visit end must be after its start on the same day")
    return start, end


def parse_opening_time(value: str) -> int:
    """Parse source times such as 9:00, 24:00, 8am, or 12:30pm."""
    match = re.fullmatch(r"(\d{1,2})(?::([0-5][0-9]))?(am|pm)?", value)
    if match is None:
        raise ValueError(f"Unrecognized opening time: {value}")
    hour = int(match[1])
    minute = int(match[2] or 0)
    meridiem = match[3]
    if meridiem:
        if not 1 <= hour <= 12:
            raise ValueError(f"Invalid 12-hour time: {value}")
        return (hour % 12 + (12 if meridiem == "pm" else 0)) * 60 + minute
    if match[2] is None or hour > 24 or (hour == 24 and minute != 0):
        raise ValueError(f"Invalid 24-hour time: {value}")
    return hour * 60 + minute


def parse_daily_opening_hours(hours: str | None) -> list[tuple[int, int]] | None:
    """Return open intervals within a day, or None when hours are uncertain.

    Supports daily 24-hour/AM-PM ranges and comma-separated split sessions.
    Overnight ranges split at midnight. Weekday, seasonal, or descriptive text
    is not interpreted without dates. Equal endpoints are ambiguous, not 24/7.
    Overlapping source intervals are treated as inconsistent. No partial parse
    is returned when any part of the source is unsupported.
    """
    if not hours:
        return None
    hours = re.sub(r"^daily\s+", "", hours.strip().lower())
    intervals = []
    for session in hours.split(","):
        parts = re.split(r"\s*[-–—]\s*", session.strip())
        if len(parts) != 2:
            return None
        try:
            start, end = (parse_opening_time(part) for part in parts)
        except ValueError:
            return None
        if start == end or start == 1440:
            return None
        if start < end:
            intervals.append((start, end))
        else:
            intervals.append((start, 1440))
            if end:
                intervals.append((0, end))
    intervals.sort()
    if any(end > next_start for (_, end), (next_start, _) in zip(intervals, intervals[1:])):
        return None
    return intervals
