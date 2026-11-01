"""Photo Diary: the current drive's photos by capture date and by place.

Everything here reads the core's ``files`` and ``file_exif`` tables; the addon
owns no table and writes nothing.
"""

import os
import re
from datetime import date as calendar_date
from pathlib import Path
from urllib.parse import unquote

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.responses import FileResponse
from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.orm import Session

import app.config as config
from app.auth import check_drive_access, get_unlocked_groups
from app.database import get_db
from app.models import File, FileExif, active_file_filter

from .schemas import (
    CalendarDaysResponse,
    CalendarMonthsResponse,
    DayCount,
    MapConfig,
    MonthCount,
    PhotoIdsResponse,
    Point,
    PointsResponse,
)

ADDON_META = {
    "label": "Photo Diary",
    "description": "Look back at your photos on a calendar and a map.",
    "scope": "drive",
    "href": "/addons/photo_diary",
    "navigation": {
        "label": "Photo Diary",
        "i18n_key": "photoDiary.nav.label",
        "placement": "primary",
        "priority": 30,
    },
}

router = APIRouter(prefix="/api/addons/photo_diary", tags=["photo_diary"])

_ASSETS_DIR = Path(__file__).resolve().parent / "assets"
_ASSET_TYPES = {".js": "text/javascript", ".css": "text/css", ".txt": "text/plain"}
_ASSETS = {
    p.name: p
    for p in _ASSETS_DIR.iterdir()
    if p.is_file() and p.suffix in _ASSET_TYPES
}

DEFAULT_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
DEFAULT_ATTRIBUTION = (
    '<a href="https://www.openstreetmap.org/copyright">'
    "© OpenStreetMap contributors</a>"
)


def _read_tile_config() -> MapConfig:
    url = os.environ.get("PHOTO_DIARY_TILE_URL", "")
    if not url:
        return MapConfig(tile_url=DEFAULT_TILE_URL, attribution=DEFAULT_ATTRIBUTION)
    return MapConfig(
        tile_url=url, attribution=os.environ.get("PHOTO_DIARY_TILE_ATTRIBUTION", "")
    )


# Read once: a change to the variables takes effect on restart.
_TILE_CONFIG = _read_tile_config()

_MONTH_PATTERN = r"^[0-9]{4}-(0[1-9]|1[0-2])$"
_DATE_RE = re.compile(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$")


def _drive_scope(
    request: Request,
    x_lit_drive: str | None = Header(default=None),
) -> str:
    """Authorise the drive named by ``X-Lit-Drive`` for a data route.

    An in-process router is not behind the addon proxy, so each route runs
    this itself. A locked drive, an unknown drive and a policy that turns the
    addon off all answer one identical 404.
    """
    if not x_lit_drive:
        raise HTTPException(status_code=400, detail="Drive context required")
    drive = unquote(x_lit_drive)
    not_found = HTTPException(status_code=404, detail="Not found")
    try:
        check_drive_access(drive, get_unlocked_groups(request))
    except HTTPException:
        raise not_found from None
    if not config.is_addon_feature_enabled(drive, "photo_diary", "index"):
        raise not_found
    return drive


# The first 10 characters of datetime_original are the capture date when SQLite
# reads them back as the same calendar date. date() rewrites an impossible day
# such as 02-30, and returns NULL for 00 months or text, so equality rejects both.
_DAY = func.substr(FileExif.datetime_original, 1, 10)
_IS_DATED = case(
    (
        and_(
            FileExif.datetime_original.is_not(None),
            func.date(_DAY) == _DAY,
            _DAY >= "0001-01-01",
        ),
        True,
    ),
    else_=False,
)

_IS_LOCATED = and_(
    FileExif.gps_lat.is_not(None),
    FileExif.gps_lon.is_not(None),
    FileExif.gps_lat.between(-90, 90),
    FileExif.gps_lon.between(-180, 180),
    or_(FileExif.gps_lat != 0, FileExif.gps_lon != 0),
)

_DATED_ORDER = (FileExif.datetime_original, File.filename, File.id)
_UNDATED_ORDER = (File.filename, File.id)


def _photos(drive: str):
    return (
        select(File.id)
        .select_from(File)
        .outerjoin(FileExif, FileExif.file_id == File.id)
        .where(File.drive == drive, File.file_type == "image", active_file_filter())
    )


def _count(db: Session, query) -> int:
    return db.scalar(select(func.count()).select_from(query.subquery())) or 0


@router.get("/calendar/months", response_model=CalendarMonthsResponse)
def calendar_months(drive: str = Depends(_drive_scope), db: Session = Depends(get_db)):
    month = func.substr(_DAY, 1, 7)
    rows = db.execute(
        _photos(drive)
        .with_only_columns(month, func.count())
        .where(_IS_DATED)
        .group_by(month)
        .order_by(month.desc())
    ).all()
    undated = _count(db, _photos(drive).where(~_IS_DATED))
    return CalendarMonthsResponse(
        months=[MonthCount(month=m, count=c) for m, c in rows], undated_count=undated
    )


@router.get("/calendar/days", response_model=CalendarDaysResponse)
def calendar_days(
    month: str = Query(pattern=_MONTH_PATTERN),
    drive: str = Depends(_drive_scope),
    db: Session = Depends(get_db),
):
    rows = db.execute(
        _photos(drive)
        .with_only_columns(_DAY, func.count())
        .where(_IS_DATED, func.substr(_DAY, 1, 7) == month)
        .group_by(_DAY)
        .order_by(_DAY)
    ).all()
    return CalendarDaysResponse(days=[DayCount(date=d, count=c) for d, c in rows])


def _real_date(value: str) -> str:
    if _DATE_RE.match(value):
        try:
            calendar_date.fromisoformat(value)
            return value
        except ValueError:
            pass
    raise HTTPException(status_code=422, detail="date must be a real YYYY-MM-DD")


@router.get("/photos", response_model=PhotoIdsResponse)
def photos(
    date: str | None = None,
    undated: bool = False,
    limit: int = Query(default=40, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    drive: str = Depends(_drive_scope),
    db: Session = Depends(get_db),
):
    if (date is None) == (not undated):
        raise HTTPException(
            status_code=422, detail="Give exactly one of date and undated=true"
        )
    if date is not None:
        query = _photos(drive).where(_IS_DATED, _DAY == _real_date(date))
        order = _DATED_ORDER
    else:
        query = _photos(drive).where(~_IS_DATED)
        order = _UNDATED_ORDER
    ids = db.scalars(query.order_by(*order).limit(limit).offset(offset)).all()
    return PhotoIdsResponse(file_ids=list(ids), total=_count(db, query))


@router.get("/points", response_model=PointsResponse)
def points(drive: str = Depends(_drive_scope), db: Session = Depends(get_db)):
    rows = db.execute(
        _photos(drive)
        .with_only_columns(
            File.id,
            FileExif.gps_lat,
            FileExif.gps_lon,
            case((_IS_DATED, FileExif.datetime_original), else_=None),
        )
        .where(_IS_LOCATED)
        .order_by(
            _IS_DATED.desc(),
            case((_IS_DATED, FileExif.datetime_original), else_=None),
            File.filename,
            File.id,
        )
    ).all()
    return PointsResponse(
        points=[Point(file_id=i, lat=la, lon=lo, taken_at=t) for i, la, lo, t in rows]
    )


@router.get("/map-config", response_model=MapConfig)
def map_config(drive: str = Depends(_drive_scope)):
    return _TILE_CONFIG


@router.get("/assets/{file}")
def asset(file: str):
    path = _ASSETS.get(file)
    if path is None:
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(
        path,
        media_type=_ASSET_TYPES[path.suffix],
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )
