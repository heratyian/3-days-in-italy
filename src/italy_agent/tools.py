"""Small, JSON-serializable tools backed by the authoritative repository."""

from typing import Annotated, Literal

from langchain_core.tools import ToolException, tool
from pydantic import Field

from italy_agent.repository import PlaceRepository


repository = PlaceRepository()


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
