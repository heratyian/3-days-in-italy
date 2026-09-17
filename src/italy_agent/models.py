"""Normalized place data, without inferring missing travel information."""

import re
from typing import Any

from ftfy import fix_text
from pydantic import AliasChoices, BaseModel, Field, field_validator


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
        default=None, gt=0,
        validation_alias=AliasChoices("typical_duration_minutes", "duration_minutes"),
    )
    # The supplied hours are free text; parsing them belongs to validation.
    opening_hours: str | None = Field(
        default=None, validation_alias=AliasChoices("opening_hours", "hours"),
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
