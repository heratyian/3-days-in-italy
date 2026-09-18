"""Small, JSON-serializable tools backed by the authoritative repository."""

import json
from typing import Annotated, Literal

from langchain.tools import ToolRuntime
from langchain_core.messages import ToolMessage
from langchain_core.tools import ToolException, tool
from langgraph.types import Command
from pydantic import Field, ValidationError

from italy_agent.geography import calculate_distance_between_places
from italy_agent.models import DistanceResult, Itinerary, ItineraryDay, TravelerPreferences
from italy_agent.repository import repository
from italy_agent.validation import validate_itinerary as check_itinerary


@tool
def search_places(
    query: str | None = None,
    cities: list[str] | None = None,
    regions: list[str] | None = None,
    types: list[str] | None = None,
    tags: list[str] | None = None,
    max_price: Literal["€", "€€", "€€€", "€€€€"] | None = None,
    min_rating: Annotated[float, Field(ge=0, le=5)] | None = None,
    limit: Annotated[int, Field(ge=1)] = 10,
) -> list[dict]:
    """Search eligible dataset destinations and return their authoritative records.

    Filters combine with AND; values within a filter combine with OR. Labels
    ignore case, spaces, hyphens, and underscores. Query matches whole words
    in place text (any word), ranked by word matches then rating. No semantic
    search: use short keywords such as wine or food, and broaden empty searches.
    Prices run from € to €€€€; price/rating filters exclude unknown values.
    Missing values mean unknown. IDs in results can be passed to get_place.
    """
    return [place.model_dump() for place in repository.search(
        query=query, cities=cities, regions=regions, types=types, tags=tags,
        max_price=max_price, min_rating=min_rating, limit=limit,
    )]


@tool
def get_place(place_id: str) -> dict:
    """Retrieve a full authoritative record using an exact ID from search_places.

    Includes source hours, typical duration, seasonal notes, and booking needs
    when known. Unknown IDs return a tool error; search for a valid ID to retry.
    """
    try:
        return repository.get(place_id).model_dump()
    except KeyError as error:
        raise ToolException(error.args[0]) from error


get_place.handle_tool_error = True


@tool
def calculate_distance(origin_place_id: str, destination_place_id: str) -> dict:
    """Estimate straight-line distance in km between two exact dataset place IDs.

    Uses Haversine distance from supplied coordinates, not driving/walking
    routes or travel time. Unknown IDs or missing coordinates return an error;
    do not infer a distance when coordinates are unavailable.
    """
    try:
        distance_km = calculate_distance_between_places(
            repository.get(origin_place_id), repository.get(destination_place_id),
        )
    except (KeyError, ValueError) as error:
        raise ToolException(error.args[0]) from error
    return DistanceResult(
        origin_place_id=origin_place_id, destination_place_id=destination_place_id,
        distance_km=distance_km,
    ).model_dump()


calculate_distance.handle_tool_error = True


@tool
def find_nearby_places(
    place_id: str,
    radius_km: Annotated[float, Field(ge=0, allow_inf_nan=False)] | None = None,
    tags: list[str] | None = None,
    types: list[str] | None = None,
    limit: Annotated[int, Field(ge=1)] = 10,
) -> list[dict]:
    """Find dataset alternatives ranked by straight-line Haversine distance in km.

    Returns place records and distance_km, not route lengths or travel times.
    The origin is excluded. Missing-coordinate candidates are omitted; an
    unknown or missing-coordinate origin is an error. None radius means no
    distance cap, so inspect distances before calling results nearby. Zero
    radius includes only co-located candidates. Radius boundaries are inclusive.
    Tags/types use search_places filtering semantics. Use for nearby replacements
    and grouping a day's stops, while respecting traveler preferences.
    """
    try:
        return [candidate.model_dump() for candidate in repository.nearby(
            place_id, radius_km, tags=tags, types=types, limit=limit,
        )]
    except (KeyError, ValueError) as error:
        raise ToolException(error.args[0]) from error


find_nearby_places.handle_tool_error = True


@tool
def validate_itinerary(itinerary: Itinerary) -> dict:
    """Check a proposed three-day plan without changing saved state.

    Returns valid and issues with severity, code, message, day, and place_id.
    Correct errors before saving; explain warnings and source uncertainty to
    the traveler. Missing dates prevent weekday/seasonal availability checks.
    This does not verify real routes or live availability. save_itinerary also
    runs these checks automatically and stores validation for the saved plan.
    """
    return check_itinerary(itinerary, repository).model_dump()


@tool
def update_preferences(preferences: TravelerPreferences, runtime: ToolRuntime) -> Command:
    """Update persistent traveler preferences, preserving omitted fields.

    Supply only changed fields. A supplied list replaces that entire list:
    include retained items when adding interests. Use [] or null to clear a
    list or nullable field. Do not store day/stop-only requests as global
    preferences. Call once per model turn to avoid conflicting state writes.
    """
    current = TravelerPreferences.model_validate(runtime.state.get("preferences", {}))
    updated = TravelerPreferences.model_validate({
        **current.model_dump(), **preferences.model_dump(exclude_unset=True),
    })
    return Command(update={
        "preferences": updated,
        "messages": [ToolMessage(
            content=updated.model_dump_json(), tool_call_id=runtime.tool_call_id,
        )],
    })


@tool
def save_itinerary(days: list[ItineraryDay], runtime: ToolRuntime) -> Command:
    """Create or update the structured three-day itinerary before presenting it.

    For a new plan supply days 1, 2, and 3. For a revision supply only affected
    days; each supplied day replaces that whole day, including all its stops.
    Omitted days are preserved. Use dataset place IDs, short reasons, and
    relevant uncertainty warnings. Unknown times should be null, otherwise
    use local HH:MM. Empty days can represent free time. Validation runs on the
    complete merged plan. Errors leave saved state unchanged; correct them and
    retry. Warnings allow saving but must be explained to the traveler.
    Call once per model turn with all changed days to avoid conflicting writes.
    """
    if not days or len({day.day for day in days}) != len(days):
        raise ToolException("Supply at least one day, with no repeated day numbers")
    current = runtime.state.get("itinerary")
    saved_days = (
        {day.day: day for day in Itinerary.model_validate(current).days}
        if current is not None else {}
    )
    saved_days.update({day.day: day for day in days})
    try:
        itinerary = Itinerary(days=[saved_days[number] for number in sorted(saved_days)])
    except ValidationError as error:
        raise ToolException(f"Itinerary was not saved: {error}") from error
    validation = check_itinerary(itinerary, repository)
    if not validation.valid:
        raise ToolException(f"Itinerary was not saved. Correct errors and retry: {validation.model_dump_json()}")
    return Command(update={
        "itinerary": itinerary,
        "validation": validation,
        "messages": [ToolMessage(
            content=json.dumps({
                "itinerary": itinerary.model_dump(), "validation": validation.model_dump(),
            }),
            tool_call_id=runtime.tool_call_id,
        )],
    })


save_itinerary.handle_tool_error = True
