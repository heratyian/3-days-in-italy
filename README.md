# 3 Days in Italy

A conversational three-day trip planner grounded in [Italy place data](agent/data/italy.json).

`agent/` contains the Python LangGraph agent, data, tests, and evals, managed by uv.
`ui/` contains the Next.js testing UI, managed by npm. Each has its own environment
file and can be run or deployed independently.

## Run Agent

Requires Python 3.12+ and [uv](https://docs.astral.sh/uv/).

```sh
cd agent
uv sync
cp .env.example .env
# Add your OpenAI and LangSmith API keys to .env.
uv run langgraph dev
```

Open the Studio URL, select `italy_agent`, and try:

> Plan a relaxed three-day food and wine trip.

Then, in the same thread:

> Make day two quieter.

## Run UI

Requires Node.js 22+ and npm. Start the LangGraph server above, then open another
terminal at the repository root:

```sh
cd ui
npm ci
cp .env.example .env.local
# Set TEST_AUTH_PASSWORD in .env.local.
npm run dev
```

Open http://localhost:3000 and enter the shared password. The UI streams replies,
preserves the conversation across refreshes, and offers a fresh conversation button.
LangSmith Studio remains the place for traces and debugging.
Restart `langgraph dev` after changing `agent/langgraph.json` so custom API routes load.

Deploy `ui/` as a normal Next.js app: set the variables from
[ui/.env.example](ui/.env.example), run `npm run build`, then `npm start`.
Use HTTPS and a long random testing password. Set `LANGGRAPH_API_URL` to your
deployed backend and `LANGGRAPH_API_KEY` when required. Backend credentials stay
on the server. Public UI labels are set at build time.

The host must support streaming responses and allow up to five minutes per request.
The optional in-memory rate limit is per Node process and resets on restart; use a
single instance or the hosting platform's rate limiting for a shared deployment-wide
limit. The backend must also be private or authenticated when deployed.

Run `npm test` and `npm run typecheck` from `ui/` for the UI's security checks.

## Tests & evals

Run from `agent/`:

```sh
uv run pytest  # Offline tests
uv run evals   # Run the five synthetic examples
```

The eval loads `.env` automatically and creates `italy-recommendations-v1` from
[five synthetic conversations](agent/evals/conversation.json) on the first run.
One LLM judge scores request fulfillment from 1–5 and explains each score.
Agent and judge calls are paid. No evaluator setup in the UI is needed.

Open the experiment link printed by LangSmith, inspect low-scoring examples,
change the agent prompt or model, and rerun to compare experiments on the same
dataset. Edit examples in LangSmith, or change `dataset_name` in
[evals/conversation.py](agent/evals/conversation.py) to upload the local JSON as a new
dataset. The same file contains the judge's rubric.
