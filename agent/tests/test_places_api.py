from starlette.testclient import TestClient

from italy_agent.api import app
from italy_agent.repository import repository


def test_place_endpoint_returns_the_agents_normalized_record():
    with TestClient(app) as client:
        response = client.get("/places/place_010")
    assert response.status_code == 200
    assert response.json() == repository.get("place_010").model_dump()
    assert response.json()["name"] == "Vatican Museums"
    assert response.json()["price_range"] == "€€"
    assert response.headers["cache-control"] == "no-store"


def test_place_endpoint_rejects_unknown_and_malformed_ids():
    with TestClient(app) as client:
        for place_id in ["place_999", "place_nope", "invalid"]:
            response = client.get(f"/places/{place_id}")
            assert response.status_code == 404
            assert response.json() == {"code": "place_not_found", "error": "Place not found."}
