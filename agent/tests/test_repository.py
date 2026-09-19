import json

import pytest
from pydantic import ValidationError

from italy_agent.models import Place
from italy_agent.repository import DEFAULT_DATA_PATH, PlaceRepository


@pytest.fixture
def repository(tmp_path):
    records = [
        {
            "id": "wine",
            "name": "Wine Garden",
            "city": "Florence",
            "region": "Tuscany",
            "type": "restaurant",
            "tags": ["wine", "local_favorite"],
            "description": "A quiet garden",
            "rating": 4.5,
            "price_range": "€€",
        },
        {
            "id": "museum",
            "name": "Museum",
            "city": "Rome",
            "region": "Lazio",
            "type": "museum",
            "tags": ["art"],
            "rating": 4.9,
            "price_range": "€",
        },
        {
            "id": "dinner",
            "name": "Wine Dinner",
            "city": "Florence",
            "region": "Tuscany",
            "type": "restaurant",
            "tags": ["wine", "food"],
            "rating": 4.8,
            "price_range": "€€€€",
        },
        {"id": "unknown", "name": "Unknown", "tags": ["wine"]},
        {"id": "another", "name": "Another", "rating": 4.5},
    ]
    path = tmp_path / "places.json"
    path.write_text(json.dumps(records), encoding="utf-8")
    return PlaceRepository(path)


def test_loads_supplied_dataset():
    source = json.loads(DEFAULT_DATA_PATH.read_text(encoding="utf-8"))
    repository = PlaceRepository()
    assert len(source) == 103
    assert {place.id for place in repository.search(limit=200)} == {row["id"] for row in source}
    colosseum = repository.get("place_001")
    assert colosseum.price_range == "€€"
    assert colosseum.typical_duration_minutes == 120
    assert colosseum.opening_hours == "9:00-19:00"
    assert colosseum.booking_required is True
    assert "—" in colosseum.description
    assert repository.search(tags=["wine"])
    assert all("wine" in place.tags for place in repository.search(tags=["wine"]))
    assert "local-favorite" in repository.get("place_100").tags
    assert repository.get("place_014").typical_duration_minutes is None


def test_normalization_preserves_uncertainty_without_mutating_source():
    record = {
        "id": "seasonal",
        "name": " Seasonal visit ",
        "tags": ["Local Favorite", "local_favorite"],
        "hours": "Morning only",
        "duration_minutes": None,
        "seasonal_notes": "October only",
        "booking_required": None,
    }
    place = Place.model_validate(record)
    assert place.name == "Seasonal visit"
    assert place.tags == ["local-favorite"]
    assert place.opening_hours == "Morning only"
    assert place.seasonal_notes == "October only"
    assert place.typical_duration_minutes is None
    assert place.booking_required is None
    assert record["name"] == " Seasonal visit "
    assert record["tags"] == ["Local Favorite", "local_favorite"]


def test_missing_optional_fields_and_null_tags():
    place = Place.model_validate({"id": "minimal", "name": "Minimal", "tags": None})
    assert place.tags == []
    assert place.latitude is None
    assert place.longitude is None
    assert place.rating is None
    assert place.price_range is None
    assert place.opening_hours is None


def test_already_correct_unicode_is_preserved():
    place = Place.model_validate({"id": "unicode", "name": "Caffè — Venezia", "price_range": "€€"})
    assert place.name == "Caffè — Venezia"
    assert place.price_range == "€€"


def test_repairs_mixed_unicode_and_garbled_text():
    place = Place(id="mixed", name="Caffè â€” Venezia", price_range="â‚¬â‚¬")
    assert place.name == "Caffè — Venezia"
    assert place.price_range == "€€"


def test_normalized_fields_survive_serialization():
    place = Place.model_validate(
        {
            "id": "visit",
            "name": "Visit",
            "duration_minutes": 90,
            "hours": "Morning only",
        }
    )
    restored = Place.model_validate(place.model_dump())
    assert restored.typical_duration_minutes == 90
    assert restored.opening_hours == "Morning only"


def test_combines_filters(repository):
    result = repository.search(
        cities=[" FLORENCE "],
        regions=["tuscany"],
        types=["Restaurant"],
        tags=["local favorite"],
        max_price="€€",
        min_rating=4.5,
    )
    assert [place.id for place in result] == ["wine"]
    assert repository.search(cities=["Rome"], tags=["wine"]) == []


def test_multiple_filter_values_are_alternatives(repository):
    assert {place.id for place in repository.search(tags=["wine", "art"])} == {
        "wine",
        "dinner",
        "museum",
        "unknown",
    }
    assert len(repository.search(cities=["Rome", "Florence"])) == 3


def test_price_and_rating_exclude_unknown_values(repository):
    assert {place.id for place in repository.search(max_price="€€")} == {"wine", "museum"}
    assert {place.id for place in repository.search(min_rating=4.8)} == {"museum", "dinner"}


def test_query_ranks_relevance_before_rating(repository):
    assert [place.id for place in repository.search(query="WINE garden")] == [
        "wine",
        "dinner",
        "unknown",
    ]
    assert repository.search(query="nonexistent") == []
    assert [place.id for place in repository.search(query="local_favorite")] == ["wine"]


def test_stable_order_limits_and_empty_filters(repository):
    expected = ["museum", "dinner", "another", "wine", "unknown"]
    assert [place.id for place in repository.search()] == expected
    assert [place.id for place in repository.search(query=" ", tags=[], cities=[])] == expected
    assert [place.id for place in repository.search(limit=2)] == expected[:2]
    assert repository.search(limit=0) == []


@pytest.mark.parametrize(
    "arguments",
    [
        {"limit": -1},
        {"max_price": "cheap"},
        {"min_rating": 6},
        {"min_rating": -1},
    ],
)
def test_invalid_search_arguments(repository, arguments):
    with pytest.raises(ValueError):
        repository.search(**arguments)


def test_unknown_id_has_clear_error(repository):
    with pytest.raises(KeyError, match="Unknown place ID: missing"):
        repository.get("missing")


def test_callers_cannot_mutate_authoritative_records(repository):
    place = repository.get("wine")
    place.tags.clear()
    result = repository.search(tags=["wine"])
    result[0].name = "Changed"
    assert repository.get("wine").tags == ["wine", "local-favorite"]
    assert repository.get(result[0].id).name != "Changed"


@pytest.mark.parametrize(
    ("records", "location"),
    [
        ({"places": []}, ()),
        ([None], (0,)),
        ([{"name": "Missing ID"}], (0, "id")),
        ([{"id": "bad", "name": "Bad coordinates", "latitude": 100}], (0, "latitude")),
        ([{"id": "bad", "name": "Bad tags", "tags": "wine"}], (0, "tags")),
    ],
)
def test_invalid_dataset_identifies_invalid_record_and_field(tmp_path, records, location):
    path = tmp_path / "invalid.json"
    path.write_text(json.dumps(records), encoding="utf-8")
    with pytest.raises(ValidationError) as error:
        PlaceRepository(path)
    assert error.value.errors()[0]["loc"] == location


def test_duplicate_ids_fail_with_context(tmp_path):
    path = tmp_path / "duplicates.json"
    path.write_text(
        json.dumps(
            [
                {"id": "same", "name": "One"},
                {"id": "same", "name": "Two"},
            ]
        ),
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="duplicate place ID 'same'"):
        PlaceRepository(path)


def test_missing_file_raises(tmp_path):
    with pytest.raises(FileNotFoundError):
        PlaceRepository(tmp_path / "missing.json")
