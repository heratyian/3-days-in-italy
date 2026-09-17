# 3 Days in Italy

A dataset-grounded trip planner. Phase 1 implements the Python data layer;
the agent, geography tools, and itinerary validation are later phases in [SPEC.md](SPEC.md).

## Local setup

Requires Python 3.12+ and uv (the checkout pins Python 3.13). No API keys needed.

```sh
uv sync
uv run pytest
```

Try a search from the checkout:

```sh
uv run python - <<'PY'
from italy_agent.repository import PlaceRepository

repo = PlaceRepository()
for place in repo.search(tags=["wine"]):
    print(place.name, place.city)
PY
```

The supplied [dataset](data/italy.json) is preserved unchanged. Normalization and
search behavior are documented alongside [Place](src/italy_agent/models.py) and
[PlaceRepository](src/italy_agent/repository.py).
