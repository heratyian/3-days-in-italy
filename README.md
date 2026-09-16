# 3 Days in Italy

A dataset-grounded trip planner. Phase 1 implements the Python data layer;
the agent, geography tools, and itinerary validation are later phases in [SPEC.md](SPEC.md).

## Local setup

Requires Python 3.12+ and uv (the checkout pins Python 3.13).

```sh
uv sync
uv run pytest
```

From this checkout:

```python
from italy_agent.repository import PlaceRepository

repo = PlaceRepository()
wine_places = repo.search(tags=["wine"])
tuscan_food = repo.search(
    regions=["Tuscany"], tags=["food", "wine"], max_price="€€", min_rating=4.0,
)
place = repo.get("place_001")
```

Pass `PlaceRepository("/path/to/italy.json")` to use an explicit dataset path.
The default points to `data/italy.json` in the source checkout; deployments
must include this file or supply a path. Loading is local and requires no API keys.

## Data and search behavior

The 103 records in [data/italy.json](data/italy.json) are the supplied assignment
dataset, originally from [italy.json](https://storage.googleapis.com/interview-booking/italy.json).
The source file is preserved unchanged.

- Source IDs are retained; missing IDs, invalid records, and duplicate IDs fail with context.
- Missing optional information remains `None`; absent/null tags become an empty list.
- Pydantic loads and validates the JSON directly into `Place` models. Field aliases
  and validators handle normalization; `ftfy` repairs garbled text, including euro
  symbols. No destination facts are inferred.
- Tags use lowercase hyphenated labels (`local_favorite` becomes `local-favorite`).
- `duration_minutes` maps to `typical_duration_minutes`; `hours` maps to
  `opening_hours` and stays free text. Seasonal notes and booking requirements remain available.
- Original records can be inspected by ID in `data/italy.json`.
- Search combines filter categories with AND and values within a category with OR,
  including tags. Labels ignore case and differences between spaces, underscores,
  and hyphens. Empty lists impose no filter.
- Query search matches whole words across name, description, type, location, and tags.
  At least one query word must match. Results sort by matching word count, then
  rating descending (unknown last), then ID. Without a query they sort by rating and ID.
- Prices are ordered `€` through `€€€€`. Unknown prices/ratings are excluded when
  their corresponding filter is requested. Results default to ten places.
- Returned records are copies, so callers cannot alter the repository's data.

There is no hours interpretation, routing, semantic search, or agent execution yet.
