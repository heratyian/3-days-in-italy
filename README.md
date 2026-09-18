# 3 Days in Italy

A conversational three-day trip planner grounded in [Italy place data](data/italy.json).

## Run

Requires Python 3.12+ and [uv](https://docs.astral.sh/uv/).

```sh
uv sync
cp .env.example .env
# Add your OpenAI and LangSmith API keys to .env.
uv run langgraph dev
```

Open the Studio URL, select `italy_agent`, and try:

> Plan a relaxed three-day food and wine trip.

Then, in the same thread:

> Make day two quieter.

## Tests & evals

```sh
uv run pytest  # Offline tests
uv run evals   # Run the five synthetic examples
```

The eval loads `.env` automatically and creates `italy-recommendations-v1` from
[five synthetic conversations](evals/conversation.json) on the first run.
One LLM judge scores request fulfillment from 1–5 and explains each score.
Agent and judge calls are paid. No evaluator setup in the UI is needed.

Open the experiment link printed by LangSmith, inspect low-scoring examples,
change the agent prompt or model, and rerun to compare experiments on the same
dataset. Edit examples in LangSmith, or change `dataset_name` in
[evals/conversation.py](evals/conversation.py) to upload the local JSON as a new
dataset. The same file contains the judge's rubric.
