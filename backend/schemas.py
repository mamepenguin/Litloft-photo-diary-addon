from typing import Literal

from pydantic import BaseModel


class MonthCount(BaseModel):
    month: str
    count: int


class CalendarMonthsResponse(BaseModel):
    months: list[MonthCount]
    undated_count: int


class DayCount(BaseModel):
    date: str
    count: int
    has_note: bool


class CalendarDaysResponse(BaseModel):
    days: list[DayCount]


class PhotoIdsResponse(BaseModel):
    file_ids: list[str]
    total: int


class Point(BaseModel):
    file_id: str
    lat: float
    lon: float
    taken_at: str | None


class PointsResponse(BaseModel):
    points: list[Point]


class MapConfig(BaseModel):
    tile_url: str
    attribution: str


class NoteResponse(BaseModel):
    state: Literal["none", "empty", "active", "trashed", "missing"]
    file_id: str | None
