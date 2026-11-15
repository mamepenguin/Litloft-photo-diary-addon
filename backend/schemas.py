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


class ShelfEntry(BaseModel):
    key: str
    label: str
    count: int
    file_ids: list[str]


class ShelvesResponse(BaseModel):
    shelves: list[ShelfEntry]
    total_shelves: int


class ShelfResponse(BaseModel):
    file_ids: list[str]
    total: int
    label: str


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
