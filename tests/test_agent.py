import json

import pytest
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langchain_openai import ChatOpenAI
from pydantic import ValidationError

from italy_agent.repository import PlaceRepository
from italy_agent.tools import get_place, search_places


def test_search_tool_returns_authoritative_records():
    arguments = {"tags": ["wine"], "max_price": "€€", "min_rating": 4, "limit": 3}
    results = search_places.invoke(arguments)
    assert results
    assert results == [place.model_dump() for place in PlaceRepository().search(**arguments)]
    assert get_place.invoke({"place_id": results[0]["id"]}) == results[0]
    assert search_places.invoke({"query": "nonexistent-destination"}) == []


@pytest.mark.parametrize("arguments", [
    {"limit": 0}, {"limit": -1}, {"min_rating": 6}, {"max_price": "cheap"},
])
def test_search_tool_rejects_invalid_filters(arguments):
    with pytest.raises(ValidationError):
        search_places.invoke(arguments)


def test_unknown_place_is_a_recoverable_tool_error():
    result = get_place.invoke({
        "type": "tool_call", "id": "lookup", "name": "get_place",
        "args": {"place_id": "missing"},
    })
    assert result.status == "error"
    assert "Unknown place ID: missing" in result.content


def test_agent_search_lookup_and_followup(monkeypatch):
    """Exercise the real graph/tools without making a paid model request."""
    monkeypatch.setenv("ITALY_AGENT_MODEL", "openai:gpt-5-mini")
    monkeypatch.setenv("LANGSMITH_TRACING", "false")
    monkeypatch.setenv("OPENAI_API_KEY", "test-key-not-used")
    requests = []

    def generate(self, messages, **kwargs):
        requests.append(messages)
        assert {tool["function"]["name"] for tool in kwargs["tools"]} == {
            "search_places", "get_place", "update_preferences", "save_itinerary",
            "find_nearby_places", "calculate_distance",
            "validate_itinerary",
        }
        latest = messages[-1]
        if isinstance(latest, HumanMessage):
            if latest.content == "Make day two quieter.":
                assert any(isinstance(message, ToolMessage) for message in messages)
                response = AIMessage(content="I'll keep the food and wine focus and relax day two.")
            else:
                response = AIMessage(content="", tool_calls=[{
                    "name": "search_places", "args": {"tags": ["wine"], "limit": 3},
                    "id": "search",
                }])
        elif latest.name == "search_places":
            places = json.loads(latest.content)
            response = AIMessage(content="", tool_calls=[{
                "name": "get_place", "args": {"place_id": places[0]["id"]},
                "id": "lookup",
            }])
        else:
            place = json.loads(latest.content)
            response = AIMessage(content=f"Include {place['name']} ({place['id']}).")
        return ChatResult(generations=[ChatGeneration(message=response)])

    monkeypatch.setattr(ChatOpenAI, "_generate", generate)
    from italy_agent.graph import graph

    result = graph.invoke({"messages": [{
        "role": "user", "content": "Plan a relaxed three-day food and wine trip.",
    }]})
    tool_results = [message for message in result["messages"] if isinstance(message, ToolMessage)]
    assert [message.name for message in tool_results] == ["search_places", "get_place"]
    place = json.loads(tool_results[-1].content)
    assert place == PlaceRepository().get(place["id"]).model_dump()
    assert place["id"] in result["messages"][-1].content
    assert requests[0][0].type == "system"

    followup = graph.invoke({"messages": [
        *result["messages"], HumanMessage(content="Make day two quieter."),
    ]})
    assert followup["messages"][:-2] == result["messages"]
    assert "relax day two" in followup["messages"][-1].content
