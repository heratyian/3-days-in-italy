"""Normalized place data, without inferring missing travel information."""

import re
from typing import Any, Literal, Self

from ftfy import fix_text
from pydantic import AliasChoices, BaseModel, Field, field_validator, model_validator


def normalize_label(value: str) -> str:
    return re.sub(r"[\s_-]+", "-", fix_text(value).strip().casefold())


class Place(BaseModel):
    """A dataset place with its source ID and no inferred travel information.

    Optional values remain None; missing/null tags become an empty list.
    Text is stripped and repaired with ftfy, and tags are deduplicated into
    lowercase hyphenated labels (e.g. local_favorite becomes local-favorite).
    Source hours and duration_minutes are accepted as aliases for opening_hours
    and typical_duration_minutes. Hours remain uninterpreted text.
    """

    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    type: str | None = None
    city: str | None = None
    region: str | None = None
    neighborhood: str | None = None
    description: str | None = None
    tags: list[str] = Field(default_factory=list)
    rating: float | None = Field(default=None, ge=0, le=5)
    price_range: str | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    typical_duration_minutes: int | None = Field(
        default=None,
        gt=0,
        validation_alias=AliasChoices("typical_duration_minutes", "duration_minutes"),
    )
    # The supplied hours are free text; parsing them belongs to validation.
    opening_hours: str | None = Field(
        default=None,
        validation_alias=AliasChoices("opening_hours", "hours"),
    )
    seasonal_notes: str | None = None
    booking_required: bool | None = None

    @field_validator("*", mode="before")
    @classmethod
    def clean_text(cls, value: Any) -> Any:
        return (fix_text(value).strip() or None) if isinstance(value, str) else value

    @field_validator("tags", mode="before")
    @classmethod
    def replace_null_tags(cls, value: Any) -> Any:
        return [] if value is None else value

    @field_validator("tags")
    @classmethod
    def normalize_tags(cls, tags: list[str]) -> list[str]:
        return list(dict.fromkeys(normalize_label(tag) for tag in tags if tag.strip()))


class DistanceResult(BaseModel):
    """Straight-line geographic estimate, never a route length or travel time."""

    origin_place_id: str
    destination_place_id: str
    distance_km: float = Field(ge=0)
    method: Literal["haversine"] = "haversine"


class NearbyPlace(BaseModel):
    """An authoritative candidate and its Haversine distance from the origin."""

    place: Place
    distance_km: float = Field(ge=0)


class TravelerPreferences(BaseModel):
    """Persistent trip preferences; day/stop-specific requests stay on the plan.

    Unstated preferences remain empty or None. For partial updates, only
    explicitly supplied fields replace existing values; lists replace in full.
    """

    interests: list[str] = Field(default_factory=list)
    avoid: list[str] = Field(default_factory=list)
    preferred_cities: list[str] = Field(default_factory=list)
    preferred_regions: list[str] = Field(default_factory=list)
    budget: str | None = None
    pace: Literal["relaxed", "moderate", "packed"] | None = None
    food_preferences: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class ItineraryStop(BaseModel):
    """A proposed visit. Times are local HH:MM text, or None if unscheduled.

    Visits must end later on the same day; 24:00 is allowed as an end time.
    The validator checks scheduling and dataset constraints before saving.
    """

    place_id: str = Field(min_length=1)
    start_time: str | None = None
    end_time: str | None = None
    reason: str | None = None
    warnings: list[str] = Field(default_factory=list)


class ItineraryDay(BaseModel):
    day: int = Field(ge=1, le=3)
    title: str | None = None
    city_or_region: str | None = None
    stops: list[ItineraryStop]


class Itinerary(BaseModel):
    """A complete three-day plan ordered by day number; empty days are allowed."""

    days: list[ItineraryDay] = Field(min_length=3, max_length=3)

    @model_validator(mode="after")
    def check_day_numbers(self) -> Self:
        if [day.day for day in self.days] != [1, 2, 3]:
            raise ValueError("Itinerary must contain days 1, 2, and 3 in order")
        return self


class ValidationIssue(BaseModel):
    severity: Literal["error", "warning"]
    code: str
    message: str
    day: int | None = None
    place_id: str | None = None


class ValidationResult(BaseModel):
    """Valid means no errors; warnings still require the traveler's attention."""

    valid: bool
    issues: list[ValidationIssue] = Field(default_factory=list)
