# 3 Days in Italy

A dataset-grounded three-day Italy trip planner.

## Local setup

Requires Python 3.12+ and uv (the checkout pins Python 3.13).

```sh
uv sync
uv run pytest
```

## Run the agent in Studio

Copy `.env.example` to `.env` and fill in your OpenAI and LangSmith API keys.
The default model is GPT-5 mini; `ITALY_AGENT_MODEL` can select another
OpenAI model using the `openai:model-name` format.

```sh
cp .env.example .env
# Fill in .env, then start the local Agent Server:
uv run langgraph dev
```

Open the Studio URL printed by the server, select `italy_agent`, and send:

> Plan a relaxed three-day food and wine trip.

Inspect the search/lookup tool calls and returned place IDs in the trace.
The state also exposes `preferences` and `itinerary` as structured data for a
frontend; `itinerary` stays null until a complete three-day plan is saved.
Try “Make day two quieter” in the same thread and inspect the updated itinerary.
Continue in the same thread to retain conversation history. Agent Server
manages thread persistence locally; this is a development setup.
See the [LangGraph local-server guide](https://docs.langchain.com/oss/python/langgraph/local-server).

Tests and repository searches run without API keys. Tests use a scripted model;
a live Studio run is needed to evaluate actual planning quality.

## Place Repository

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
