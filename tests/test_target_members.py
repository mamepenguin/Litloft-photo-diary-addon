"""SPEC-PD-021: the POST photo routes that take a member set (item 1, failure cases, I1)."""

import pytest

from .conftest import BASE, DRIVE, LOCK_GROUP, LOCKED_DRIVE, OTHER_DRIVE, hdr, set_policy
from .test_target import _collect, _note, _tag

ORACLE = "Members oracle"

ROUTES = [
    pytest.param("/calendar/months", {}, id="months"),
    pytest.param("/calendar/days", {"month": "2026-10"}, id="days"),
    pytest.param("/calendar/days", {"month": "2026-09"}, id="days-other-month"),
    pytest.param("/photos", {"date": "2026-10-03"}, id="day-photos"),
    pytest.param("/photos", {"date": "2026-10-03", "offset": "1", "limit": "1"}, id="day-photos-paged"),
    pytest.param("/photos", {"undated": "true"}, id="undated-photos"),
    pytest.param("/photos", {"undated": "true", "offset": "1", "limit": "1"}, id="undated-photos-paged"),
    pytest.param("/points", {}, id="points"),
    pytest.param("/library/shelves", {"by": "month"}, id="shelves-month"),
    pytest.param("/library/shelves", {"by": "month", "sort": "oldest", "per_shelf": "1"}, id="shelves-oldest"),
    pytest.param("/library/shelves", {"by": "tag", "shelf_limit": "1", "offset": "1"}, id="shelves-tag-paged"),
    pytest.param("/library/shelves", {"by": "folder"}, id="shelves-folder"),
    pytest.param("/library/shelves", {"by": "collection"}, id="shelves-collection"),
    pytest.param("/library/shelf", {"by": "month", "key": "2026-10"}, id="shelf-month"),
    pytest.param("/library/shelf", {"by": "month", "key": "undated", "sort": "oldest"}, id="shelf-undated"),
    pytest.param("/library/shelf", {"by": "tag", "key": "trip", "offset": "1", "limit": "1"}, id="shelf-tag-paged"),
]

PHOTO_ROUTES = [
    pytest.param("/calendar/months", {}, id="months"),
    pytest.param("/calendar/days", {"month": "2026-10"}, id="days"),
    pytest.param("/photos", {"date": "2026-10-03"}, id="day-photos"),
    pytest.param("/photos", {"undated": "true"}, id="undated-photos"),
    pytest.param("/points", {}, id="points"),
    pytest.param("/library/shelves", {"by": "month"}, id="shelves"),
    pytest.param("/library/shelf", {"by": "month", "key": "2026-10"}, id="shelf"),
]


def _post(client, route, params, body, drive=DRIVE):
    return client.post(f"{BASE}{route}", params=params, json=body, headers=hdr(drive))


def _get(client, route, params, drive=DRIVE):
    return client.get(f"{BASE}{route}", params=params, headers=hdr(drive))


def _ok_get(client, route, params):
    r = _get(client, route, params)
    assert r.status_code == 200, r.text
    return r.json()


def _ok_post(client, route, params, ids):
    r = _post(client, route, params, {"file_ids": ids})
    assert r.status_code == 200, r.text
    return r.json()


def seed(lib):
    """A drive where the listed ids hold every kind of photo and every kind of id a member set may carry."""
    dated_a = lib.add(filename="a.jpg", folder="Photos/2026", taken="2026-10-03T08:00:00", lat=35.0, lon=139.0)
    dated_b = lib.add(filename="b.jpg", folder="Photos", taken="2026-10-03T09:00:00")
    dated_c = lib.add(filename="c.jpg", folder="Trips", taken="2026-10-03T10:00:00", lat=34.0, lon=135.0)
    september = lib.add(filename="d.jpg", folder="Trips", taken="2026-09-15T08:00:00", lat=1.0, lon=1.0)
    undated_a = lib.add(filename="u1.jpg", folder="Scans", taken=None, lat=10.0, lon=10.0)
    undated_b = lib.add(filename="u2.jpg", folder="Scans", taken=None)
    undated_c = lib.add(filename="u3.jpg", folder="Photos", exif=False)
    for fid in (dated_a, dated_c, undated_a, september):
        _tag(lib, fid, "trip")
    video = lib.add(filename="v.mp4", folder="Photos", file_type="video", exif=False)
    doc = lib.add(filename="n.md", folder="Photos", file_type="document", exif=False)
    trashed = lib.add(filename="t.jpg", folder="Photos", taken="2026-10-03T11:00:00", deleted=True)
    missing = lib.add(filename="m.jpg", folder="Photos", taken="2026-10-03T12:00:00", missing=True)
    other = lib.add(drive=OTHER_DRIVE, filename="o.jpg", folder="Photos", taken="2026-10-03T08:00:00", lat=2.0, lon=2.0)
    _tag(lib, other, "trip", drive=OTHER_DRIVE)

    not_listed = [
        lib.add(filename="x.jpg", folder="Photos", taken="2026-10-03T13:00:00", lat=5.0, lon=5.0),
        lib.add(filename="y.jpg", folder="Scans", taken=None),
        lib.add(filename="z.jpg", folder="Trips", taken="2026-09-15T09:00:00"),
    ]
    _tag(lib, not_listed[0], "trip")
    _note(lib, "2026-10-03")
    _note(lib, "2026-07-01")

    listed_images = [dated_a, dated_b, dated_c, september, undated_a, undated_b, undated_c]
    _collect(lib, ORACLE, listed_images)
    _collect(lib, "Holiday", [dated_b, not_listed[0]])
    member_ids = listed_images + [video, doc, trashed, missing, other, "nosuchid0000", dated_a, undated_b]
    return {"members": member_ids, "listed_images": listed_images, "not_listed": not_listed}


@pytest.mark.parametrize("route, base", ROUTES)
def test_pd021_i1_post_answers_what_get_answers_for_the_listed_active_images(env, route, base):
    client, lib, *_ = env
    s = seed(lib)
    oracle = _ok_get(client, route, {**base, "collection": [ORACLE]})
    assert oracle != _ok_get(client, route, {**base, "collection": ["nothing-by-this-name"]})
    assert _ok_post(client, route, base, s["members"]) == oracle


@pytest.mark.parametrize("route, base", ROUTES)
def test_pd021_i1_an_empty_member_list_selects_no_photo_and_keeps_note_dates(env, route, base):
    client, lib, *_ = env
    seed(lib)
    nothing = _ok_get(client, route, {**base, "tag": ["nothing-tagged"]})
    assert _ok_post(client, route, base, []) == nothing


@pytest.mark.parametrize("route, base", PHOTO_ROUTES)
def test_pd021_i1_an_empty_member_list_is_never_the_whole_drive(env, route, base):
    client, lib, *_ = env
    seed(lib)
    assert _ok_post(client, route, base, []) != _ok_get(client, route, base)


@pytest.mark.parametrize("route, base", PHOTO_ROUTES)
def test_pd021_i1_ids_of_another_drive_select_nothing(env, route, base):
    client, lib, *_ = env
    other = lib.add(drive=OTHER_DRIVE, filename="o.jpg", folder="Photos", taken="2026-10-03T08:00:00", lat=2.0, lon=2.0)
    lib.add(filename="mine.jpg", folder="Photos", taken="2026-10-03T08:00:00", lat=3.0, lon=3.0)
    got = _ok_post(client, route, base, [other])
    assert got == _ok_get(client, route, {**base, "tag": ["nothing-tagged"]})
    assert other not in repr(got)


def test_pd021_member_set_narrows_each_route(env):
    client, lib, *_ = env
    a = lib.add(filename="a.jpg", folder="P", taken="2026-10-03T08:00:00", lat=35.0, lon=139.0)
    b = lib.add(filename="b.jpg", folder="P", taken="2026-10-03T09:00:00")
    u = lib.add(filename="u.jpg", folder="P", taken=None, lat=1.0, lon=1.0)
    lib.add(filename="left-out.jpg", folder="P", taken="2026-10-03T10:00:00", lat=4.0, lon=4.0)
    lib.add(filename="left-out-undated.jpg", folder="P", taken=None)
    ids = [a, b, u]
    assert _ok_post(client, "/calendar/months", {}, ids) == {
        "months": [{"month": "2026-10", "count": 2}],
        "undated_count": 1,
    }
    assert _ok_post(client, "/calendar/days", {"month": "2026-10"}, ids) == {
        "days": [{"date": "2026-10-03", "count": 2, "has_note": False}]
    }
    assert _ok_post(client, "/photos", {"date": "2026-10-03"}, ids) == {"file_ids": [a, b], "total": 2}
    assert _ok_post(client, "/photos", {"undated": "true"}, ids) == {"file_ids": [u], "total": 1}
    assert [p["file_id"] for p in _ok_post(client, "/points", {}, ids)["points"]] == [a, u]


@pytest.mark.parametrize("route, base", PHOTO_ROUTES)
def test_pd021_duplicates_change_nothing(env, route, base):
    client, lib, *_ = env
    s = seed(lib)
    once = _ok_post(client, route, base, s["listed_images"])
    assert _ok_post(client, route, base, s["listed_images"] * 3) == once


# ---------------------------------------------------------------- the body


BAD_BODIES = [
    pytest.param({}, id="no-file-ids"),
    pytest.param({"file_ids": None}, id="null"),
    pytest.param({"file_ids": "f00000000001"}, id="string"),
    pytest.param({"file_ids": {"a": "f00000000001"}}, id="object"),
    pytest.param({"file_ids": [""]}, id="empty-string-alone"),
    pytest.param({"file_ids": ["f00000000001", ""]}, id="empty-string-among-ids"),
]


@pytest.mark.parametrize("route, base", PHOTO_ROUTES)
@pytest.mark.parametrize("body", BAD_BODIES)
def test_pd021_i1_missing_or_invalid_file_ids_is_422(env, route, base, body):
    client, *_ = env
    assert _post(client, route, base, {"file_ids": []}).status_code == 200
    assert _post(client, route, base, body).status_code == 422


@pytest.mark.parametrize("route, base", PHOTO_ROUTES)
def test_pd021_i1_a_post_with_no_body_is_422(env, route, base):
    client, *_ = env
    r = client.post(f"{BASE}{route}", params=base, headers=hdr())
    assert r.status_code == 422


@pytest.mark.parametrize("route, base", PHOTO_ROUTES)
def test_pd021_i1_ten_thousand_entries_are_accepted_and_one_more_is_422(env, route, base):
    client, lib, *_ = env
    fid = lib.add(filename="a.jpg", taken="2026-10-03T08:00:00")
    distinct = [f"id{i:010d}" for i in range(9_999)] + [fid]
    assert _post(client, route, base, {"file_ids": distinct}).status_code == 200
    assert _post(client, route, base, {"file_ids": distinct + ["id-extra"]}).status_code == 422


@pytest.mark.parametrize("route, base", PHOTO_ROUTES)
def test_pd021_i1_duplicates_count_towards_the_ten_thousand(env, route, base):
    client, lib, *_ = env
    fid = lib.add(filename="a.jpg", taken="2026-10-03T08:00:00")
    assert _post(client, route, base, {"file_ids": [fid] * 10_000}).status_code == 200
    assert _post(client, route, base, {"file_ids": [fid] * 10_001}).status_code == 422


# ---------------------------------------------------------------- target query parameters


TARGET_PARAMS = [
    pytest.param({"search": "beach"}, id="search"),
    pytest.param({"search": ""}, id="search-empty"),
    pytest.param({"tag": ["trip"]}, id="tag"),
    pytest.param({"tag": [""]}, id="tag-empty"),
    pytest.param({"folder": ["Photos"]}, id="folder"),
    pytest.param({"collection": ["Album"]}, id="collection"),
    pytest.param({"size": ["gt:1"]}, id="size"),
    pytest.param({"favorite": "true"}, id="favorite"),
    pytest.param({"favorite": "false"}, id="favorite-false"),
    pytest.param({"liked": "true"}, id="liked"),
    pytest.param({"liked": "false"}, id="liked-false"),
    pytest.param({"none": "true"}, id="none"),
    pytest.param({"none": "false"}, id="none-false"),
]


@pytest.mark.parametrize("route, base", PHOTO_ROUTES)
@pytest.mark.parametrize("param", TARGET_PARAMS)
def test_pd021_i1_a_post_with_any_target_query_parameter_is_422(env, route, base, param):
    client, lib, *_ = env
    fid = lib.add(filename="a.jpg", taken="2026-10-03T08:00:00")
    assert _post(client, route, base, {"file_ids": [fid]}).status_code == 200
    r = _post(client, route, {**base, **param}, {"file_ids": [fid]})
    key = next(iter(param))
    assert f"{key}=" in str(r.request.url)
    assert r.status_code == 422


# ---------------------------------------------------------------- other parameters, as the GET


OTHER_BAD = [
    pytest.param("/calendar/days", {}, id="days-no-month"),
    pytest.param("/calendar/days", {"month": "2026-13"}, id="days-month-13"),
    pytest.param("/photos", {}, id="photos-neither"),
    pytest.param("/photos", {"date": "2026-10-03", "undated": "true"}, id="photos-both"),
    pytest.param("/photos", {"date": "2026-02-30"}, id="photos-feb-30"),
    pytest.param("/photos", {"date": "2026-10-03", "limit": "0"}, id="photos-limit-0"),
    pytest.param("/photos", {"date": "2026-10-03", "limit": "101"}, id="photos-limit-101"),
    pytest.param("/photos", {"undated": "true", "limit": "abc"}, id="photos-limit-not-int"),
    pytest.param("/library/shelves", {}, id="shelves-no-by"),
    pytest.param("/library/shelves", {"by": "colour"}, id="shelves-unknown-by"),
    pytest.param("/library/shelves", {"by": "month", "sort": "random"}, id="shelves-unknown-sort"),
    pytest.param("/library/shelf", {"by": "month"}, id="shelf-no-key"),
]


@pytest.mark.parametrize("route, params", OTHER_BAD)
def test_pd021_an_invalid_other_parameter_answers_as_the_get(env, route, params):
    client, lib, *_ = env
    fid = lib.add(filename="a.jpg", taken="2026-10-03T08:00:00")
    expected = _get(client, route, params).status_code
    assert expected in (400, 422)
    assert _post(client, route, params, {"file_ids": [fid]}).status_code == expected


@pytest.mark.parametrize("route, base", PHOTO_ROUTES)
def test_pd021_defaults_are_the_gets(env, route, base):
    client, lib, *_ = env
    for i in range(45):
        lib.add(filename=f"p{i:02d}.jpg", taken=f"2026-10-03T08:{i:02d}:00", lat=1.0, lon=1.0)
    for i in range(3):
        lib.add(filename=f"u{i}.jpg", taken=None)
    every = [f"f{i:011d}" for i in range(1, 49)]
    _collect(lib, ORACLE, every)
    assert _ok_post(client, route, base, every) == _ok_get(client, route, {**base, "collection": [ORACLE]})


# ---------------------------------------------------------------- authorization


@pytest.mark.parametrize("route, base", PHOTO_ROUTES)
def test_pd021_a_locked_drive_is_404_and_open_to_its_group(env, route, base):
    client, lib, _drives, auth = env
    fid = lib.add(drive=LOCKED_DRIVE, filename="a.jpg", taken="2026-10-03T08:00:00")
    assert _post(client, route, base, {"file_ids": [fid]}, drive=LOCKED_DRIVE).status_code == 404
    assert _post(client, route, base, {"file_ids": [fid]}, drive="no-such-drive").status_code == 404
    token, _ = auth.create_jwt([LOCK_GROUP], remember=False)
    r = client.post(
        f"{BASE}{route}",
        params=base,
        json={"file_ids": [fid]},
        headers=hdr(LOCKED_DRIVE),
        cookies={"access_token": token},
    )
    assert r.status_code == 200, r.text


@pytest.mark.parametrize("route, base", PHOTO_ROUTES)
@pytest.mark.parametrize("policy", [False, {"index": False}], ids=["bool-off", "index-off"])
def test_pd021_policy_off_is_404(env, route, base, policy):
    client, lib, drives_json, _ = env
    fid = lib.add(filename="a.jpg", taken="2026-10-03T08:00:00")
    assert _post(client, route, base, {"file_ids": [fid]}).status_code == 200
    set_policy(drives_json, DRIVE, policy)
    assert _post(client, route, base, {"file_ids": [fid]}).status_code == 404


@pytest.mark.parametrize("route, base", PHOTO_ROUTES)
def test_pd021_a_missing_drive_header_answers_as_the_get(env, route, base):
    client, *_ = env
    expected = client.get(f"{BASE}{route}", params=base).status_code
    assert expected == 400
    r = client.post(f"{BASE}{route}", params=base, json={"file_ids": []})
    assert r.status_code == expected
