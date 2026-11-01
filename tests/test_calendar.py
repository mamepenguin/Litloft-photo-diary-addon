"""SPEC-PD-001: calendar routes, capture date, undated photos (I1, I2, I3, I4)."""

import pytest

from .conftest import BASE, DRIVE, OTHER_DRIVE, hdr

UNDATED_VALUES = [
    pytest.param(None, id="null"),
    pytest.param("0000-00-00T00:00:00", id="zeros"),
    pytest.param("    -  -  T  :  :  ", id="blank-template"),
    pytest.param("0000-01-01T00:00:00", id="year-zero"),
    pytest.param("2026-02-30T10:00:00", id="feb-30"),
    pytest.param("2025-02-29T10:00:00", id="feb-29-non-leap"),
    pytest.param("2026-13-01T10:00:00", id="month-13"),
    pytest.param("2026-00-10T10:00:00", id="month-0"),
    pytest.param("garbage", id="garbage"),
    pytest.param("", id="empty-string"),
]


def months(client, drive=DRIVE):
    r = client.get(f"{BASE}/calendar/months", headers=hdr(drive))
    assert r.status_code == 200, r.text
    return r.json()


def days(client, month, drive=DRIVE):
    r = client.get(f"{BASE}/calendar/days", params={"month": month}, headers=hdr(drive))
    assert r.status_code == 200, r.text
    return r.json()


def photos(client, drive=DRIVE, **params):
    r = client.get(f"{BASE}/photos", params=params, headers=hdr(drive))
    assert r.status_code == 200, r.text
    return r.json()


def test_pd001_months_newest_first_with_counts(env):
    client, lib, *_ = env
    lib.add(taken="2026-09-30T08:00:00")
    lib.add(taken="2026-10-03T08:00:00")
    lib.add(taken="2026-10-04T08:00:00")
    lib.add(taken="2025-12-31T08:00:00")
    assert months(client) == {
        "months": [
            {"month": "2026-10", "count": 2},
            {"month": "2026-09", "count": 1},
            {"month": "2025-12", "count": 1},
        ],
        "undated_count": 0,
    }


def test_pd001_empty_drive(env):
    client, *_ = env
    assert months(client) == {"months": [], "undated_count": 0}
    assert days(client, "2026-10") == {"days": []}
    assert photos(client, date="2026-10-03") == {"file_ids": [], "total": 0}
    assert photos(client, undated="true") == {"file_ids": [], "total": 0}


def test_pd001_days_oldest_first_only_days_with_photos(env):
    client, lib, *_ = env
    lib.add(taken="2026-10-20T08:00:00")
    lib.add(taken="2026-10-03T08:00:00")
    lib.add(taken="2026-10-03T09:00:00")
    lib.add(taken="2026-11-01T00:00:00")
    assert days(client, "2026-10") == {
        "days": [
            {"date": "2026-10-03", "count": 2, "has_note": False},
            {"date": "2026-10-20", "count": 1, "has_note": False},
        ]
    }


def test_pd001_real_month_without_photos_is_empty_200(env):
    client, lib, *_ = env
    lib.add(taken="2026-10-03T08:00:00")
    assert days(client, "2026-07") == {"days": []}


def test_pd001_date_only_value_is_dated(env):
    client, lib, *_ = env
    fid = lib.add(taken="2026-10-03")
    assert photos(client, date="2026-10-03")["file_ids"] == [fid]


def test_pd001_leap_day_is_dated(env):
    client, lib, *_ = env
    fid = lib.add(taken="2024-02-29T10:00:00")
    assert photos(client, date="2024-02-29")["file_ids"] == [fid]


def test_pd001_future_date_shown_as_written(env):
    client, lib, *_ = env
    fid = lib.add(taken="2099-01-01T00:00:00")
    assert months(client)["months"] == [{"month": "2099-01", "count": 1}]
    assert photos(client, date="2099-01-01")["file_ids"] == [fid]


def test_i1_late_evening_stays_on_its_own_day(env):
    client, lib, *_ = env
    fid = lib.add(taken="2026-10-03T23:30:00")
    assert days(client, "2026-10")["days"] == [{"date": "2026-10-03", "count": 1, "has_note": False}]
    assert photos(client, date="2026-10-03")["file_ids"] == [fid]
    assert photos(client, date="2026-10-04") == {"file_ids": [], "total": 0}
    assert photos(client, date="2026-10-02") == {"file_ids": [], "total": 0}


@pytest.mark.parametrize("value", UNDATED_VALUES)
def test_i2_undated_value_is_only_in_undated_list(env, value):
    client, lib, *_ = env
    fid = lib.add(taken=value)
    m = months(client)
    assert m["months"] == []
    assert m["undated_count"] == 1
    assert photos(client, undated="true") == {"file_ids": [fid], "total": 1}


def test_i2_photo_without_exif_row_is_undated(env):
    client, lib, *_ = env
    fid = lib.add(exif=False)
    assert months(client)["undated_count"] == 1
    assert photos(client, undated="true")["file_ids"] == [fid]


def test_i2_undated_photo_with_creation_time_is_on_no_day(env):
    client, lib, *_ = env
    lib.add(taken="0000-00-00T00:00:00")
    assert months(client)["months"] == []


def test_pd001_undated_ordered_by_filename_then_id(env):
    client, lib, *_ = env
    b = lib.add(filename="b.jpg", taken=None)
    a2 = lib.add(filename="a.jpg", taken=None, file_id="zz0000000002", folder="x")
    a1 = lib.add(filename="a.jpg", taken=None, file_id="aa0000000001", folder="y")
    assert photos(client, undated="true")["file_ids"] == [a1, a2, b]


def test_pd001_day_ordered_by_time_then_filename_then_id(env):
    client, lib, *_ = env
    late = lib.add(filename="a.jpg", taken="2026-10-03T18:00:00")
    early_b = lib.add(filename="b.jpg", taken="2026-10-03T08:00:00")
    early_a = lib.add(filename="a.jpg", taken="2026-10-03T08:00:00", file_id="zz0000000002", folder="x")
    early_a0 = lib.add(filename="a.jpg", taken="2026-10-03T08:00:00", file_id="aa0000000001", folder="y")
    assert photos(client, date="2026-10-03")["file_ids"] == [early_a0, early_a, early_b, late]


def test_pd001_photos_paging(env):
    client, lib, *_ = env
    ids = [lib.add(taken=f"2026-10-03T08:{i:02d}:00") for i in range(7)]
    first = photos(client, date="2026-10-03", limit=3)
    assert first == {"file_ids": ids[:3], "total": 7}
    assert photos(client, date="2026-10-03", limit=3, offset=3)["file_ids"] == ids[3:6]
    last = photos(client, date="2026-10-03", limit=3, offset=6)
    assert last == {"file_ids": ids[6:], "total": 7}
    assert photos(client, date="2026-10-03", limit=3, offset=7) == {"file_ids": [], "total": 7}


def test_pd001_photos_default_limit_is_40(env):
    client, lib, *_ = env
    for i in range(45):
        lib.add(taken=f"2026-10-03T08:{i:02d}:00")
    r = photos(client, date="2026-10-03")
    assert len(r["file_ids"]) == 40
    assert r["total"] == 45


def test_pd001_limit_100_is_allowed(env):
    client, lib, *_ = env
    for i in range(101):
        lib.add(taken="2026-10-03T08:00:00", filename=f"{i:03d}.jpg")
    r = photos(client, date="2026-10-03", limit=100)
    assert len(r["file_ids"]) == 100
    assert r["total"] == 101


def test_pd001_undated_paging(env):
    client, lib, *_ = env
    ids = [lib.add(filename=f"{i}.jpg") for i in range(5)]
    assert photos(client, undated="true", limit=2, offset=2) == {"file_ids": ids[2:4], "total": 5}


def test_i3_counts_equal_totals(env):
    client, lib, *_ = env
    for t in ["2026-10-03T01:00:00", "2026-10-03T23:00:00", "2026-10-05T10:00:00", "2026-09-30T10:00:00", None, "2026-02-30T00:00:00"]:
        lib.add(taken=t)
    lib.add(exif=False)
    m = months(client)
    seen = 0
    for entry in m["months"]:
        month_total = 0
        for d in days(client, entry["month"])["days"]:
            total = photos(client, date=d["date"])["total"]
            assert total == d["count"]
            month_total += d["count"]
        assert month_total == entry["count"]
        seen += month_total
    undated = photos(client, undated="true")["total"]
    assert undated == m["undated_count"] == 3
    assert seen + undated == 7


def test_i4_trashed_missing_and_non_image_are_excluded(env):
    client, lib, *_ = env
    keep = lib.add(taken="2026-10-03T08:00:00", lat=35.0, lon=139.0)
    lib.add(taken="2026-10-03T08:00:00", deleted=True)
    lib.add(taken="2026-10-03T08:00:00", missing=True)
    lib.add(taken="2026-10-03T08:00:00", file_type="video")
    lib.add(taken=None, deleted=True)
    lib.add(taken=None, missing=True)
    lib.add(taken=None, file_type="video")
    m = months(client)
    assert m == {"months": [{"month": "2026-10", "count": 1}], "undated_count": 0}
    assert days(client, "2026-10")["days"] == [{"date": "2026-10-03", "count": 1, "has_note": False}]
    assert photos(client, date="2026-10-03") == {"file_ids": [keep], "total": 1}
    assert photos(client, undated="true") == {"file_ids": [], "total": 0}


def test_i5_other_drive_is_not_counted(env):
    client, lib, *_ = env
    mine = lib.add(taken="2026-10-03T08:00:00")
    lib.add(drive=OTHER_DRIVE, taken="2026-10-03T08:00:00")
    lib.add(drive=OTHER_DRIVE, taken=None)
    assert months(client) == {"months": [{"month": "2026-10", "count": 1}], "undated_count": 0}
    assert photos(client, date="2026-10-03")["file_ids"] == [mine]
    assert photos(client, undated="true")["total"] == 0
