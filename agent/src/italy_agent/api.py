"""Place lookup mounted alongside LangGraph's standard routes."""

import re

from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

from italy_agent.repository import repository


async def get_place(request: Request) -> JSONResponse:
    """Return the same normalized record used by the agent, or 404."""
    place_id = request.path_params["place_id"]
    if not re.fullmatch(r"place_\d+", place_id):
        return JSONResponse({"code": "place_not_found", "error": "Place not found."}, status_code=404)
    try:
        place = repository.get(place_id)
    except KeyError:
        return JSONResponse({"code": "place_not_found", "error": "Place not found."}, status_code=404)
    return JSONResponse(place.model_dump(), headers={"Cache-Control": "no-store"})


app = Starlette(routes=[Route("/places/{place_id}", get_place, methods=["GET"])])
