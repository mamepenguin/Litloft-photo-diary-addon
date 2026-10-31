"""SPEC-PD-002: /points, capture place (I8 order, I9)."""

import pytest

from .conftest import BASE, DRIVE, OTHER_DRIVE, hdr


def points(client, drive=DRIVE):
    r = client.get(f"{BASE}/points", headers=hdr(drive))
    assert r.status_code == 200, r.text
    return r.json()["points"]


def test_pd002_point_shape(env):
    client, lib, *_ = env
    fid = lib.add(taken="2026-10-03T08:15:00", lat=35.6, lon=139.7)
    assert points(client) == [
        {"file_id": fid, "lat": 35.6, "lon": 139.7, "taken_at": "2026-10-03T08:15:00"}
    ]


def test_pd002_no_located_photos_gives_empty_list(env):
    client, lib, *_ = env
    lib.add(taken="2026-10-03T08:15:00")
    assert points(client) == []


def test_pd002_dated_first_oldest_first_then_undated_by_filename(env):
    client, lib, *_ = env
    und_b = lib.add(filename="b.jpg", taken=None, lat=1.0, lon=1.0)
    new = lib.add(taken="2026-10-05T08:00:00", lat=2.0, lon=2.0)
    und_a = lib.add(filename="a.jpg", taken="2026-02-30T00:00:00", lat=3.0, lon=3.0)
    old_b = lib.add(filename="b.jpg", taken="2026-10-01T08:00:00", lat=4.0, lon=4.0, folder="d")
    old_a = lib.add(filename="a.jpg", taken="2026-10-01T08:00:00", lat=5.0, lon=5.0, folder="d")
    no_exif_place = lib.add(exif=False)
    got = points(client)
    assert [p["file_id"] for p in got] == [old_a, old_b, new, und_a, und_b]
    assert [p["taken_at"] for p in got] == [
        "2026-10-01T08:00:00",
        "2026-10-01T08:00:00",
        "2026-10-05T08:00:00",
        None,
        None,
    ]
    assert no_exif_place not in [p["file_id"] for p in got]


CAPTURE_PLACES = [
    pytest.param(0.0, 10.0, True, id="lat-zero-valid"),
    pytest.param(10.0, 0.0, True, id="lon-zero-valid"),
    pytest.param(90.0, 180.0, True, id="max-corner"),
    pytest.param(-90.0, -180.0, True, id="min-corner"),
    pytest.param(0.0, 0.0, False, id="null-island"),
    pytest.param(90.0001, 10.0, False, id="lat-over"),
    pytest.param(-90.0001, 10.0, False, id="lat-under"),
    pytest.param(10.0, 180.0001, False, id="lon-over"),
    pytest.param(10.0, -180.0001, False, id="lon-under"),
    pytest.param(None, 10.0, False, id="lat-null"),
    pytest.param(10.0, None, False, id="lon-null"),
    pytest.param(None, None, False, id="both-null"),
]


@pytest.mark.parametrize("lat,lon,on_map", CAPTURE_PLACES)
def test_i9_capture_place_rules(env, lat, lon, on_map):
    client, lib, *_ = env
    fid = lib.add(taken="2026-10-03T08:00:00", lat=lat, lon=lon)
    assert [p["file_id"] for p in points(client)] == ([fid] if on_map else [])


def test_i9_located_photo_without_date_is_on_the_map_and_in_undated_list(env):
    client, lib, *_ = env
    fid = lib.add(taken=None, lat=35.0, lon=139.0)
    assert points(client) == [{"file_id": fid, "lat": 35.0, "lon": 139.0, "taken_at": None}]
    r = client.get(f"{BASE}/photos", params={"undated": "true"}, headers=hdr())
    assert r.json()["file_ids"] == [fid]


def test_pd002_date_without_place_is_calendar_only(env):
    client, lib, *_ = env
    fid = lib.add(taken="2026-10-03T08:00:00")
    assert points(client) == []
    r = client.get(f"{BASE}/photos", params={"date": "2026-10-03"}, headers=hdr())
    assert r.json()["file_ids"] == [fid]


def test_pd002_identical_coordinates_are_all_returned(env):
    client, lib, *_ = env
    ids = [lib.add(taken=f"2026-10-03T08:{i // 60:02d}:{i % 60:02d}", lat=35.0, lon=139.0) for i in range(150)]
    assert [p["file_id"] for p in points(client)] == ids


def test_i4_points_exclude_trashed_missing_and_non_image(env):
    client, lib, *_ = env
    keep = lib.add(taken="2026-10-03T08:00:00", lat=35.0, lon=139.0)
    lib.add(taken="2026-10-03T08:00:00", lat=35.0, lon=139.0, deleted=True)
    lib.add(taken="2026-10-03T08:00:00", lat=35.0, lon=139.0, missing=True)
    lib.add(taken="2026-10-03T08:00:00", lat=35.0, lon=139.0, file_type="video")
    assert [p["file_id"] for p in points(client)] == [keep]


def test_i5_points_exclude_other_drive(env):
    client, lib, *_ = env
    mine = lib.add(taken="2026-10-03T08:00:00", lat=35.0, lon=139.0)
    lib.add(drive=OTHER_DRIVE, taken="2026-10-03T08:00:00", lat=35.0, lon=139.0)
    assert [p["file_id"] for p in points(client)] == [mine]
