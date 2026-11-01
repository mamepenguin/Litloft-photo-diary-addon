"""SPEC-PD-005: what counts as a note and what the addon's API says about notes (I1, I2, I3, I4)."""

import json
from pathlib import Path

import pytest

from .conftest import BASE, DRIVE, JA_DRIVE, OTHER_DRIVE, hdr

NOTE_FOLDER = "Photo Diary"
DATE = "2026-11-01"
MONTH = "2026-11"


def note(lib, date=DATE, drive=DRIVE, size=12, **kw):
    kw.setdefault("exif", False)
    return lib.add(drive=drive, filename=f"{date}.md", folder=NOTE_FOLDER, file_type="document", size=size, **kw)


def other_file(lib, folder, filename, drive=DRIVE, size=12):
    return lib.add(drive=drive, filename=filename, folder=folder, file_type="document", exif=False, size=size)


def read_note(client, date=DATE, drive=DRIVE):
    r = client.get(f"{BASE}/note", params={"date": date}, headers=hdr(drive))
    assert r.status_code == 200, r.text
    return r.json()


def months(client, drive=DRIVE):
    r = client.get(f"{BASE}/calendar/months", headers=hdr(drive))
    assert r.status_code == 200, r.text
    return r.json()


def days(client, month=MONTH, drive=DRIVE):
    r = client.get(f"{BASE}/calendar/days", params={"month": month}, headers=hdr(drive))
    assert r.status_code == 200, r.text
    return r.json()["days"]


def test_pd005_no_row_is_none_with_a_null_id(env):
    client, *_ = env
    assert read_note(client) == {"state": "none", "file_id": None}


@pytest.mark.parametrize(
    "kw, state",
    [
        pytest.param({"size": 0}, "empty", id="zero-bytes"),
        pytest.param({"size": 1}, "active", id="one-byte"),
        pytest.param({"size": 5_000_000}, "active", id="large"),
        pytest.param({"size": 12, "deleted": True}, "trashed", id="trashed-with-text"),
        pytest.param({"size": 0, "deleted": True}, "trashed", id="trashed-empty"),
        pytest.param({"size": 12, "missing": True}, "missing", id="missing-with-text"),
        pytest.param({"size": 0, "missing": True}, "missing", id="missing-empty"),
    ],
)
def test_pd005_note_state_and_id(env, kw, state):
    client, lib, *_ = env
    fid = note(lib, **kw)
    assert read_note(client) == {"state": state, "file_id": fid}


NOT_NOTES = [
    pytest.param("", "2026-11-01.md", id="drive-root"),
    pytest.param("Other", "2026-11-01.md", id="another-folder"),
    pytest.param("Other/Photo Diary", "2026-11-01.md", id="nested-note-folder"),
    pytest.param("Photo Diary/2026", "2026-11-01.md", id="subfolder"),
    pytest.param("photo diary", "2026-11-01.md", id="folder-other-case"),
    pytest.param("Photo Diary", "2026-11-01 (1).md", id="suffix"),
    pytest.param("Photo Diary", "2026-11-01.txt", id="txt"),
    pytest.param("Photo Diary", "2026-11-01.MD", id="upper-ext"),
    pytest.param("Photo Diary", "2026-11-01.md.md", id="double-ext"),
    pytest.param("Photo Diary", "x2026-11-01.md", id="prefix"),
    pytest.param("Photo Diary", "2026_11_01.md", id="like-wildcards"),
    pytest.param("Photo Diary", "20261101.md", id="no-dashes"),
    pytest.param("Photo Diary", "2026-11-1.md", id="short-day"),
    pytest.param("Photo Diary", "2026-11.md", id="month-only"),
]


@pytest.mark.parametrize("folder, filename", NOT_NOTES)
def test_i1_a_file_not_exactly_at_the_note_path_is_no_note(env, folder, filename):
    client, lib, *_ = env
    other_file(lib, folder, filename)
    assert read_note(client) == {"state": "none", "file_id": None}
    assert months(client)["months"] == []
    assert days(client) == []


@pytest.mark.parametrize(
    "filename, month",
    [
        pytest.param("2026-02-30.md", "2026-02", id="feb-30"),
        pytest.param("2025-02-29.md", "2025-02", id="feb-29-non-leap"),
        pytest.param("2026-11-31.md", MONTH, id="nov-31"),
        pytest.param("2026-13-01.md", None, id="month-13"),
        pytest.param("2026-00-10.md", None, id="month-0"),
    ],
)
def test_i1_a_note_path_for_a_non_real_date_is_no_note(env, filename, month):
    client, lib, *_ = env
    other_file(lib, NOTE_FOLDER, filename)
    assert read_note(client, "2026-11-02") == {"state": "none", "file_id": None}
    assert months(client)["months"] == []
    if month:
        assert days(client, month) == []


@pytest.mark.parametrize(
    "date",
    ["2024-02-29", "2026-01-01", "2026-12-31", "2099-01-01"],
    ids=["leap-day", "first-of-year", "last-of-year", "future"],
)
def test_pd005_a_real_date_is_a_note_at_the_month_boundaries(env, date):
    client, lib, *_ = env
    fid = note(lib, date)
    assert read_note(client, date) == {"state": "active", "file_id": fid}
    assert months(client)["months"] == [{"month": date[:7], "count": 0}]
    assert days(client, date[:7]) == [{"date": date, "count": 0, "has_note": True}]


def test_pd005_the_date_comes_only_from_the_name(env):
    client, lib, *_ = env
    note(lib, taken="2026-03-03T08:00:00", exif=True)
    assert read_note(client)["state"] == "active"
    assert read_note(client, "2026-03-03")["state"] == "none"
    assert months(client)["months"] == [{"month": MONTH, "count": 0}]
    assert days(client, "2026-03") == []


@pytest.mark.parametrize(
    "kw, state",
    [
        pytest.param({"size": 0}, "empty", id="empty"),
        pytest.param({"deleted": True}, "trashed", id="trashed"),
        pytest.param({"missing": True}, "missing", id="missing"),
    ],
)
def test_i3_a_row_that_is_not_a_note_gives_no_mark_and_no_month(env, kw, state):
    client, lib, *_ = env
    note(lib, **kw)
    assert read_note(client)["state"] == state
    assert months(client)["months"] == []
    assert days(client) == []


@pytest.mark.parametrize(
    "kw",
    [
        pytest.param({"size": 0}, id="empty"),
        pytest.param({"deleted": True}, id="trashed"),
        pytest.param({"missing": True}, id="missing"),
    ],
)
def test_i3_such_a_row_on_a_day_with_photos_leaves_has_note_false(env, kw):
    client, lib, *_ = env
    lib.add(taken=f"{DATE}T08:00:00")
    note(lib, **kw)
    assert days(client) == [{"date": DATE, "count": 1, "has_note": False}]
    assert months(client)["months"] == [{"month": MONTH, "count": 1}]


def test_i4_a_day_with_a_note_and_no_photos(env):
    client, lib, *_ = env
    note(lib)
    assert days(client) == [{"date": DATE, "count": 0, "has_note": True}]
    assert months(client) == {"months": [{"month": MONTH, "count": 0}], "undated_count": 0}


def test_i4_a_note_changes_no_photo_count_and_no_photo_route(env):
    client, lib, *_ = env
    a = lib.add(taken="2026-11-03T08:00:00", lat=35.0, lon=139.0)
    lib.add(taken="2026-10-03T08:00:00")
    lib.add(taken=None)

    def photo_routes():
        return {
            route: client.get(f"{BASE}{route}", headers=hdr()).json()
            for route in ("/photos?date=2026-11-03", f"/photos?date={DATE}", "/photos?undated=true", "/points")
        }

    before_routes = photo_routes()
    before_months = months(client)
    assert read_note(client)["state"] == "none"
    note(lib)
    assert read_note(client)["state"] == "active"

    assert photo_routes() == before_routes
    assert before_routes["/photos?date=2026-11-03"]["file_ids"] == [a]
    after = months(client)
    assert after["undated_count"] == before_months["undated_count"] == 1
    assert after["months"] == before_months["months"]
    assert days(client) == [
        {"date": DATE, "count": 0, "has_note": True},
        {"date": "2026-11-03", "count": 1, "has_note": False},
    ]


def test_pd005_a_day_with_photos_and_a_note_keeps_its_count_and_has_the_note(env):
    client, lib, *_ = env
    lib.add(taken=f"{DATE}T08:00:00")
    lib.add(taken=f"{DATE}T09:00:00")
    note(lib)
    assert days(client) == [{"date": DATE, "count": 2, "has_note": True}]
    assert months(client)["months"] == [{"month": MONTH, "count": 2}]


def test_pd005_note_months_merge_newest_first_and_days_oldest_first(env):
    client, lib, *_ = env
    lib.add(taken="2026-10-03T08:00:00")
    lib.add(taken="2026-08-20T08:00:00")
    note(lib, "2026-12-25")
    note(lib, "2026-09-09")
    note(lib, "2026-08-10")
    note(lib, "2026-08-31")
    assert months(client)["months"] == [
        {"month": "2026-12", "count": 0},
        {"month": "2026-10", "count": 1},
        {"month": "2026-09", "count": 0},
        {"month": "2026-08", "count": 1},
    ]
    assert days(client, "2026-08") == [
        {"date": "2026-08-10", "count": 0, "has_note": True},
        {"date": "2026-08-20", "count": 1, "has_note": False},
        {"date": "2026-08-31", "count": 0, "has_note": True},
    ]


def test_pd005_days_lists_only_the_requested_month(env):
    client, lib, *_ = env
    note(lib, "2026-10-31")
    note(lib, "2026-11-01")
    note(lib, "2026-12-01")
    assert [d["date"] for d in days(client, "2026-11")] == ["2026-11-01"]


def test_i2_a_note_is_reported_only_on_its_own_drive(env):
    client, lib, *_ = env
    mine = note(lib)
    assert read_note(client) == {"state": "active", "file_id": mine}
    assert read_note(client, drive=OTHER_DRIVE) == {"state": "none", "file_id": None}
    assert months(client, OTHER_DRIVE)["months"] == []
    assert days(client, drive=OTHER_DRIVE) == []


def test_i2_two_drives_with_the_same_note_path_each_report_their_own(env):
    client, lib, *_ = env
    mine = note(lib, size=12)
    theirs = note(lib, drive=OTHER_DRIVE, size=0)
    assert read_note(client) == {"state": "active", "file_id": mine}
    assert read_note(client, drive=OTHER_DRIVE) == {"state": "empty", "file_id": theirs}
    assert days(client) == [{"date": DATE, "count": 0, "has_note": True}]
    assert days(client, drive=OTHER_DRIVE) == []


def test_i2_percent_encoded_non_ascii_drive_reaches_its_own_note(env):
    client, lib, *_ = env
    fid = note(lib, drive=JA_DRIVE)
    assert read_note(client, drive=JA_DRIVE) == {"state": "active", "file_id": fid}
    assert read_note(client)["state"] == "none"


def _drive_dir(drives_json) -> Path:
    return Path(next(d["path"] for d in json.loads(drives_json.read_text()) if d["name"] == DRIVE))


def test_pd005_reading_about_notes_creates_nothing(env):
    client, _lib, drives_json, _auth = env
    assert read_note(client) == {"state": "none", "file_id": None}
    assert days(client) == []
    assert months(client)["months"] == []
    assert not (_drive_dir(drives_json) / NOTE_FOLDER).exists()
    assert client.get(f"/api/drives/{DRIVE}/files/by-path", params={"path": f"{NOTE_FOLDER}/{DATE}.md"}).status_code == 404


def test_pd007_a_note_started_through_the_core_is_empty_and_cannot_be_overwritten(env):
    client, _lib, drives_json, _auth = env
    body = {"path": f"{NOTE_FOLDER}/{DATE}.md", "content": "", "conflict_mode": "error"}

    created = client.post(f"/api/drives/{DRIVE}/files", json=body)
    assert created.status_code == 201, created.text
    assert read_note(client) == {"state": "empty", "file_id": created.json()["id"]}
    assert days(client) == []

    on_disk = _drive_dir(drives_json) / NOTE_FOLDER / f"{DATE}.md"
    on_disk.write_text("kept")
    again = client.post(f"/api/drives/{DRIVE}/files", json=body)
    assert again.status_code == 409
    assert on_disk.read_text() == "kept"
    assert not (on_disk.parent / f"{DATE} (1).md").exists()
    assert read_note(client)["file_id"] == created.json()["id"]


def test_pd007_a_note_trashed_and_restored_through_the_core_follows_each_state(env):
    client, lib, drives_json, _auth = env
    folder = _drive_dir(drives_json) / NOTE_FOLDER
    folder.mkdir()
    (folder / f"{DATE}.md").write_text("memo")
    fid = note(lib, size=4)
    assert read_note(client) == {"state": "active", "file_id": fid}
    assert client.delete(f"/api/files/{fid}").is_success
    assert read_note(client) == {"state": "trashed", "file_id": fid}
    assert days(client) == []
    assert client.post(f"/api/files/{fid}/restore").is_success
    assert read_note(client) == {"state": "active", "file_id": fid}
    assert days(client) == [{"date": DATE, "count": 0, "has_note": True}]
