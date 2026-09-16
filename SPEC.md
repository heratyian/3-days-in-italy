# 3 Days in Italy — Agent Service Specification

## 1. Overview

Build an AI-powered trip-planning agent that helps a user collaboratively create a personalized three-day itinerary in Italy.

The initial deliverable is a Python agent service built with LangGraph/LangChain and designed to run locally through LangSmith Studio / Agent Server.

The agent will:

* understand natural-language travel preferences;
* search the provided `italy.json` dataset;
* reason about which destinations best fit the user;
* construct a geographically and temporally reasonable three-day itinerary;
* validate the itinerary against known constraints;
* explain its recommendations;
* allow the user to iteratively modify the itinerary through conversation.

The Python service will be independent of the eventual user interface. A Rails, React, or other web client can be added later.

---

# 2. Product Thesis

The product is not primarily a travel chatbot or a RAG application.

It is a **planning agent with trusted domain tools**.

The LLM is responsible for:

* understanding fuzzy preferences;
* making planning decisions;
* balancing competing preferences;
* deciding which tools to use;
* constructing and revising itineraries;
* explaining recommendations.

Deterministic application code is responsible for:

* accessing authoritative place data;
* filtering structured attributes;
* calculating geographic relationships;
* checking opening hours where possible;
* detecting scheduling conflicts;
* validating itinerary structure;
* identifying uncertain or incomplete source data.

This separation allows the model to handle subjective planning while software handles facts and constraints.

---

# 3. Goals

## 3.1 Primary Goals

The system should:

1. Accept natural-language trip requests.
2. Infer relevant traveler preferences and constraints.
3. Recommend only places contained in `italy.json`.
4. Produce a structured three-day itinerary.
5. Consider geography, opening hours, visit duration, price, rating, tags, and user preferences when relevant.
6. Validate the itinerary before presenting it.
7. Allow conversational refinement without discarding unrelated prior preferences.
8. Communicate uncertainty when the source dataset is incomplete or inconsistent.
9. Expose structured itinerary state suitable for rendering by an external frontend.
10. Be inspectable and debuggable through LangSmith.

---

# 4. Non-Goals

The MVP will not attempt to provide:

* hotel booking;
* restaurant reservations;
* flight booking;
* authentication;
* user accounts;
* payments;
* collaborative planning;
* production-grade persistence;
* a general-purpose Italy travel assistant;
* exhaustive real-time travel information;
* autonomous web research;
* a complex multi-agent hierarchy;
* a production vector database.

External APIs such as Google Maps, Mapbox, weather services, or web search may be added later but are not required for the MVP.

---

# 5. Source of Truth

`italy.json` is the authoritative source for places that may appear in an itinerary.

Each dataset entry may contain information such as:

* name;
* type;
* city or region;
* neighborhood;
* opening hours;
* typical visit duration;
* price range;
* rating;
* description;
* latitude;
* longitude;
* tags.

The source data may be incomplete or internally inconsistent.

The agent MUST NOT invent itinerary destinations.

Every itinerary stop MUST reference a valid place from the supplied dataset.

If external research is added later, external sources may enrich a place with information such as travel time or context, but they must not silently replace the supplied dataset as the authority for which places are eligible.

---

# 6. Core User Experience

A user should be able to begin with an unconstrained request such as:

> My wife and I love food and wine. We'd prefer smaller towns and local places and don't want to rush around too much.

The agent should interpret the request, search the dataset, construct a reasonable itinerary, validate it, and return both conversational commentary and structured itinerary data.

A user can subsequently say:

> Day two seems too busy. Make it more relaxed.

or:

> Replace the expensive dinner on day one.

or:

> Can we spend more time in Tuscany?

The agent should modify the existing itinerary while retaining relevant prior context.

The user should not need to restate their entire trip specification on every turn.

---

# 7. High-Level Architecture

```text
                       Client
              Rails / React / Studio
                         │
                         │
                         ▼
                LangGraph Agent Server
                         │
                         ▼
                 Trip Planning Agent
                         │
            ┌────────────┼────────────┐
            │            │            │
            ▼            ▼            ▼
       Place Search   Geography    Validation
          Tools         Tools         Tools
            │            │            │
            └────────────┼────────────┘
                         │
                         ▼
                    italy.json
```

The agent service should have no dependency on a particular frontend implementation.

---

# 8. Technology Stack

## Core

* Python 3.12+
* LangGraph
* LangChain
* LangSmith
* Pydantic
* LangGraph Agent Server

## Data

For the MVP:

* load `italy.json` into memory;
* normalize entries into Pydantic models;
* expose data only through repository/tool interfaces.

No database is required.

## Optional Libraries

A lightweight geographic library or Haversine implementation may be used for distance calculations.

---

# 9. Domain Models

## Place

Normalized representation of an entry in `italy.json`.

```python
class Place(BaseModel):
    id: str
    name: str
    type: str | None
    city: str | None
    region: str | None
    neighborhood: str | None

    description: str | None
    tags: list[str]

    rating: float | None
    price_range: str | None

    latitude: float | None
    longitude: float | None

    typical_duration_minutes: int | None
    opening_hours: dict | None
```

The normalization layer should tolerate incomplete data.

The raw source record should remain accessible for debugging if useful.

---

# 10. Traveler Preferences

The agent should maintain structured preferences inferred from conversation.

```python
class TravelerPreferences(BaseModel):
    interests: list[str] = []
    avoid: list[str] = []

    preferred_cities: list[str] = []
    preferred_regions: list[str] = []

    budget: str | None = None
    pace: Literal["relaxed", "moderate", "packed"] | None = None

    food_preferences: list[str] = []

    notes: list[str] = []
```

Preferences should evolve during conversation.

The system should distinguish between:

* persistent preferences;
* requests affecting only one itinerary day;
* requests affecting a particular stop.

Example:

> We don't really like museums.

should modify persistent preferences.

But:

> No museums on day two.

should apply only to day two.

---

# 11. Itinerary Model

The itinerary should exist as structured application state rather than only as generated prose.

```python
class ItineraryStop(BaseModel):
    place_id: str

    start_time: str | None
    end_time: str | None

    reason: str | None

    warnings: list[str] = []


class ItineraryDay(BaseModel):
    day: int

    title: str | None
    city_or_region: str | None

    stops: list[ItineraryStop]


class Itinerary(BaseModel):
    days: list[ItineraryDay]
```

Exactly three days should be produced for a completed itinerary.

---

# 12. Agent State

LangGraph state should contain at minimum:

```python
class AgentState(TypedDict):
    messages: list
    preferences: TravelerPreferences
    itinerary: Itinerary | None
    validation: ValidationResult | None
```

Additional implementation state may include:

* candidate places;
* tool results;
* validation attempts;
* planning metadata.

Conversation history should remain the primary natural-language context while important product state remains structured.

---

# 13. Agent Tools

The agent should interact with the dataset through a deliberately small set of tools.

## 13.1 `search_places`

Purpose:

Find places matching a set of constraints or preferences.

Possible interface:

```python
search_places(
    query: str | None = None,
    cities: list[str] | None = None,
    regions: list[str] | None = None,
    types: list[str] | None = None,
    tags: list[str] | None = None,
    max_price: str | None = None,
    min_rating: float | None = None,
    limit: int = 10,
)
```

The implementation should combine structured filtering with lightweight relevance ranking.

For MVP, semantic vector search is not required.

---

## 13.2 `get_place`

Purpose:

Retrieve the authoritative record for a specific place.

```python
get_place(place_id: str) -> Place
```

The planner should use this when it needs detailed information about a candidate destination.

---

## 13.3 `find_nearby_places`

Purpose:

Find geographically nearby candidates.

```python
find_nearby_places(
    place_id: str,
    radius_km: float | None = None,
    tags: list[str] | None = None,
    types: list[str] | None = None,
    limit: int = 10,
)
```

Distance should be calculated using latitude and longitude.

This tool is particularly useful for itinerary refinement and replacement.

Example:

> Replace this museum with something outdoors nearby.

---

## 13.4 `calculate_distance`

Purpose:

Estimate geographic distance between two dataset places.

```python
calculate_distance(
    origin_place_id: str,
    destination_place_id: str,
) -> DistanceResult
```

For MVP, straight-line/Haversine distance is sufficient.

The system should clearly distinguish geographic distance from actual driving or transit time.

Real routing can be added later.

---

## 13.5 `validate_itinerary`

Purpose:

Perform deterministic checks against a proposed itinerary.

```python
validate_itinerary(
    itinerary: Itinerary
) -> ValidationResult
```

This is a core system component.

The agent should normally validate a completed itinerary before presenting it as final.

---

# 14. Validation

Validation should check as many of the following as are reliably supported by the source data.

## Structural Validation

Check:

* exactly three itinerary days exist;
* all referenced `place_id` values exist;
* no accidental duplicate stops;
* start/end times are internally valid;
* stops do not overlap.

## Duration Validation

Where duration information exists:

* ensure the scheduled visit reasonably accommodates typical duration;
* flag unusually short visits.

## Opening Hours Validation

Where reliable opening-hours information exists:

* ensure the place is expected to be open;
* ensure the planned visit fits within operating hours.

Where hours are incomplete, ambiguous, seasonal, or inconsistent:

* emit a warning rather than inventing certainty.

## Geographic Validation

Detect obviously unreasonable geographic transitions.

Example:

```text
WARNING

Day 2 contains destinations that are unusually far apart.
Consider grouping destinations more geographically.
```

The validator does not need production-quality routing.

Its purpose is to catch clearly poor plans.

---

# 15. Validation Result

```python
class ValidationIssue(BaseModel):
    severity: Literal["error", "warning"]
    code: str
    message: str

    day: int | None = None
    place_id: str | None = None


class ValidationResult(BaseModel):
    valid: bool
    issues: list[ValidationIssue]
```

Errors represent problems that should generally cause replanning.

Warnings represent uncertainty or questionable choices that may still be presented to the user.

---

# 16. Agent Planning Loop

The desired behavior is approximately:

```text
User Request
     │
     ▼
Understand request
     │
     ▼
Update preferences
     │
     ▼
Search places
     │
     ▼
Inspect candidates
     │
     ▼
Construct itinerary
     │
     ▼
Validate itinerary
     │
     ├──── valid ────────────────┐
     │                           │
     ▼                           ▼
Review validation            Respond
     │
     ▼
Revise itinerary
     │
     └──────────► Validate again
```

The exact graph does not need to be hard-coded prematurely.

An initial implementation may use a tool-calling agent and allow the model to decide when tools are required.

The important invariant is:

**A completed itinerary should be grounded in dataset records and normally validated before being presented as final.**

---

# 17. Agent Instructions

The system prompt should establish several strong behavioral rules.

Conceptually:

```text
You are an expert Italy trip-planning agent.

Your job is to collaboratively create a personalized,
feasible three-day itinerary.

The supplied Italy dataset is the authoritative source
for destinations.

Never invent a destination.

Use your tools to inspect the dataset rather than relying
on your memory for information about places.

Consider the user's preferences, geography, opening hours,
visit duration, price, and pace when planning.

Prefer geographically coherent days.

Do not overload relaxed itineraries.

Before presenting a completed itinerary, validate it.

If validation reports errors, attempt to correct them.

If source information is missing or uncertain, communicate
that uncertainty rather than inventing facts.

When the user requests a modification, preserve unaffected
parts of their preferences and itinerary whenever reasonable.
```

The production prompt should remain relatively concise.

Tool descriptions and structured schemas should communicate detailed mechanics wherever possible.

---

# 18. Response Contract

The service ultimately needs to expose two concepts to a frontend:

1. conversational response;
2. current structured itinerary.

Conceptually:

```json
{
  "message": "I've kept the trip centered around Florence and Tuscany...",
  "itinerary": {
    "days": []
  },
  "validation": {
    "valid": true,
    "issues": []
  }
}
```

LangGraph state may ultimately provide this directly rather than requiring a custom REST response shape.

The frontend should not need to parse itinerary information from Markdown.

---

# 19. Conversational Refinement

Modification requests are a first-class requirement.

Example:

```text
USER
Day two feels too busy.

AGENT
I'll simplify day two and keep the food and wine focus.

[searches nearby alternatives]
[updates itinerary]
[validates itinerary]
```

The agent should preferentially modify only affected itinerary state.

Examples:

```text
"Make day two more relaxed."
        ↓
modify day 2

"Replace the expensive dinner."
        ↓
modify relevant stop

"Actually, we love museums."
        ↓
update preference + reconsider itinerary

"Let's stay entirely around Florence."
        ↓
update geographic constraint + replan
```

---

# 20. Explainability

Recommendations should contain short, user-facing explanations.

Example:

```text
Antinori nel Chianti Classico

Why it fits:
You asked for wine, scenery, and a relaxed pace, and this
keeps the afternoon geographically focused in Tuscany.
```

These explanations should summarize recommendation rationale.

They should not expose hidden chain-of-thought.

---

# 21. Uncertainty

The dataset intentionally contains imperfect information.

The system should treat uncertainty as a product feature rather than attempting to hide it.

Example:

```text
⚠ Seasonal hours

The dataset contains incomplete seasonal opening information
for this stop. Confirm the hours before visiting.
```

Potential uncertainty categories:

* missing hours;
* seasonal hours;
* missing duration;
* missing coordinates;
* inconsistent location information.

---

# 22. Retrieval Strategy

The initial implementation should NOT require a vector database.

The dataset contains roughly 100 structured records, making in-memory filtering and ranking appropriate for the MVP.

Initial ranking may consider:

```text
tag match
+
type match
+
city/region match
+
rating
+
text relevance
+
geographic proximity
```

A semantic search layer can be introduced later if testing demonstrates that users frequently express preferences that cannot be mapped effectively to structured attributes.

Possible future implementation:

```text
structured filters
       +
embedding similarity
       ↓
candidate ranking
```

The repository interface should hide retrieval implementation details so this change does not require modifying the agent.

---

# 23. Repository Layer

Agent tools should not manipulate raw JSON directly.

Use a repository abstraction:

```python
class PlaceRepository:

    def get(self, place_id: str) -> Place:
        ...

    def search(self, filters: PlaceSearch) -> list[Place]:
        ...

    def nearby(
        self,
        place_id: str,
        radius_km: float,
    ) -> list[Place]:
        ...
```

This provides a clean future path from:

```text
JSON
```

to:

```text
SQLite
```

or:

```text
Postgres + pgvector
```

without changing the planner interface.

---

# 24. Observability

LangSmith should be used during development.

Important traces should make it possible to inspect:

* model calls;
* tool selection;
* tool arguments;
* tool results;
* itinerary generation;
* validation failures;
* replanning behavior;
* latency;
* token usage.

Useful test scenarios should be saved as LangSmith examples/evaluations if time permits.

---

# 25. Testing Strategy

Testing should emphasize deterministic components.

## Unit Tests

Test:

* dataset normalization;
* place search/filtering;
* geographic distance calculations;
* opening-hour parsing;
* duration checks;
* itinerary validation.

## Agent Behavior Tests

Create a small set of representative prompts.

### Food and wine

```text
My partner and I love food and wine and want a relaxed,
romantic trip.
```

Expected characteristics:

* food/wine places represented;
* relaxed pacing;
* reasonable geographic grouping.

### History

```text
I love Roman history and museums and don't care much
about nightlife.
```

Expected characteristics:

* historically relevant places;
* preference reflected in ranking.

### Budget

```text
We're traveling cheaply and mostly want local food
and outdoor experiences.
```

Expected characteristics:

* expensive destinations deprioritized where possible.

### Modification

```text
Make day two less busy.
```

Expected characteristics:

* day two changes;
* unrelated preferences remain;
* unrelated days do not unnecessarily change.

### Impossible/awkward plan

Prompt the agent toward geographically incompatible places.

Expected characteristics:

* validator identifies the problem;
* agent revises or warns.

---

# 26. Suggested Project Structure

```text
italy-agent/
│
├── README.md
├── pyproject.toml
├── langgraph.json
├── .env.example
│
├── data/
│   └── italy.json
│
├── src/
│   └── italy_agent/
│       │
│       ├── __init__.py
│       ├── graph.py
│       ├── prompts.py
│       ├── state.py
│       │
│       ├── models/
│       │   ├── place.py
│       │   ├── preferences.py
│       │   ├── itinerary.py
│       │   └── validation.py
│       │
│       ├── repositories/
│       │   └── places.py
│       │
│       ├── tools/
│       │   ├── search_places.py
│       │   ├── get_place.py
│       │   ├── nearby.py
│       │   ├── distance.py
│       │   └── validate_itinerary.py
│       │
│       └── services/
│           ├── geography.py
│           ├── hours.py
│           └── validation.py
│
└── tests/
    ├── test_repository.py
    ├── test_geography.py
    ├── test_hours.py
    ├── test_validation.py
    └── test_agent.py
```

Avoid excessive abstraction initially.

Some modules above can begin as single files and be separated only as implementation grows.

---

# 27. MVP Implementation Order

## Phase 1 — Data

1. Add `italy.json`.
2. Define `Place`.
3. Normalize/load dataset.
4. Implement `PlaceRepository`.
5. Write repository tests.

At completion:

```python
repo.search(tags=["wine"])
```

should work reliably.

---

## Phase 2 — Basic Agent

Implement:

* LangGraph project;
* agent state;
* system prompt;
* `search_places`;
* `get_place`.

Run through LangSmith Studio.

Goal:

The agent can answer:

```text
Plan a relaxed three-day food and wine trip.
```

using only real dataset entries.

---

## Phase 3 — Structured Itinerary

Add:

* `TravelerPreferences`;
* `Itinerary`;
* structured itinerary state;
* itinerary creation/update behavior.

Goal:

The system produces machine-readable itinerary state rather than only prose.

---

## Phase 4 — Geography

Implement:

* Haversine distance;
* `find_nearby_places`;
* `calculate_distance`.

Teach the agent to prefer geographically coherent days.

---

## Phase 5 — Validation

Implement:

* itinerary validator;
* duplicate checks;
* scheduling checks;
* duration checks;
* opening-hours checks where reliable;
* geographic warnings.

Add the validation/replanning loop.

This phase is the highest-value engineering work after the basic planner functions.

---

## Phase 6 — Conversational Refinement

Test:

```text
Make day two quieter.

Replace lunch.

Spend less money.

Add more history.

Keep us around Florence.
```

Ensure state is preserved appropriately.

---

## Phase 7 — Polish

Add:

* better tool descriptions;
* useful warnings;
* improved traces;
* LangSmith examples/evals;
* streaming/tool status events if easy.

At this point the Python service is ready for a frontend.

---

# 28. Future Extensions

These should intentionally remain outside MVP unless implementation time is abundant.

## Semantic Search

Add embeddings over:

```text
name
description
tags
type
location
```

Potential backend:

* in-memory vectors;
* FAISS;
* pgvector.

Only add this if evaluation shows measurable retrieval improvement.

## Routing

Replace straight-line distance with real travel estimates using:

* Google Maps;
* Mapbox;
* another routing provider.

## External Research

Add a research tool for contextual enrichment.

External research should not introduce unsupported itinerary destinations.

## Map

Expose coordinates to the frontend and visualize each day's route.

## Persistence

Persist:

* conversations;
* preferences;
* itinerary versions.

## Advanced Agent Architecture

If future requirements justify it, introduce specialized skills or sub-agents for tasks such as:

* routing;
* restaurant planning;
* itinerary critique;
* external research.

The MVP should demonstrate the need before introducing this complexity.

---

# 29. Success Criteria

The MVP is successful if a reviewer can:

1. describe their desired Italy trip naturally;
2. receive a sensible three-day itinerary;
3. verify that every recommended place comes from `italy.json`;
4. see that the itinerary reflects their preferences;
5. make conversational changes;
6. observe that unchanged constraints/preferences are preserved;
7. receive warnings when source data is uncertain;
8. receive a plan that avoids obvious scheduling or geographic mistakes.

From an engineering perspective, the implementation should make it clear that:

* the LLM handles subjective reasoning;
* tools provide authoritative data;
* deterministic validation checks model output;
* structured state separates the agent from the UI;
* the architecture can evolve without unnecessary MVP infrastructure.

---

# 30. Guiding Engineering Principle

When deciding whether to add infrastructure or agent complexity, ask:

> Does this materially improve the quality or reliability of the itinerary?

If not, leave it out of the MVP.

The project should demonstrate **good AI system design rather than maximum AI system complexity**.
