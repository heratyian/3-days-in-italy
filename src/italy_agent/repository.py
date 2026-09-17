"""In-memory access to the authoritative place dataset.

The original assignment data is preserved in data/italy.json, sourced from
https://storage.googleapis.com/interview-booking/italy.json.
"""

import re
from pathlib import Path

from pydantic import TypeAdapter

from italy_agent.models import Place, normalize_label


DEFAULT_DATA_PATH = Path(__file__).resolve().parents[2] / "data" / "italy.json"
PRICE_LEVELS = {"€": 1, "€€": 2, "€€€": 3, "€€€€": 4}


class PlaceRepository:
    """Load a JSON array once and expose normalized records by ID or search.

    The default path points to data/italy.json in the source checkout. Outside
    the checkout, supply an explicit path: PlaceRepository("/path/to/italy.json").
    Pydantic reports invalid records; duplicate IDs raise ValueError.
    Returned places are deep copies, so callers cannot change repository data.
    """

    def __init__(self, path: str | Path = DEFAULT_DATA_PATH) -> None:
        path = Path(path)
        places = TypeAdapter(list[Place]).validate_json(path.read_bytes())
        self._places: dict[str, Place] = {}
        for place in places:
            if place.id in self._places:
                raise ValueError(f"{path}: duplicate place ID {place.id!r}")
            self._places[place.id] = place

    def get(self, place_id: str) -> Place:
        """Return a copy of the authoritative place; unknown IDs raise KeyError."""
        try:
            return self._places[place_id].model_copy(deep=True)
        except KeyError:
            raise KeyError(f"Unknown place ID: {place_id}") from None

    def search(
        self,
        *,
        query: str | None = None,
        cities: list[str] | None = None,
        regions: list[str] | None = None,
        types: list[str] | None = None,
        tags: list[str] | None = None,
        max_price: str | None = None,
        min_rating: float | None = None,
        limit: int = 10,
    ) -> list[Place]:
        """AND filters together; OR values within each filter, including tags.

        Labels ignore case and differences between spaces, hyphens and
        underscores. Empty filters and a blank query impose no restriction.

        Query words match whole words in name, description, type, city, region,
        neighborhood and tags. At least one word must match. Results sort by
        matching word count, then rating descending (unknown last), then ID.
        Without a query, results sort by rating and ID.

        Prices are ordered € through €€€€. Unknown prices/ratings are excluded
        when their corresponding filter is requested. Limits apply after
        ranking; zero returns no results. Invalid limits, price levels or rating
        thresholds raise ValueError.
        """
        if limit < 0:
            raise ValueError("limit must be nonnegative")
        if min_rating is not None and not 0 <= min_rating <= 5:
            raise ValueError("min_rating must be between 0 and 5")
        if max_price is not None and max_price not in PRICE_LEVELS:
            raise ValueError("max_price must be €, €€, €€€, or €€€€")

        places = list(self._places.values())
        if cities:
            requested_cities = {normalize_label(city) for city in cities}
            places = [
                place for place in places
                if normalize_label(place.city or "") in requested_cities
            ]
        if regions:
            requested_regions = {normalize_label(region) for region in regions}
            places = [
                place for place in places
                if normalize_label(place.region or "") in requested_regions
            ]
        if types:
            requested_types = {normalize_label(place_type) for place_type in types}
            places = [
                place for place in places
                if normalize_label(place.type or "") in requested_types
            ]
        if tags:
            requested_tags = {normalize_label(tag) for tag in tags}
            places = [place for place in places if requested_tags.intersection(place.tags)]
        if min_rating is not None:
            places = [
                place for place in places
                if place.rating is not None and place.rating >= min_rating
            ]
        if max_price is not None:
            places = [
                place for place in places
                if place.price_range in PRICE_LEVELS
                and PRICE_LEVELS[place.price_range] <= PRICE_LEVELS[max_price]
            ]

        terms = set(re.findall(r"\w+", normalize_label(query or "")))
        matches: list[tuple[int, Place]] = []
        for place in places:
            searchable_text = " ".join([
                place.name, place.description or "", place.type or "",
                place.city or "", place.region or "", place.neighborhood or "", *place.tags,
            ])
            words = set(re.findall(r"\w+", normalize_label(searchable_text)))
            relevance = len(terms & words)
            if terms and not relevance:
                continue
            matches.append((relevance, place))

        matches.sort(key=lambda match: (
            -match[0], -(match[1].rating if match[1].rating is not None else -1), match[1].id,
        ))
        return [place.model_copy(deep=True) for _, place in matches[:limit]]
