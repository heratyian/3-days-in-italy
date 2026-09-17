"""LangGraph entry point for the conversational planner."""

import os

from langchain.agents import create_agent

from italy_agent.prompts import SYSTEM_PROMPT
from italy_agent.state import AgentState
from italy_agent.tools import get_place, search_places


graph = create_agent(
    model=os.environ.get("ITALY_AGENT_MODEL", "openai:gpt-5-mini"),
    tools=[search_places, get_place],
    system_prompt=SYSTEM_PROMPT,
    state_schema=AgentState,
    name="italy_agent",
)
