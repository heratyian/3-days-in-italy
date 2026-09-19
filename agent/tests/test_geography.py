import json
from math import pi

import pytest
from langchain_core.messages import AIMessage, ToolMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langchain_openai import ChatOpenAI
from pydantic import ValidationError

from italy_agent.geography import calculate_distance_between_places
from italy_agent.models import Place
from italy_agent.repository import PlaceRepository
from italy_agent.tools import calculate_distance, find_nearby_places


def place(latitude, longitude, place_id="test"):
    return Place(id=place_id, name=place_id, latitude=latitude, longitude=longitude)


@pytest.mark.parametrize(
    ("origin", "destination", "expected"),
    [
        (place(0, 0), place(0, 0), 0),
        (place(0, 0), place(0, 1), pi * 6371.0088 / 180),
        (place(0, 0), place(0, 180), pi * 6371.0088),
        (place(0, 179), place(0, -179), 2 * pi * 6371.0088 / 180),
        (place(90, 0), place(90, 180), 0),
        (place(41.9028, 12.4964), place(43.7696, 11.2558), 231.0),
    ],
)
def test_haversine_distance_and_symmetry(origin, destination, expected):
    distance = calculate_distance_between_places(origin, destination)
    assert distance == pytest.approx(expected, abs=0.1)
    assert calculate_distance_between_places(destination, origin) == pytest.approx(distance)


@pytest.mark.parametrize("missing", [place(None, 0), place(0, None), place(None, None)])
def test_missing_coordinates_are_not_treated_as_zero(missing):
    with pytest.raises(ValueError, match="Missing coordinates for place ID: test"):
        calculate_distance_between_places(place(0, 0, "origin"), missing)
    with pytest.raises(ValueError, match="Missing coordinates"):
        calculate_distance_between_places(missing, place(0, 0))


@pytest.fixture
def repository(tmp_path, monkeypatch):
    records = [
        {"id": "origin", "name": "Origin", "latitude": 0, "longitude": 0},
        {"id": "same", "name": "Same location", "latitude": 0, "longitude": 0},
        {
            "id": "near-b",
            "name": "Near B",
            "latitude": 0,
            "longitude": 0.01,
            "tags": ["outdoors"],
            "type": "park",
            "rating": 5,
        },
        {
            "id": "near-a",
            "name": "Near A",
            "latitude": 0,
            "longitude": 0.01,
            "tags": ["local_favorite"],
            "type": "park",
            "rating": 1,
        },
        {
            "id": "far",
            "name": "Far",
            "latitude": 0,
            "longitude": 1,
            "tags": ["outdoors"],
            "type": "museum",
            "rating": 5,
        },
        {"id": "missing", "name": "Missing", "latitude": 0, "tags": ["outdoors"]},
    ]
    path = tmp_path / "places.json"
    path.write_text(json.dumps(records))
    repository = PlaceRepository(path)
    monkeypatch.setattr("italy_agent.tools.repository", repository)
    return repository


def test_nearby_sorts_by_distance_then_id_and_excludes_origin_and_missing(repository):
    results = repository.nearby("origin")
    assert [result.place.id for result in results] == ["same", "near-a", "near-b", "far"]
    assert results[0].distance_km == 0
    assert [result.place.id for result in repository.nearby("origin", limit=2)] == [
        "same",
        "near-a",
    ]
    assert repository.nearby("origin", limit=0) == []
    results[0].place.name = "Modified"
    assert repository.get("same").name == "Same location"


def test_nearby_radius_is_inclusive(repository):
    boundary = calculate_distance_between_places(repository.get("origin"), repository.get("near-a"))
    assert len(repository.nearby("origin", boundary)) == 3
    assert len(repository.nearby("origin", boundary - 0.00001)) == 1
    assert [result.place.id for result in repository.nearby("origin", 0)] == ["same"]


def test_nearby_filters_before_limiting_with_search_semantics(repository):
    results = repository.nearby(
        "origin", tags=["LOCAL FAVORITE", "outdoors"], types=["PARK"], limit=1
    )
    assert [result.place.id for result in results] == ["near-a"]
    assert repository.nearby("origin", tags=["wine"]) == []
    assert len(repository.nearby("origin", tags=[], types=[])) == 4


@pytest.mark.parametrize(
    "arguments",
    [
        {"radius_km": -1},
        {"radius_km": float("nan")},
        {"radius_km": float("inf")},
        {"limit": -1},
    ],
)
def test_repository_rejects_invalid_nearby_arguments(repository, arguments):
    with pytest.raises(ValueError):
        repository.nearby("origin", **arguments)


@pytest.mark.parametrize(
    "tool, arguments, error",
    [
        (
            calculate_distance,
            {"origin_place_id": "unknown", "destination_place_id": "origin"},
            "Unknown place ID",
        ),
        (
            calculate_distance,
            {"origin_place_id": "origin", "destination_place_id": "missing"},
            "Missing coordinates",
        ),
        (find_nearby_places, {"place_id": "missing"}, "Missing coordinates"),
        (find_nearby_places, {"place_id": "unknown"}, "Unknown place ID"),
    ],
)
def test_geography_tools_return_recoverable_errors(repository, tool, arguments, error):
    result = tool.invoke({"type": "tool_call", "id": "geo", "name": tool.name, "args": arguments})
    assert result.status == "error"
    assert error in result.content


@pytest.mark.parametrize(
    "arguments",
    [
        {"radius_km": -1},
        {"radius_km": float("nan")},
        {"radius_km": float("inf")},
        {"limit": 0},
    ],
)
def test_nearby_tool_validates_arguments(repository, arguments):
    with pytest.raises(ValidationError):
        find_nearby_places.invoke({"place_id": "origin", **arguments})


def test_tools_return_authoritative_places_and_explicit_distance_units(repository):
    results = find_nearby_places.invoke({"place_id": "origin", "types": ["park"], "limit": 1})
    assert results[0]["place"] == repository.get("near-a").model_dump()
    distance = calculate_distance.invoke(
        {"origin_place_id": "origin", "destination_place_id": "near-a"}
    )
    assert distance == {
        "origin_place_id": "origin",
        "destination_place_id": "near-a",
        "distance_km": results[0]["distance_km"],
        "method": "haversine",
    }


def test_agent_can_find_and_measure_a_nearby_alternative(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key-not-used")
    monkeypatch.setenv("LANGSMITH_TRACING", "false")
    monkeypatch.setenv("ITALY_AGENT_MODEL", "openai:gpt-5-mini")
    from italy_agent.graph import graph

    def generate(self, messages, **kwargs):
        latest = messages[-1]
        if latest.type == "human":
            response = AIMessage(
                content="",
                tool_calls=[
                    {
                        "id": "nearby",
                        "name": "find_nearby_places",
                        "args": {"place_id": "place_001", "radius_km": 10, "limit": 1},
                    }
                ],
            )
        elif latest.name == "find_nearby_places":
            candidate = json.loads(latest.content)[0]
            response = AIMessage(
                content="",
                tool_calls=[
                    {
                        "id": "distance",
                        "name": "calculate_distance",
                        "args": {
                            "origin_place_id": "place_001",
                            "destination_place_id": candidate["place"]["id"],
                        },
                    }
                ],
            )
        else:
            distance = json.loads(latest.content)
            response = AIMessage(
                content=f"The alternative is {distance['distance_km']:.1f} km in a straight line."
            )
        return ChatResult(generations=[ChatGeneration(message=response)])

    monkeypatch.setattr(ChatOpenAI, "_generate", generate)
    result = graph.invoke(
        {"messages": [{"role": "user", "content": "Find an alternative near place_001."}]}
    )
    tool_results = [message for message in result["messages"] if isinstance(message, ToolMessage)]
    assert [message.name for message in tool_results] == [
        "find_nearby_places",
        "calculate_distance",
    ]
    nearby = json.loads(tool_results[0].content)[0]
    distance = json.loads(tool_results[1].content)
    assert nearby["place"] == PlaceRepository().get(nearby["place"]["id"]).model_dump()
    assert 0 <= distance["distance_km"] <= 10
    assert distance["distance_km"] == nearby["distance_km"]
