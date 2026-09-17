"""LangGraph entry point for the conversational planner."""

import os

from langchain.agents import create_agent

from italy_agent.prompts import planning_prompt
from italy_agent.state import AgentState, initialize_plan
from italy_agent.tools import get_place, save_itinerary, search_places, update_preferences


graph = create_agent(
    model=os.environ.get("ITALY_AGENT_MODEL", "openai:gpt-5-mini"),
    tools=[search_places, get_place, update_preferences, save_itinerary],
    middleware=[initialize_plan, planning_prompt],
    state_schema=AgentState,
    name="italy_agent",
)
