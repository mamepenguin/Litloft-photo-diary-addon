"""Photo Diary: the current drive's photos by capture date and by place, and a note per date.

Everything here reads the core's ``files`` and ``file_exif`` tables; the addon
owns no table and writes nothing.
"""

import os
import re
import unicodedata
from dataclasses import dataclass
from datetime import date as calendar_date
from pathlib import Path
from typing import Literal
from urllib.parse import unquote

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.responses import FileResponse
from sqlalchemy import and_, case, false, func, or_, select
from sqlalchemy.orm import Session

import app.config as config
from app.auth import check_drive_access, get_unlocked_groups
from app.database import get_db
from app.models import (
    Collection,
    CollectionItem,
    File,
    FileExif,
    Tag,
    active_file_filter,
    file_tags,
)
from app.routers.drives import filtered_drive_files

from .schemas import (
    CalendarDaysResponse,
    CalendarMonthsResponse,
    DayCount,
    MapConfig,
    MemberFileIds,
    MonthCount,
    NoteResponse,
    PhotoIdsResponse,
    Point,
    PointsResponse,
    ShelfEntry,
    ShelfResponse,
    ShelvesResponse,
)

ADDON_META = {
    "label": "Photo Diary",
    "description": "Browse your photos as a library, on a calendar and on a map.",
    "scope": "drive",
    "href": "/addons/photo_diary",
    "navigation": {
        "label": "Photo Diary",
        "i18n_key": "photoDiary.nav.label",
        "icon": "images",
        "placement": "primary",
        "priority": 30,
    },
}

router = APIRouter(prefix="/api/addons/photo_diary", tags=["photo_diary"])

_ASSETS_DIR = Path(__file__).resolve().parent / "assets"
_ASSET_TYPES = {
    ".js": "text/javascript",
    ".css": "text/css",
    ".txt": "text/plain",
    ".pbf": "application/x-protobuf",
}
_ASSETS = {
    p.name: p
    for p in _ASSETS_DIR.iterdir()
    if p.is_file() and p.suffix in _ASSET_TYPES
}

DEFAULT_TILE_URL = "https://vector.openstreetmap.org/shortbread_v1/{z}/{x}/{y}.mvt"
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


@dataclass(frozen=True)
class _Target:
    search: str | None
    tag: list[str] | None
    folder: list[str] | None
    collection: list[str] | None
    size: list[str] | None
    favorite: bool | None
    liked: bool | None
    none: bool

    def given(self) -> bool:
        return bool(
            self.search
            or self.tag
            or self.folder
            or self.collection
            or self.size
            or self.favorite is not None
            or self.liked is not None
        )


def _target(
    search: str | None = Query(default=None, max_length=200),
    tag: list[str] | None = Query(default=None),
    folder: list[str] | None = Query(default=None),
    collection: list[str] | None = Query(default=None),
    size: list[str] | None = Query(default=None),
    favorite: bool | None = Query(default=None),
    liked: bool | None = Query(default=None),
    none: bool = Query(default=False),
) -> _Target:
    target = _Target(search, tag, folder, collection, size, favorite, liked, none)
    if target.none and target.given():
        raise HTTPException(status_code=422, detail="none excludes a target")
    return target


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


def _photo_query(
    db: Session,
    drive: str,
    target: _Target | None,
    file_ids: list[str] | None = None,
):
    query = _photos(drive)
    if target is not None:
        if target.none:
            return query.where(false())
        if target.given():
            listing, _ = filtered_drive_files(
                db,
                drive,
                search=target.search,
                favorite=target.favorite,
                liked=target.liked,
                tag=target.tag,
                type=["image"],
                folder=target.folder,
                collection=target.collection,
                size=target.size,
            )
            query = query.where(File.id.in_(listing.with_entities(File.id)))
    # ``[]`` must select nothing: testing truthiness here would fall back to
    # the whole drive.
    if file_ids is not None:
        query = query.where(File.id.in_(file_ids))
    return query


# A member set carries no target of its own, so the POST routes never declare
# these: a declared one would be parsed as a target rather than refused.
_TARGET_PARAMETERS = frozenset(
    {"search", "tag", "folder", "collection", "size", "favorite", "liked", "none"}
)


def _no_target_parameters(request: Request) -> None:
    if _TARGET_PARAMETERS.intersection(request.query_params):
        raise HTTPException(
            status_code=422, detail="A member set takes no target query parameter"
        )


def _library_tag_parameters(request: Request) -> list[str]:
    if (_TARGET_PARAMETERS - {"tag"}).intersection(request.query_params):
        raise HTTPException(
            status_code=422, detail="A member set takes no target query parameter"
        )
    tags = request.query_params.getlist("tag")
    if any(not tag for tag in tags):
        raise HTTPException(status_code=422, detail="tag must not be empty")
    return tags


def _tagged(db: Session, drive: str, query, tags: list[str]):
    """Narrow a member set by the same tag predicate the listing's GET applies."""
    if not tags:
        return query
    listing, _ = filtered_drive_files(db, drive, tag=tags, type=["image"])
    return query.where(File.id.in_(listing.with_entities(File.id)))


def _count(db: Session, query) -> int:
    return db.scalar(select(func.count()).select_from(query.subquery())) or 0


# ---------------------------------------------------------------- library

ShelfBy = Literal["month", "tag", "collection", "folder", "all"]
ShelfSort = Literal["newest", "oldest"]

ALL = "all"

UNDATED = "undated"
NO_TAG = "no_tag"
NO_COLLECTION = "no_collection"
_MONTH_KEY = re.compile(_MONTH_PATTERN)

_MONTH = func.substr(_DAY, 1, 7)
_CAPTURE = case((_IS_DATED, FileExif.datetime_original), else_=None)


def _dated(column):
    return case((_IS_DATED, column), else_=None)


def _undated(column):
    return case((_IS_DATED, None), else_=column)


def _capture_order(sort: str):
    """Dated photos by the sort, then undated ones by name in both sorts."""
    if sort == "oldest":
        return [
            _IS_DATED.desc(),
            _CAPTURE.asc(),
            File.filename.asc(),
            File.id.asc(),
        ]
    return [
        _IS_DATED.desc(),
        _CAPTURE.desc(),
        _dated(File.filename).desc(),
        _undated(File.filename).asc(),
        _dated(File.id).desc(),
        _undated(File.id).asc(),
    ]


def _text_order(text: str):
    normalized = unicodedata.normalize("NFC", text)
    return (normalized.casefold(), normalized, text)


def _tag_names(drive: str):
    return (
        select(file_tags.c.file_id.label("file_id"), Tag.name.label("name"))
        .select_from(file_tags.join(Tag, Tag.id == file_tags.c.tag_id))
        .where(Tag.drive == drive)
        .subquery()
    )


def _drive_tag_links(drive: str):
    return (
        select(file_tags.c.file_id)
        .select_from(file_tags.join(Tag, Tag.id == file_tags.c.tag_id))
        .where(Tag.drive == drive)
    )


def _collection_names(drive: str):
    return (
        select(
            CollectionItem.file_id.label("file_id"),
            Collection.id.label("collection_id"),
            Collection.name.label("name"),
        )
        .join(Collection, Collection.id == CollectionItem.collection_id)
        .where(Collection.drive == drive)
        .subquery()
    )


def _drive_collection_links(drive: str):
    return (
        select(CollectionItem.file_id)
        .join(Collection, Collection.id == CollectionItem.collection_id)
        .where(Collection.drive == drive)
    )


def _folder_base(counts) -> str:
    """The deepest folder every matching photo lies under, with none at it."""
    base = ""
    while base not in counts:
        children = set()
        for folder in counts:
            if base:
                children.add(folder[len(base) + 1:].split("/", 1)[0])
            else:
                children.add(folder.split("/", 1)[0])
        if len(children) != 1:
            return base
        segment = children.pop()
        base = f"{base}/{segment}" if base else segment
    return base


def _folder_shelf_key(base: str, folder: str) -> str:
    if folder == base:
        return f"{base}/" if base else ""
    rest = folder[len(base) + 1:] if base else folder
    segment = rest.split("/", 1)[0]
    return f"{base}/{segment}" if base else segment


def _folder_label(key: str) -> str:
    folder = key.rstrip("/")
    return folder.rsplit("/", 1)[-1] if folder else ""


def _shelf_filter(by: str, key: str, drive: str):
    if by == "month":
        if key == UNDATED:
            return ~_IS_DATED
        return and_(_IS_DATED, _MONTH == key)
    if by == "tag":
        if key == NO_TAG:
            return File.id.not_in(_drive_tag_links(drive))
        return File.id.in_(_drive_tag_links(drive).where(Tag.name == key))
    if key == NO_COLLECTION:
        return File.id.not_in(_drive_collection_links(drive))
    return File.id.in_(_drive_collection_links(drive).where(Collection.id == key))


def _shelf_label(by: str, key: str, name: str = "") -> str:
    if by == "tag":
        return "" if key == NO_TAG else key
    if by == "collection":
        return "" if key == NO_COLLECTION else name
    if by == "folder":
        return _folder_label(key)
    return ""


def _dated_order(keys, dates: dict[str, str], sort: str, label) -> list[str]:
    """Shelves by their capture date, all-undated ones after, ties by label."""
    keys = list(keys)
    dated = sorted((key for key in keys if dates.get(key)), key=label)
    dated.sort(key=lambda key: dates[key], reverse=sort == "newest")
    undated = sorted((key for key in keys if not dates.get(key)), key=label)
    return dated + undated


def _shelf_ids(
    db: Session,
    base,
    drive: str,
    by: str,
    key: str,
    sort: str,
    limit: int,
    offset: int,
    folder_paths: list[str] | None = None,
) -> list[str]:
    if by == "folder":
        query = base.where(File.folder_path.in_(folder_paths or []))
    else:
        query = base.where(_shelf_filter(by, key, drive))
    return list(
        db.scalars(query.order_by(*_capture_order(sort)).limit(limit).offset(offset))
    )


def _month_shelves(db: Session, base, sort: str) -> tuple[dict, list[str]]:
    key_expr = case((_IS_DATED, _MONTH), else_=UNDATED)
    counts = dict(
        db.execute(
            base.with_only_columns(
                key_expr, func.count(func.distinct(File.id))
            ).group_by(key_expr)
        ).all()
    )
    months = sorted((key for key in counts if key != UNDATED), reverse=sort == "newest")
    if UNDATED in counts:
        months.append(UNDATED)
    return counts, months


def _tag_shelves(db: Session, base, drive: str) -> tuple[dict, list[str]]:
    names = _tag_names(drive)
    grouped = base.outerjoin(names, names.c.file_id == File.id)
    key_expr = func.coalesce(names.c.name, NO_TAG)
    counts = dict(
        db.execute(
            grouped.with_only_columns(
                key_expr, func.count(func.distinct(File.id))
            ).group_by(key_expr)
        ).all()
    )
    ordered = sorted(
        (key for key in counts if key != NO_TAG),
        key=lambda key: (-counts[key], _text_order(key)),
    )
    if counts.get(NO_TAG):
        ordered.append(NO_TAG)
    return counts, ordered


def _collection_shelves(db: Session, base, drive: str, sort: str):
    names = _collection_names(drive)
    grouped = base.outerjoin(names, names.c.file_id == File.id)
    key_expr = func.coalesce(names.c.collection_id, NO_COLLECTION)
    rows = db.execute(
        grouped.with_only_columns(
            key_expr,
            func.count(func.distinct(File.id)),
            func.max(_CAPTURE),
            func.min(_CAPTURE),
        ).group_by(key_expr)
    ).all()
    counts = {key: count for key, count, _high, _low in rows}
    dates = {
        key: (high if sort == "newest" else low)
        for key, _count, high, low in rows
    }
    labels = dict(
        db.execute(
            select(Collection.id, Collection.name).where(Collection.drive == drive)
        ).all()
    )
    ordered = _dated_order(
        (key for key in counts if key != NO_COLLECTION),
        dates,
        sort,
        lambda key: (_text_order(labels.get(key, "")), key),
    )
    if NO_COLLECTION in counts:
        ordered.append(NO_COLLECTION)
    return counts, ordered, labels


def _folder_shelves(db: Session, base, sort: str):
    """Group the photos' stored folders in Python, where NFC can be applied."""
    rows = db.execute(
        base.with_only_columns(
            File.folder_path,
            func.count(func.distinct(File.id)),
            func.max(_CAPTURE),
            func.min(_CAPTURE),
        ).group_by(File.folder_path)
    ).all()
    counts: dict[str, int] = {}
    paths: dict[str, list[str]] = {}
    newest: dict[str, str] = {}
    oldest: dict[str, str] = {}
    for path, count, high, low in rows:
        folder = unicodedata.normalize("NFC", path)
        counts[folder] = counts.get(folder, 0) + count
        paths.setdefault(folder, []).append(path)
        if high is not None:
            newest[folder] = max(newest.get(folder, high), high)
        if low is not None:
            oldest[folder] = min(oldest.get(folder, low), low)

    root = _folder_base(counts)
    shelf_counts: dict[str, int] = {}
    shelf_paths: dict[str, list[str]] = {}
    shelf_newest: dict[str, str] = {}
    shelf_oldest: dict[str, str] = {}
    for folder, count in counts.items():
        key = _folder_shelf_key(root, folder)
        shelf_counts[key] = shelf_counts.get(key, 0) + count
        shelf_paths.setdefault(key, []).extend(paths[folder])
        if folder in newest:
            shelf_newest[key] = max(shelf_newest.get(key, newest[folder]), newest[folder])
        if folder in oldest:
            shelf_oldest[key] = min(shelf_oldest.get(key, oldest[folder]), oldest[folder])
    dates = shelf_newest if sort == "newest" else shelf_oldest
    ordered = _dated_order(
        shelf_counts,
        dates,
        sort,
        lambda key: (_text_order(_folder_label(key)), key),
    )
    return shelf_counts, ordered, shelf_paths


def _folder_paths(db: Session, base, key: str) -> list[str]:
    normalized = unicodedata.normalize("NFC", key)
    exact = normalized[:-1] if normalized.endswith("/") else normalized
    prefix = f"{exact}/" if normalized and not normalized.endswith("/") else None
    wanted = []
    for path in db.scalars(base.with_only_columns(File.folder_path).distinct()):
        folder = unicodedata.normalize("NFC", path)
        if folder == exact or (prefix is not None and folder.startswith(prefix)):
            wanted.append(path)
    return wanted


def _shelves(
    db: Session,
    base,
    drive: str,
    by: str,
    sort: str,
    per_shelf: int,
    shelf_limit: int,
    offset: int,
) -> ShelvesResponse:
    if by == "all":
        # One shelf whenever the conditions select a photo; its photos page
        # through /library/shelf, not through the shelf list's offset.
        count = _count(db, base)
        if count == 0:
            return ShelvesResponse(shelves=[], total_shelves=0)
        return ShelvesResponse(
            shelves=[
                ShelfEntry(
                    key=ALL,
                    label="",
                    count=count,
                    file_ids=list(
                        db.scalars(
                            base.order_by(*_capture_order(sort)).limit(per_shelf)
                        )
                    ),
                )
            ],
            total_shelves=1,
        )
    labels: dict[str, str] = {}
    folder_paths: dict[str, list[str]] = {}
    if by == "month":
        counts, ordered = _month_shelves(db, base, sort)
    elif by == "tag":
        counts, ordered = _tag_shelves(db, base, drive)
    elif by == "collection":
        counts, ordered, labels = _collection_shelves(db, base, drive, sort)
    else:
        counts, ordered, folder_paths = _folder_shelves(db, base, sort)
    page = ordered[offset : offset + shelf_limit]
    return ShelvesResponse(
        shelves=[
            ShelfEntry(
                key=key,
                label=_shelf_label(by, key, labels.get(key, "")),
                count=counts[key],
                file_ids=_shelf_ids(
                    db,
                    base,
                    drive,
                    by,
                    key,
                    sort,
                    per_shelf,
                    0,
                    folder_paths.get(key),
                ),
            )
            for key in page
        ],
        total_shelves=len(ordered),
    )


@router.get("/library/shelves", response_model=ShelvesResponse)
def library_shelves(
    by: ShelfBy = Query(...),
    sort: ShelfSort = Query("newest"),
    per_shelf: int = Query(12, ge=1, le=20),
    shelf_limit: int = Query(12, ge=1, le=50),
    offset: int = Query(0, ge=0),
    drive: str = Depends(_drive_scope),
    target: _Target = Depends(_target),
    db: Session = Depends(get_db),
):
    return _shelves(
        db,
        _photo_query(db, drive, target),
        drive,
        by,
        sort,
        per_shelf,
        shelf_limit,
        offset,
    )


@router.post("/library/shelves", response_model=ShelvesResponse)
def library_shelves_post(
    body: MemberFileIds,
    by: ShelfBy = Query(...),
    sort: ShelfSort = Query("newest"),
    per_shelf: int = Query(12, ge=1, le=20),
    shelf_limit: int = Query(12, ge=1, le=50),
    offset: int = Query(0, ge=0),
    drive: str = Depends(_drive_scope),
    tags: list[str] = Depends(_library_tag_parameters),
    db: Session = Depends(get_db),
):
    return _shelves(
        db,
        _tagged(db, drive, _photo_query(db, drive, None, body.file_ids), tags),
        drive,
        by,
        sort,
        per_shelf,
        shelf_limit,
        offset,
    )


def _shelf(
    db: Session,
    base,
    drive: str,
    by: str,
    key: str,
    sort: str,
    limit: int,
    offset: int,
) -> ShelfResponse:
    if by == "all":
        if key != ALL:
            raise HTTPException(status_code=422, detail="by=all takes only key=all")
        query = base
        label = ""
    elif by == "folder":
        query = base.where(File.folder_path.in_(_folder_paths(db, base, key)))
        label = _folder_label(key)
    else:
        if not key:
            raise HTTPException(status_code=422, detail="key is empty")
        if by == "month" and key != UNDATED and not _MONTH_KEY.match(key):
            raise HTTPException(
                status_code=422, detail="month key must be YYYY-MM or undated"
            )
        query = base.where(_shelf_filter(by, key, drive))
        name = ""
        if by == "collection" and key != NO_COLLECTION:
            name = db.scalar(
                select(Collection.name).where(
                    Collection.drive == drive, Collection.id == key
                )
            ) or ""
        label = _shelf_label(by, key, name)
    ids = db.scalars(
        query.order_by(*_capture_order(sort)).limit(limit).offset(offset)
    ).all()
    return ShelfResponse(file_ids=list(ids), total=_count(db, query), label=label)


@router.get("/library/shelf", response_model=ShelfResponse)
def library_shelf(
    by: ShelfBy = Query(...),
    key: str = Query(...),
    sort: ShelfSort = Query("newest"),
    limit: int = Query(40, ge=1, le=100),
    offset: int = Query(0, ge=0),
    drive: str = Depends(_drive_scope),
    target: _Target = Depends(_target),
    db: Session = Depends(get_db),
):
    return _shelf(
        db,
        _photo_query(db, drive, target),
        drive,
        by,
        key,
        sort,
        limit,
        offset,
    )


@router.post("/library/shelf", response_model=ShelfResponse)
def library_shelf_post(
    body: MemberFileIds,
    by: ShelfBy = Query(...),
    key: str = Query(...),
    sort: ShelfSort = Query("newest"),
    limit: int = Query(40, ge=1, le=100),
    offset: int = Query(0, ge=0),
    drive: str = Depends(_drive_scope),
    tags: list[str] = Depends(_library_tag_parameters),
    db: Session = Depends(get_db),
):
    return _shelf(
        db,
        _tagged(db, drive, _photo_query(db, drive, None, body.file_ids), tags),
        drive,
        by,
        key,
        sort,
        limit,
        offset,
    )


# GLOB is case-sensitive and LIKE is not, so `2026-11-01.MD` and a differently
# cased folder stay outside. The folder name is part of the data on disk.
NOTE_FOLDER = "Photo Diary"
_NOTE_PREFIX = f"{NOTE_FOLDER}/"
_DATE_GLOB = "[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]"
_NOTE_DATE = func.substr(File.file_path, len(_NOTE_PREFIX) + 1, 10)


def _note_path(date: str) -> str:
    return f"{_NOTE_PREFIX}{date}.md"


def _note_dates(drive: str, glob_date: str = _DATE_GLOB):
    """Dates of active notes: the name is a real date, and the file has text."""
    return (
        select(_NOTE_DATE)
        .where(
            File.drive == drive,
            File.file_path.op("GLOB")(_note_path(glob_date)),
            active_file_filter(),
            File.file_size > 0,
            func.date(_NOTE_DATE) == _NOTE_DATE,
            _NOTE_DATE >= "0001-01-01",
        )
    )


def _months(db: Session, base, drive: str) -> CalendarMonthsResponse:
    month = func.substr(_DAY, 1, 7)
    rows = db.execute(
        base.with_only_columns(month, func.count()).where(_IS_DATED).group_by(month)
    ).all()
    counts = {m: c for m, c in rows}
    for note_month in db.scalars(
        _note_dates(drive).with_only_columns(func.substr(_NOTE_DATE, 1, 7)).distinct()
    ):
        counts.setdefault(note_month, 0)
    undated = _count(db, base.where(~_IS_DATED))
    return CalendarMonthsResponse(
        months=[MonthCount(month=m, count=counts[m]) for m in sorted(counts, reverse=True)],
        undated_count=undated,
    )


@router.get("/calendar/months", response_model=CalendarMonthsResponse)
def calendar_months(
    drive: str = Depends(_drive_scope),
    target: _Target = Depends(_target),
    db: Session = Depends(get_db),
):
    return _months(db, _photo_query(db, drive, target), drive)


@router.post("/calendar/months", response_model=CalendarMonthsResponse)
def calendar_months_post(
    body: MemberFileIds,
    drive: str = Depends(_drive_scope),
    _members: None = Depends(_no_target_parameters),
    db: Session = Depends(get_db),
):
    return _months(db, _photo_query(db, drive, None, body.file_ids), drive)


def _days(db: Session, base, drive: str, month: str) -> CalendarDaysResponse:
    rows = db.execute(
        base.with_only_columns(_DAY, func.count())
        .where(_IS_DATED, func.substr(_DAY, 1, 7) == month)
        .group_by(_DAY)
    ).all()
    counts = {d: c for d, c in rows}
    noted = set(db.scalars(_note_dates(drive, f"{month}-[0-9][0-9]")))
    return CalendarDaysResponse(
        days=[
            DayCount(date=d, count=counts.get(d, 0), has_note=d in noted)
            for d in sorted(counts.keys() | noted)
        ]
    )


@router.get("/calendar/days", response_model=CalendarDaysResponse)
def calendar_days(
    month: str = Query(pattern=_MONTH_PATTERN),
    drive: str = Depends(_drive_scope),
    target: _Target = Depends(_target),
    db: Session = Depends(get_db),
):
    return _days(db, _photo_query(db, drive, target), drive, month)


@router.post("/calendar/days", response_model=CalendarDaysResponse)
def calendar_days_post(
    body: MemberFileIds,
    month: str = Query(pattern=_MONTH_PATTERN),
    drive: str = Depends(_drive_scope),
    _members: None = Depends(_no_target_parameters),
    db: Session = Depends(get_db),
):
    return _days(db, _photo_query(db, drive, None, body.file_ids), drive, month)


def _real_date(value: str) -> str:
    if _DATE_RE.match(value):
        try:
            calendar_date.fromisoformat(value)
            return value
        except ValueError:
            pass
    raise HTTPException(status_code=422, detail="date must be a real YYYY-MM-DD")


@router.get("/note", response_model=NoteResponse)
def note(
    date: str,
    drive: str = Depends(_drive_scope),
    db: Session = Depends(get_db),
):
    row = db.execute(
        select(File.id, File.deleted_at, File.missing_since, File.file_size).where(
            File.drive == drive, File.file_path == _note_path(_real_date(date))
        )
    ).first()
    if row is None:
        return NoteResponse(state="none", file_id=None)
    file_id, deleted_at, missing_since, size = row
    if deleted_at is not None:
        state = "trashed"
    elif missing_since is not None:
        state = "missing"
    else:
        state = "active" if size > 0 else "empty"
    return NoteResponse(state=state, file_id=file_id)


def _photo_page(
    db: Session,
    base,
    date: str | None,
    undated: bool,
    limit: int,
    offset: int,
) -> PhotoIdsResponse:
    if (date is None) == (not undated):
        raise HTTPException(
            status_code=422, detail="Give exactly one of date and undated=true"
        )
    query = base
    if date is not None:
        query = query.where(_IS_DATED, _DAY == _real_date(date))
        order = _DATED_ORDER
    else:
        query = query.where(~_IS_DATED)
        order = _UNDATED_ORDER
    ids = db.scalars(query.order_by(*order).limit(limit).offset(offset)).all()
    return PhotoIdsResponse(file_ids=list(ids), total=_count(db, query))


@router.get("/photos", response_model=PhotoIdsResponse)
def photos(
    date: str | None = None,
    undated: bool = False,
    limit: int = Query(default=40, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    drive: str = Depends(_drive_scope),
    target: _Target = Depends(_target),
    db: Session = Depends(get_db),
):
    return _photo_page(
        db, _photo_query(db, drive, target), date, undated, limit, offset
    )


@router.post("/photos", response_model=PhotoIdsResponse)
def photos_post(
    body: MemberFileIds,
    date: str | None = None,
    undated: bool = False,
    limit: int = Query(default=40, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    drive: str = Depends(_drive_scope),
    _members: None = Depends(_no_target_parameters),
    db: Session = Depends(get_db),
):
    return _photo_page(
        db, _photo_query(db, drive, None, body.file_ids), date, undated, limit, offset
    )


def _points(db: Session, base) -> PointsResponse:
    rows = db.execute(
        base.with_only_columns(
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


@router.get("/points", response_model=PointsResponse)
def points(
    drive: str = Depends(_drive_scope),
    target: _Target = Depends(_target),
    db: Session = Depends(get_db),
):
    return _points(db, _photo_query(db, drive, target))


@router.post("/points", response_model=PointsResponse)
def points_post(
    body: MemberFileIds,
    drive: str = Depends(_drive_scope),
    _members: None = Depends(_no_target_parameters),
    db: Session = Depends(get_db),
):
    return _points(db, _photo_query(db, drive, None, body.file_ids))


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
