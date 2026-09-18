"""LangGraph entry point for the conversational planner."""

import os

from langchain.agents import create_agent

from italy_agent.prompts import planning_prompt
from italy_agent.state import AgentState, initialize_plan
from italy_agent.tools import (
    calculate_distance,
    find_nearby_places,
    get_place,
    save_itinerary,
    search_places,
    update_preferences,
    validate_itinerary,
)

tools = [
    calculate_distance,
    find_nearby_places,
    get_place,
    save_itinerary,
    search_places,
    update_preferences,
    validate_itinerary,
]

graph = create_agent(
    model=os.environ.get("ITALY_AGENT_MODEL", "openai:gpt-5-mini"),
    tools=tools,
    middleware=[initialize_plan, planning_prompt],
    state_schema=AgentState,
    name="italy_agent",
)
