import json

import pytest
from langchain.tools import ToolRuntime
from langchain_core.messages import AIMessage, ToolMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langchain_core.tools import ToolException
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import InMemorySaver

from italy_agent.models import Itinerary, ItineraryDay, ItineraryStop, ValidationResult
from italy_agent.repository import PlaceRepository
from italy_agent.tools import save_itinerary, validate_itinerary as validation_tool
from italy_agent.validation import validate_itinerary


@pytest.fixture
def repository(tmp_path, monkeypatch):
    records = [
        {"id": name, "name": name, "hours": "09:00-18:00", "duration_minutes": 60,
         "latitude": 43, "longitude": 11 + index / 100}
        for index, name in enumerate(["a", "b", "c", "d"])
    ]
    records.extend([
        {"id": "split", "name": "Split", "hours": "12:00-14:30, 19:00-22:30",
         "latitude": 43, "longitude": 11, "duration_minutes": 60},
        {"id": "night", "name": "Night", "hours": "8:00-01:00",
         "latitude": 43, "longitude": 11, "duration_minutes": 30},
        {"id": "unknown", "name": "Unknown"},
        {"id": "weekly", "name": "Weekly", "hours": "Tues-Sun 09:00-18:00",
         "latitude": 43, "longitude": 11, "duration_minutes": 60},
        {"id": "seasonal", "name": "Seasonal", "hours": "09:00-18:00",
         "seasonal_notes": "Open April-October only.", "latitude": 43, "longitude": 11,
         "duration_minutes": 60},
        {"id": "far", "name": "Far", "hours": "09:00-18:00",
         "latitude": 46, "longitude": 11, "duration_minutes": 60},
    ])
    path = tmp_path / "places.json"
    path.write_text(json.dumps(records))
    repository = PlaceRepository(path)
    monkeypatch.setattr("italy_agent.tools.repository", repository)
    return repository


def stop(place_id="a", start="09:00", end="10:00"):
    return ItineraryStop(place_id=place_id, start_time=start, end_time=end)


def plan(*stops):
    return Itinerary(days=[
        ItineraryDay(day=1, stops=list(stops)),
        ItineraryDay(day=2, stops=[stop("c")]),
        ItineraryDay(day=3, stops=[stop("d")]),
    ])


def codes(result):
    return {issue.code for issue in result.issues}


def runtime(state):
    return ToolRuntime(state=state, context=None, config={}, stream_writer=lambda value: None,
                       tool_call_id="save", store=None)


def test_valid_schedule_and_boundaries(repository):
    result = validate_itinerary(plan(stop(), stop("b", "10:00", "11:00")), repository)
    assert result.valid and not result.issues
    assert validate_itinerary(plan(stop("a", "17:00", "18:00")), repository).valid


@pytest.mark.parametrize("days", [[], [{"day": 1, "stops": []}], [
    {"day": 1, "stops": []}, {"day": 1, "stops": []}, {"day": 3, "stops": []},
]])
def test_structural_errors_return_validation_issues(repository, days):
    result = validate_itinerary({"days": days}, repository)
    assert not result.valid
    assert codes(result) == {"invalid_structure"}


def test_unknown_and_duplicate_ids_have_location(repository):
    result = validate_itinerary(plan(stop("invented"), stop("c")), repository)
    assert not result.valid
    assert "unknown_place" in codes(result)
    duplicate = next(issue for issue in result.issues if issue.code == "duplicate_stop")
    assert duplicate.day == 2 and duplicate.place_id == "c"


@pytest.mark.parametrize(("start", "end"), [
    ("bad", "10:00"), ("09:00", "25:00"), ("10:00", "09:00"),
    ("09:00", "09:00"), ("24:00", "24:00"), ("23:00", "01:00"),
])
def test_invalid_times_are_errors(repository, start, end):
    result = validate_itinerary(plan(stop(start=start, end=end)), repository)
    assert not result.valid
    assert "invalid_time" in codes(result)


def test_nested_overlap_is_detected_beyond_previous_stop(repository):
    itinerary = plan(stop("a", "09:00", "13:00"), stop("b", "10:00", "11:00"), stop("split", "12:00", "13:00"))
    result = validate_itinerary(itinerary, repository)
    overlaps = [issue for issue in result.issues if issue.code == "overlapping_stops"]
    assert len(overlaps) == 2
    assert not result.valid


def test_out_of_order_schedule(repository):
    result = validate_itinerary(plan(stop("a", "11:00", "12:00"), stop("b")), repository)
    assert not result.valid and "out_of_order" in codes(result)


@pytest.mark.parametrize(("start", "end"), [(None, None), ("09:00", None), (None, "10:00")])
def test_missing_times_warn_without_inventing_schedule(repository, start, end):
    result = validate_itinerary(plan(stop(start=start, end=end)), repository)
    assert result.valid
    assert "missing_schedule" in codes(result)


def test_short_visit_warns(repository):
    result = validate_itinerary(plan(stop(end="09:30")), repository)
    assert result.valid and codes(result) == {"short_visit"}


@pytest.mark.parametrize(("start", "end", "valid"), [
    ("12:00", "14:30", True), ("19:00", "22:30", True),
    ("14:00", "19:30", False), ("15:00", "16:00", False),
    ("11:30", "12:30", False), ("22:00", "23:00", False),
])
def test_visit_must_fit_inside_one_open_session(repository, start, end, valid):
    result = validate_itinerary(plan(stop("split", start, end)), repository)
    assert result.valid == valid
    assert ("outside_opening_hours" in codes(result)) == (not valid)


@pytest.mark.parametrize(("start", "end"), [("23:00", "24:00"), ("00:00", "01:00")])
def test_overnight_source_hours_support_same_day_visits(repository, start, end):
    assert validate_itinerary(plan(stop("night", start, end)), repository).valid


def test_weekday_seasonal_and_missing_data_remain_warnings(repository):
    for place_id, expected in [
        ("weekly", {"uncertain_hours"}),
        ("seasonal", {"seasonal_notes", "outside_opening_hours"}),
        ("unknown", {"uncertain_hours", "missing_duration", "missing_coordinates"}),
    ]:
        result = validate_itinerary(plan(stop(place_id, "18:00", "19:00")), repository)
        assert result.valid
        assert expected <= codes(result)
        assert all(issue.severity == "warning" for issue in result.issues)


def test_long_transitions_warn_with_straight_line_qualification(repository):
    result = validate_itinerary(plan(stop("a"), stop("far", "12:00", "13:00")), repository)
    assert result.valid
    transitions = [issue for issue in result.issues if issue.code == "distant_transition"]
    assert len(transitions) == 2  # Includes the next day's relocation.
    assert all("straight line" in issue.message for issue in transitions)


def test_validation_and_rejected_save_do_not_mutate_saved_state(repository):
    original = plan(stop())
    validation = validate_itinerary(original, repository)
    state = {"itinerary": original, "validation": validation}
    candidate = plan(stop(end="08:00"))
    before = candidate.model_dump()
    result = validation_tool.invoke({"itinerary": candidate.model_dump()})
    assert result["valid"] is False
    assert candidate.model_dump() == before
    with pytest.raises(ToolException, match="invalid_time"):
        save_itinerary.func([candidate.days[0]], runtime(state))
    assert state == {"itinerary": original, "validation": validation}
    updated = save_itinerary.func([ItineraryDay(day=1, stops=[])], runtime(state))
    assert updated.update["validation"].valid
    assert updated.update["validation"].issues == []


def test_graph_replans_after_rejection_and_checkpoints_validation(monkeypatch, repository):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key-not-used")
    monkeypatch.setenv("LANGSMITH_TRACING", "false")
    monkeypatch.setenv("ITALY_AGENT_MODEL", "openai:gpt-5-mini")
    from italy_agent.graph import graph
    monkeypatch.setattr(graph, "checkpointer", InMemorySaver())
    invalid = plan(stop("a", "09:00", "11:00"), stop("b", "10:00", "12:00"))
    corrected = plan(stop(), stop("b", "10:00", "11:00"))
    calls = 0

    def generate(self, messages, **kwargs):
        nonlocal calls
        calls += 1
        if calls == 1:
            response = AIMessage(content="", tool_calls=[{
                "id": "bad", "name": "save_itinerary", "args": invalid.model_dump(),
            }])
        elif calls == 2:
            assert messages[-1].status == "error"
            assert "overlapping_stops" in messages[-1].content
            assert "Itinerary: null" in messages[0].content
            response = AIMessage(content="", tool_calls=[{
                "id": "fixed", "name": "save_itinerary", "args": corrected.model_dump(),
            }])
        else:
            saved = json.loads(messages[-1].content)
            assert saved["validation"] == {"valid": True, "issues": []}
            assert '"valid":true' in messages[0].content
            response = AIMessage(content="The plan passed dataset validation.")
        return ChatResult(generations=[ChatGeneration(message=response)])

    monkeypatch.setattr(ChatOpenAI, "_generate", generate)
    config = {"configurable": {"thread_id": "validation"}}
    result = graph.invoke({"messages": [{"role": "user", "content": "Plan three days."}]}, config)
    assert calls == 3
    assert Itinerary.model_validate(result["itinerary"]) == corrected
    assert ValidationResult.model_validate(result["validation"]).valid
    tool_messages = [message for message in result["messages"] if isinstance(message, ToolMessage)]
    assert [message.status for message in tool_messages] == ["error", "success"]
    saved = graph.get_state(config).values
    assert ValidationResult.model_validate(saved["validation"]) == ValidationResult(valid=True)


def test_saving_replaces_stale_warnings_and_preserves_source(repository):
    warning_plan = plan(stop("a", "09:00", "09:30"))
    first = save_itinerary.func(warning_plan.days, runtime({}))
    assert codes(first.update["validation"]) == {"short_visit"}
    state = {"itinerary": first.update["itinerary"], "validation": first.update["validation"]}
    fixed = save_itinerary.func([plan(stop()).days[0]], runtime(state))
    assert fixed.update["validation"] == ValidationResult(valid=True)
    assert codes(state["validation"]) == {"short_visit"}
    assert warning_plan.days[0].stops[0].end_time == "09:30"
    assert repository.get("a").typical_duration_minutes == 60
