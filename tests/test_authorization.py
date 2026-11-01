"""SPEC-PD-003: drive gate, policy gate, input validation (I5)."""

import pytest

from .conftest import BASE, DRIVE, JA_DRIVE, LOCKED_DRIVE, LOCK_GROUP, OTHER_DRIVE, hdr, set_policy

DATA_ROUTES = [
    "/calendar/months",
    "/calendar/days?month=2026-10",
    "/photos?date=2026-10-03",
    "/photos?undated=true",
    "/points",
    "/map-config",
]


def get(client, route, headers=None, cookies=None):
    return client.get(f"{BASE}{route}", headers=headers or {}, cookies=cookies or {})


@pytest.mark.parametrize("route", DATA_ROUTES)
def test_pd003_allowed_drive_answers_200(env, route):
    client, *_ = env
    assert get(client, route, hdr()).status_code == 200


@pytest.mark.parametrize("route", DATA_ROUTES)
def test_pd003_missing_drive_header_is_400(env, route):
    client, *_ = env
    assert get(client, route, hdr()).status_code == 200
    assert get(client, route).status_code == 400


@pytest.mark.parametrize("route", DATA_ROUTES)
def test_i5_locked_and_unknown_drive_give_the_same_404(env, route):
    client, *_ = env
    assert get(client, route, hdr()).status_code == 200
    locked = get(client, route, hdr(LOCKED_DRIVE))
    unknown = get(client, route, hdr("nonexistent"))
    assert locked.status_code == 404
    assert unknown.status_code == 404
    assert locked.json() == unknown.json()


@pytest.mark.parametrize("route", DATA_ROUTES)
def test_i5_unlocked_drive_is_open_to_its_group(env, route):
    client, _lib, _drives, auth = env
    assert get(client, route, hdr(LOCKED_DRIVE)).status_code == 404
    token, _ = auth.create_jwt([LOCK_GROUP], remember=False)
    r = get(client, route, hdr(LOCKED_DRIVE), cookies={"access_token": token})
    assert r.status_code == 200


@pytest.mark.parametrize("route", DATA_ROUTES)
@pytest.mark.parametrize("policy", [False, {"index": False}], ids=["bool-off", "index-off"])
def test_i5_policy_off_is_404_on_every_data_route(env, route, policy):
    client, _lib, drives_json, _auth = env
    assert get(client, route, hdr()).status_code == 200
    set_policy(drives_json, DRIVE, policy)
    assert get(client, route, hdr()).status_code == 404
    assert get(client, route, hdr(OTHER_DRIVE)).status_code == 200


def test_i5_percent_encoded_non_ascii_drive_reaches_its_own_drive(env):
    client, lib, *_ = env
    mine = lib.add(drive=JA_DRIVE, taken="2026-10-03T08:00:00")
    lib.add(drive=DRIVE, taken="2026-10-03T08:00:00")
    r = get(client, "/photos?date=2026-10-03", hdr(JA_DRIVE))
    assert r.status_code == 200
    assert r.json() == {"file_ids": [mine], "total": 1}


def test_i5_no_route_leaks_other_drive_ids(env):
    client, lib, *_ = env
    lib.add(drive=OTHER_DRIVE, taken="2026-10-03T08:00:00", lat=1.0, lon=1.0)
    lib.add(drive=OTHER_DRIVE, taken=None, lat=1.0, lon=1.0)
    assert get(client, "/photos?date=2026-10-03", hdr()).json()["file_ids"] == []
    assert get(client, "/photos?undated=true", hdr()).json()["file_ids"] == []
    assert get(client, "/points", hdr()).json()["points"] == []


BAD_QUERIES = [
    pytest.param("/calendar/days?month=2026-13", id="month-13"),
    pytest.param("/calendar/days?month=2026-00", id="month-0"),
    pytest.param("/calendar/days?month=2026-1", id="month-short"),
    pytest.param("/calendar/days?month=202610", id="month-no-dash"),
    pytest.param("/calendar/days?month=2026-10-01", id="month-is-a-date"),
    pytest.param("/calendar/days?month=abcd-ef", id="month-garbage"),
    pytest.param("/photos?date=2026-02-30", id="date-feb-30"),
    pytest.param("/photos?date=2025-02-29", id="date-non-leap"),
    pytest.param("/photos?date=2026-13-01", id="date-month-13"),
    pytest.param("/photos?date=2026-10", id="date-is-a-month"),
    pytest.param("/photos?date=2026-1-3", id="date-short"),
    pytest.param("/photos?date=garbage", id="date-garbage"),
    pytest.param("/photos", id="neither"),
    pytest.param("/photos?date=2026-10-03&undated=true", id="both"),
    pytest.param("/photos?undated=false", id="undated-false-alone"),
    pytest.param("/photos?date=2026-10-03&limit=0", id="limit-0"),
    pytest.param("/photos?date=2026-10-03&limit=101", id="limit-101"),
    pytest.param("/photos?date=2026-10-03&limit=-1", id="limit-negative"),
    pytest.param("/photos?date=2026-10-03&limit=abc", id="limit-not-int"),
    pytest.param("/photos?undated=true&limit=0", id="undated-limit-0"),
    pytest.param("/photos?undated=true&limit=101", id="undated-limit-101"),
]


@pytest.mark.parametrize("route", BAD_QUERIES)
def test_pd003_bad_input_is_422(env, route):
    client, *_ = env
    assert get(client, "/calendar/months", hdr()).status_code == 200
    assert get(client, route, hdr()).status_code == 422


@pytest.mark.parametrize("route", ["/photos?date=2026-10-03&limit=1", "/photos?date=2026-10-03&limit=100", "/photos?undated=true&limit=100"])
def test_pd003_limit_bounds_are_accepted(env, route):
    client, *_ = env
    assert get(client, route, hdr()).status_code == 200
