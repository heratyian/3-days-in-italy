import json

import pytest
from langchain.tools import ToolRuntime
from langchain_core.messages import AIMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langchain_core.tools import ToolException
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import InMemorySaver
from pydantic import ValidationError

from italy_agent.models import Itinerary, ItineraryDay, ItineraryStop, TravelerPreferences
from italy_agent.tools import save_itinerary, update_preferences


@pytest.fixture
def itinerary():
    return Itinerary(days=[
        ItineraryDay(day=number, stops=[ItineraryStop(place_id=f"place_{number:03}")])
        for number in range(1, 4)
    ])


def tool_runtime(state):
    return ToolRuntime(
        state=state, context=None, config={}, stream_writer=lambda value: None,
        tool_call_id="save", store=None,
    )


def test_preferences_preserve_omitted_fields_and_allow_explicit_clearing():
    original = TravelerPreferences(interests=["food", "wine"], budget="cheap", pace="relaxed")
    runtime = tool_runtime({"preferences": original.model_dump()})
    result = update_preferences.func(TravelerPreferences(budget=None, interests=[]), runtime)
    updated = result.update["preferences"]
    assert updated.budget is None
    assert updated.interests == []
    assert updated.pace == "relaxed"
    assert original.interests == ["food", "wine"]
    assert original.budget == "cheap"


@pytest.mark.parametrize("numbers", [[1, 2], [1, 2, 2], [1, 2, 3, 3], [0, 2, 3]])
def test_completed_itinerary_requires_exactly_days_one_to_three(numbers):
    with pytest.raises(ValidationError):
        Itinerary.model_validate({"days": [{"day": number, "stops": []} for number in numbers]})


def test_save_creates_ordered_itinerary_and_replaces_only_requested_day(itinerary):
    created = save_itinerary.func(list(reversed(itinerary.days)), tool_runtime({}))
    assert created.update["itinerary"] == itinerary
    revised_day = ItineraryDay(day=2, title="Free afternoon", stops=[])
    runtime = tool_runtime({"itinerary": itinerary.model_dump()})
    result = save_itinerary.func([revised_day], runtime)
    updated = result.update["itinerary"]
    assert updated.days == [itinerary.days[0], revised_day, itinerary.days[2]]
    assert itinerary.days[1].stops
    message = result.update["messages"][0]
    assert message.tool_call_id == "save"
    assert json.loads(message.content) == updated.model_dump()


@pytest.mark.parametrize("days", [
    [],
    [ItineraryDay(day=2, stops=[]), ItineraryDay(day=2, stops=[])],
    [ItineraryDay(day=2, stops=[ItineraryStop(place_id="invented")])],
])
def test_bad_update_preserves_existing_itinerary(itinerary, days):
    original = itinerary.model_dump()
    with pytest.raises(ToolException):
        save_itinerary.func(days, tool_runtime({"itinerary": itinerary}))
    assert itinerary.model_dump() == original


def test_partial_new_plan_is_not_saved():
    with pytest.raises(ToolException, match="not saved"):
        save_itinerary.func([ItineraryDay(day=1, stops=[])], tool_runtime({}))


def test_agent_persists_plan_and_preferences_across_thread_turns(monkeypatch, itinerary):
    """Use the real graph and checkpoint serialization with scripted model calls."""
    monkeypatch.setenv("OPENAI_API_KEY", "test-key-not-used")
    monkeypatch.setenv("LANGSMITH_TRACING", "false")
    monkeypatch.setenv("ITALY_AGENT_MODEL", "openai:gpt-5-mini")
    from italy_agent.graph import graph

    monkeypatch.setattr(graph, "checkpointer", InMemorySaver())
    revised_day = ItineraryDay(day=2, title="A quieter day", stops=[])
    responses = iter([
        AIMessage(content="", tool_calls=[{
            "id": "preferences", "name": "update_preferences",
            "args": {"preferences": {"interests": ["food", "wine"], "pace": "relaxed"}},
        }]),
        AIMessage(content="", tool_calls=[{
            "id": "plan", "name": "save_itinerary", "args": itinerary.model_dump(),
        }]),
        AIMessage(content="Your three-day plan is saved."),
        AIMessage(content="", tool_calls=[{
            "id": "revision", "name": "save_itinerary", "args": {"days": [revised_day.model_dump()]},
        }]),
        AIMessage(content="Day two is quieter."),
        AIMessage(content="What would you like to do in Italy?"),
    ])
    prompts = []

    def generate(self, messages, **kwargs):
        prompts.append(messages[0].content)
        return ChatResult(generations=[ChatGeneration(message=next(responses))])

    monkeypatch.setattr(ChatOpenAI, "_generate", generate)
    config = {"configurable": {"thread_id": "trip"}}
    initial = graph.invoke({"messages": [{
        "role": "user", "content": "Plan a relaxed three-day food and wine trip.",
    }]}, config)
    assert Itinerary.model_validate(initial["itinerary"]) == itinerary
    assert '"pace":"relaxed"' in prompts[1]
    assert '"place_id":"place_001"' in prompts[2]
    updated = graph.invoke({"messages": [{
        "role": "user", "content": "Make day two quieter.",
    }]}, config)
    assert Itinerary.model_validate(updated["itinerary"]).days == [
        itinerary.days[0], revised_day, itinerary.days[2],
    ]
    assert TravelerPreferences.model_validate(updated["preferences"]) == TravelerPreferences(
        interests=["food", "wine"], pace="relaxed",
    )
    assert '"place_id":"place_001"' in prompts[3]
    assert "A quieter day" in prompts[4]
    assert len(updated["messages"]) > len(initial["messages"])
    saved = graph.get_state(config).values
    assert Itinerary.model_validate(saved["itinerary"]) == Itinerary.model_validate(updated["itinerary"])

    other = graph.invoke({"messages": [{"role": "user", "content": "Hello"}]}, {
        "configurable": {"thread_id": "other-trip"},
    })
    assert other["itinerary"] is None
    assert TravelerPreferences.model_validate(other["preferences"]) == TravelerPreferences()
