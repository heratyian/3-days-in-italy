"""Geographic estimates from dataset coordinates, without routing or travel times."""

from math import asin, cos, radians, sin, sqrt

from italy_agent.models import Place


def calculate_distance_between_places(origin: Place, destination: Place) -> float:
    """Return Haversine distance in km using a mean Earth radius of 6371.0088 km.

    Both places must have latitude and longitude. Missing coordinates raise
    ValueError with the place ID; city names are never used to infer location.
    """
    for place in (origin, destination):
        if place.latitude is None or place.longitude is None:
            raise ValueError(f"Missing coordinates for place ID: {place.id}")
    origin_latitude = radians(origin.latitude)
    destination_latitude = radians(destination.latitude)
    latitude_difference = destination_latitude - origin_latitude
    longitude_difference = radians(destination.longitude - origin.longitude)
    haversine = (
        sin(latitude_difference / 2) ** 2
        + cos(origin_latitude) * cos(destination_latitude)
        * sin(longitude_difference / 2) ** 2
    )
    # Floating-point rounding can push antipodal points just beyond 1.
    return 2 * 6371.0088 * asin(sqrt(min(1.0, max(0.0, haversine))))
