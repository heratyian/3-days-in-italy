"""Deterministic itinerary checks against the supplied place data."""

from typing import Literal

from pydantic import ValidationError

from italy_agent.geography import calculate_distance_between_places
from italy_agent.hours import parse_daily_opening_hours, parse_visit_interval
from italy_agent.models import Itinerary, ValidationIssue, ValidationResult
from italy_agent.repository import PlaceRepository


def validate_itinerary(itinerary: Itinerary | dict, repository: PlaceRepository) -> ValidationResult:
    """Check structure, IDs, duplicate visits, scheduling, hours, and geography.

    Each place may appear once per trip. Visits must start and end on the same
    day (24:00 is allowed as an end); intervals may touch but not overlap.
    Missing/partial times produce warnings. Any visit shorter than the supplied
    typical duration warns; duration is guidance rather than a hard minimum.

    Only unqualified daily hours are enforced. Weekday/ambiguous hours and
    seasonal notes warn because plans have no dates. A conflict with daily
    hours becomes a warning when source seasonal notes could qualify them.
    Adjacent stops over 100 km apart within a day warn; between-day transitions
    also warn, allowing the traveler to consider relocation. This fixed MVP
    threshold is a grouping heuristic, never an estimate of travel time.
    Warnings do not make an itinerary invalid. Inputs are never modified.
    """
    try:
        itinerary = Itinerary.model_validate(itinerary)
    except ValidationError as error:
        return ValidationResult(valid=False, issues=[ValidationIssue(
            severity="error", code="invalid_structure", message=str(error),
        )])

    issues = []
    seen_place_ids = set()
    previous_place = None
    previous_day = None
    for day in itinerary.days:
        scheduled_visits = []
        for stop in day.stops:
            def report(severity: Literal["error", "warning"], code: str, message: str) -> None:
                issues.append(ValidationIssue(
                    severity=severity, code=code, message=message,
                    day=day.day, place_id=stop.place_id,
                ))

            if stop.place_id in seen_place_ids:
                report(
                    "error", "duplicate_stop",
                    f"Place {stop.place_id} appears more than once in the trip.",
                )
            seen_place_ids.add(stop.place_id)

            try:
                visit_interval = parse_visit_interval(stop.start_time, stop.end_time)
            except ValueError as error:
                report("error", "invalid_time", str(error))
                visit_interval = None
            if stop.start_time is None or stop.end_time is None:
                report(
                    "warning", "missing_schedule",
                    "Start/end times are incomplete; scheduling and visit length cannot be fully checked.",
                )
            if visit_interval is not None:
                start, end = visit_interval
                for other_start, other_end, other_id in scheduled_visits:
                    if start < other_end and end > other_start:
                        report(
                            "error", "overlapping_stops",
                            f"Visit overlaps {other_id} on day {day.day}.",
                        )
                if scheduled_visits and start < scheduled_visits[-1][0]:
                    report("error", "out_of_order", "Stops must be listed in chronological order.")
                scheduled_visits.append((start, end, stop.place_id))

            try:
                place = repository.get(stop.place_id)
            except KeyError:
                report("error", "unknown_place", f"Unknown place ID: {stop.place_id}")
                previous_place = None
                continue

            if place.typical_duration_minutes is None:
                report("warning", "missing_duration", "The dataset has no typical visit duration.")
            elif visit_interval is not None:
                start, end = visit_interval
                if end - start < place.typical_duration_minutes:
                    report(
                        "warning", "short_visit",
                        f"Scheduled {end - start} minutes; typical visit is "
                        f"{place.typical_duration_minutes} minutes.",
                    )

            intervals = parse_daily_opening_hours(place.opening_hours)
            if intervals is None:
                report(
                    "warning", "uncertain_hours",
                    "Opening hours cannot be verified without clearer hours or a date: "
                    f"{place.opening_hours or 'not supplied'}.",
                )
            if place.seasonal_notes:
                report("warning", "seasonal_notes", f"Confirm source conditions: {place.seasonal_notes}")
            if intervals is not None and visit_interval is not None:
                start, end = visit_interval
                if not any(opening <= start and end <= closing for opening, closing in intervals):
                    message = f"Visit does not fit within source hours ({place.opening_hours})."
                    if place.seasonal_notes:
                        message += " Seasonal notes may qualify these hours; confirm before visiting."
                    report(
                        "warning" if place.seasonal_notes else "error",
                        "outside_opening_hours", message,
                    )

            if place.latitude is None or place.longitude is None:
                report(
                    "warning", "missing_coordinates",
                    "Coordinates are incomplete; adjacent geographic transitions cannot be checked.",
                )
                previous_place = None
                continue
            if previous_place is not None:
                distance = calculate_distance_between_places(previous_place, place)
                if distance > 100:
                    transition = (
                        f"day {previous_day} to day {day.day}"
                        if previous_day != day.day else f"day {day.day}"
                    )
                    report(
                        "warning", "distant_transition",
                        f"Transition from {previous_place.id} ({transition}) is "
                        f"{distance:.1f} km in a straight line; consider geographic grouping. "
                        "This is not route distance or travel time.",
                    )
            previous_place = place
            previous_day = day.day

    return ValidationResult(valid=not any(issue.severity == "error" for issue in issues), issues=issues)
