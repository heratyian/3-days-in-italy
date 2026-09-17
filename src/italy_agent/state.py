"""Thread-local conversation and structured planning state."""

from typing import NotRequired

from langchain.agents import AgentState as BaseAgentState
from langchain.agents.middleware import before_agent
from langgraph.runtime import Runtime

from italy_agent.models import Itinerary, TravelerPreferences, ValidationResult


class AgentState(BaseAgentState):
    preferences: NotRequired[TravelerPreferences]
    itinerary: NotRequired[Itinerary | None]
    validation: NotRequired[ValidationResult | None]


@before_agent(state_schema=AgentState)
def initialize_plan(state: AgentState, runtime: Runtime) -> dict:
    """Initialize new threads without overwriting existing planning state."""
    updates = {}
    if "preferences" not in state:
        updates["preferences"] = TravelerPreferences()
    if "itinerary" not in state:
        updates["itinerary"] = None
    if "validation" not in state:
        updates["validation"] = None
    return updates
