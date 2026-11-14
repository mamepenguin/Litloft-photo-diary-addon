"""SPEC-PD-016: the photo routes under a target (I1, I2, I3, I4, I5, I11)."""

from datetime import UTC, datetime

import pytest

from app.models import Collection, CollectionItem, File, Tag, file_tags

from .conftest import BASE, DRIVE, OTHER_DRIVE, hdr

NOTE_FOLDER = "Photo Diary"
PHOTO_ROUTES = [
    pytest.param("/calendar/months", {}, id="months"),
    pytest.param("/calendar/days", {"month": "2026-10"}, id="days"),
    pytest.param("/photos", {"date": "2026-10-03"}, id="day-photos"),
    pytest.param("/photos", {"undated": "true"}, id="undated-photos"),
    pytest.param("/points", {}, id="points"),
]


def _get(client, route, params, drive=DRIVE):
    return client.get(f"{BASE}{route}", params=params, headers=hdr(drive))


def _ok(client, route, params, drive=DRIVE):
    r = _get(client, route, params, drive)
    assert r.status_code == 200, r.text
    return r.json()


def _tag(lib, fid, name, drive=DRIVE):
    s = lib.session
    tag = s.query(Tag).filter(Tag.drive == drive, Tag.name == name).one_or_none()
    if tag is None:
        tag = Tag(name=name, drive=drive)
        s.add(tag)
        s.flush()
    s.execute(file_tags.insert().values(file_id=fid, tag_id=tag.id))
    s.commit()


def _collect(lib, name, fids, drive=DRIVE):
    s = lib.session
    coll = Collection(name=name, drive=drive)
    s.add(coll)
    s.flush()
    for i, fid in enumerate(fids):
        s.add(CollectionItem(collection_id=coll.id, file_id=fid, position=i))
    s.commit()


def _mark(lib, fid, favorite=False, liked=False):
    row = lib.session.get(File, fid)
    row.is_favorite = favorite
    row.liked_at = datetime.now(UTC) if liked else None
    lib.session.commit()


def _note(lib, date, drive=DRIVE):
    return lib.add(
        drive=drive, filename=f"{date}.md", folder=NOTE_FOLDER, file_type="document", size=12, exif=False
    )


def seed(lib):
    """Every target row below excludes at least one image here, and each kind of exclusion appears."""
    beach_trip = lib.add(filename="beach.jpg", folder="Photos/2026", taken="2026-10-03T08:00:00", lat=35.0, lon=139.0, size=5_000)
    _tag(lib, beach_trip, "trip")
    _mark(lib, beach_trip, favorite=True)

    city_trip = lib.add(filename="city.jpg", folder="Photos", taken="2026-10-03T09:00:00", lat=34.0, lon=135.0, size=50)
    _tag(lib, city_trip, "Trip")
    _mark(lib, city_trip, liked=True)

    screenshot = lib.add(filename="screenshot.png", folder="Screenshots", taken="2026-10-03T10:00:00", size=20_000)
    _mark(lib, screenshot, favorite=True, liked=True)

    scan = lib.add(filename="scan.jpg", folder="Scans", taken=None, size=1_000)
    _tag(lib, scan, "trip")

    beach_folder = lib.add(filename="sand.jpg", folder="beach", taken="2026-09-15T08:00:00", lat=1.0, lon=1.0, size=300)

    undated_located = lib.add(filename="undated.jpg", folder="Photos", taken=None, lat=10.0, lon=10.0, size=700)
    _tag(lib, undated_located, "trip")

    no_exif = lib.add(filename="noexif.jpg", folder="Photos/2026", exif=False, size=10)

    trip_video = lib.add(filename="beach.mp4", folder="Photos", file_type="video", exif=False, size=5_000)
    _tag(lib, trip_video, "trip")
    trip_doc = lib.add(filename="beach.md", folder="Photos", file_type="document", exif=False, size=5_000)
    _tag(lib, trip_doc, "trip")

    trashed = lib.add(filename="beach-old.jpg", folder="Photos", taken="2026-10-03T11:00:00", deleted=True)
    _tag(lib, trashed, "trip")
    missing = lib.add(filename="beach-gone.jpg", folder="Photos", taken="2026-10-03T12:00:00", missing=True)
    _tag(lib, missing, "trip")

    elsewhere = lib.add(drive=OTHER_DRIVE, filename="beach.jpg", folder="Photos", taken="2026-10-03T08:00:00", lat=1.0, lon=1.0)
    _tag(lib, elsewhere, "trip", drive=OTHER_DRIVE)

    _collect(lib, "Album", [beach_trip, scan])
    _collect(lib, "Elsewhere", [screenshot], drive=OTHER_DRIVE)
    return {
        "beach_trip": beach_trip,
        "city_trip": city_trip,
        "screenshot": screenshot,
        "scan": scan,
        "beach_folder": beach_folder,
        "undated_located": undated_located,
        "no_exif": no_exif,
    }


TARGETS = [
    pytest.param({"search": "beach"}, id="search-title-and-folder"),
    pytest.param({"tag": ["trip"]}, id="tag"),
    pytest.param({"tag": ["trip", "nothing"]}, id="tag-repeated"),
    pytest.param({"folder": ["Photos"]}, id="folder-subtree"),
    pytest.param({"folder": ["Photos/2026", "Scans"]}, id="folder-repeated"),
    pytest.param({"collection": ["Album"]}, id="collection"),
    pytest.param({"collection": ["Elsewhere"]}, id="collection-of-another-drive"),
    pytest.param({"size": ["gt:100"]}, id="size"),
    pytest.param({"size": ["gte:300", "lt:10000"]}, id="size-repeated"),
    pytest.param({"favorite": "true"}, id="favorite"),
    pytest.param({"favorite": "false"}, id="not-favorite"),
    pytest.param({"liked": "true"}, id="liked"),
    pytest.param({"liked": "false"}, id="not-liked"),
    pytest.param({"search": "beach", "tag": ["trip"], "folder": ["Photos"], "size": ["gt:100"]}, id="combined"),
]


def listing_ids(client, params):
    r = client.get(
        f"/api/drives/{DRIVE}/files",
        params={**params, "type": "image", "limit": 500},
    )
    assert r.status_code == 200, r.text
    return [f["id"] for f in r.json()["data"]]


def everything_under(client, params):
    """Every photo the calendar and the undated list show for a target, in the order seen."""
    seen = []
    m = _ok(client, "/calendar/months", params)
    for entry in m["months"]:
        for d in _ok(client, "/calendar/days", {**params, "month": entry["month"]})["days"]:
            seen += _ok(client, "/photos", {**params, "date": d["date"], "limit": 100})["file_ids"]
    seen += _ok(client, "/photos", {**params, "undated": "true", "limit": 100})["file_ids"]
    return m, seen


@pytest.mark.parametrize("target", TARGETS)
def test_pd016_i1_i2_target_gives_the_listing_set_once_each(env, target):
    client, lib, *_ = env
    seed(lib)
    expected = listing_ids(client, target)
    _, seen = everything_under(client, target)
    assert sorted(seen) == sorted(expected)
    assert len(seen) == len(set(seen))


@pytest.mark.parametrize("target", TARGETS)
def test_pd016_i1_i2_pins_are_the_located_members_of_the_listing_set(env, target):
    client, lib, *_ = env
    ids = seed(lib)
    located = {ids["beach_trip"], ids["city_trip"], ids["beach_folder"], ids["undated_located"]}
    expected = set(listing_ids(client, target)) & located
    pins = [p["file_id"] for p in _ok(client, "/points", target)["points"]]
    assert sorted(pins) == sorted(expected)


@pytest.mark.parametrize("target", TARGETS)
def test_pd016_i3_counts_equal_totals_and_sum_to_the_listing_count(env, target):
    client, lib, *_ = env
    seed(lib)
    m = _ok(client, "/calendar/months", target)
    n = m["undated_count"]
    for entry in m["months"]:
        month_sum = 0
        for d in _ok(client, "/calendar/days", {**target, "month": entry["month"]})["days"]:
            assert _ok(client, "/photos", {**target, "date": d["date"]})["total"] == d["count"]
            month_sum += d["count"]
        assert month_sum == entry["count"]
        n += entry["count"]
    assert _ok(client, "/photos", {**target, "undated": "true"})["total"] == m["undated_count"]
    assert n == len(listing_ids(client, target))


def test_pd016_tag_target_narrows_each_route(env):
    client, lib, *_ = env
    ids = seed(lib)
    t = {"tag": ["trip"]}
    assert _ok(client, "/calendar/months", t) == {
        "months": [{"month": "2026-10", "count": 2}],
        "undated_count": 2,
    }
    assert _ok(client, "/calendar/days", {**t, "month": "2026-10"}) == {
        "days": [{"date": "2026-10-03", "count": 2, "has_note": False}]
    }
    assert _ok(client, "/photos", {**t, "date": "2026-10-03"}) == {
        "file_ids": [ids["beach_trip"], ids["city_trip"]],
        "total": 2,
    }
    assert _ok(client, "/photos", {**t, "undated": "true"}) == {
        "file_ids": [ids["scan"], ids["undated_located"]],
        "total": 2,
    }
    assert [p["file_id"] for p in _ok(client, "/points", t)["points"]] == [
        ids["beach_trip"],
        ids["city_trip"],
        ids["undated_located"],
    ]


def test_pd016_folder_and_collection_are_matched_within_the_request_drive(env):
    client, lib, *_ = env
    seed(lib)
    other = lib.add(drive=OTHER_DRIVE, filename="o.jpg", folder="Scans", taken="2026-10-03T08:00:00")
    _collect(lib, "Album", [other], drive=OTHER_DRIVE)
    _, seen = everything_under(client, {"collection": ["Album"]})
    assert other not in seen
    _, seen = everything_under(client, {"folder": ["Scans"]})
    assert other not in seen
    m, seen = everything_under(client, {"collection": ["Elsewhere"]})
    assert seen == []
    assert m == {"months": [], "undated_count": 0}


# ---------------------------------------------------------------- none=true


def test_pd016_i4_none_counts_and_lists_no_photo_and_keeps_note_dates(env):
    client, lib, *_ = env
    seed(lib)
    _note(lib, "2026-10-03")
    _note(lib, "2026-08-20")
    none = {"none": "true"}
    assert _ok(client, "/calendar/months", none) == {
        "months": [{"month": "2026-10", "count": 0}, {"month": "2026-08", "count": 0}],
        "undated_count": 0,
    }
    assert _ok(client, "/calendar/days", {**none, "month": "2026-10"}) == {
        "days": [{"date": "2026-10-03", "count": 0, "has_note": True}]
    }
    assert _ok(client, "/calendar/days", {**none, "month": "2026-09"}) == {"days": []}
    assert _ok(client, "/photos", {**none, "date": "2026-10-03"}) == {"file_ids": [], "total": 0}
    assert _ok(client, "/photos", {**none, "undated": "true"}) == {"file_ids": [], "total": 0}
    assert _ok(client, "/points", none) == {"points": []}
    note_id = _ok(client, "/note", {"date": "2026-10-03"})["file_id"]
    assert note_id is not None
    for params in [none, {"tag": ["nothing-tagged"]}]:
        assert _ok(client, "/note", {"date": "2026-10-03", **params}) == {"state": "active", "file_id": note_id}


def test_pd016_i5_note_dates_are_the_same_under_every_target(env):
    client, lib, *_ = env
    seed(lib)
    _note(lib, "2026-10-03")
    _note(lib, "2026-07-01")

    def note_view(params):
        m = _ok(client, "/calendar/months", params)
        months = [e["month"] for e in m["months"]]
        marks = {
            month: [d["date"] for d in _ok(client, "/calendar/days", {**params, "month": month})["days"] if d["has_note"]]
            for month in ("2026-10", "2026-07")
        }
        return months, marks

    for params in [{"tag": ["nothing-tagged"]}, {"none": "true"}, {"tag": ["trip"]}, {"folder": ["Screenshots"]}]:
        months, marks = note_view(params)
        assert "2026-07" in months, params
        assert marks == {"2026-10": ["2026-10-03"], "2026-07": ["2026-07-01"]}, params
        m = _ok(client, "/calendar/months", params)
        photo_count = sum(e["count"] for e in m["months"]) + m["undated_count"]
        expected = 0 if "none" in params else len(listing_ids(client, params))
        assert photo_count == expected, params


def test_pd016_i5_a_month_with_notes_only_under_a_target_has_count_zero(env):
    client, lib, *_ = env
    seed(lib)
    _note(lib, "2026-10-05")
    m = _ok(client, "/calendar/months", {"tag": ["nothing-tagged"]})
    assert m == {"months": [{"month": "2026-10", "count": 0}], "undated_count": 0}
    assert _ok(client, "/calendar/days", {"tag": ["nothing-tagged"], "month": "2026-10"}) == {
        "days": [{"date": "2026-10-05", "count": 0, "has_note": True}]
    }


# ---------------------------------------------------------------- 422 / 400

PRESENT_WITH_NONE = [
    pytest.param({"search": "beach"}, id="search"),
    pytest.param({"tag": [""]}, id="tag-empty-value"),
    pytest.param({"tag": ["trip"]}, id="tag"),
    pytest.param({"folder": ["Photos"]}, id="folder"),
    pytest.param({"collection": ["Album"]}, id="collection"),
    pytest.param({"size": ["gt:1"]}, id="size"),
    pytest.param({"favorite": "true"}, id="favorite"),
    pytest.param({"favorite": "false"}, id="favorite-false"),
    pytest.param({"liked": "true"}, id="liked"),
    pytest.param({"liked": "false"}, id="liked-false"),
]


@pytest.mark.parametrize("route, base", PHOTO_ROUTES)
@pytest.mark.parametrize("param", PRESENT_WITH_NONE)
def test_pd016_i11_none_with_a_target_parameter_is_422(env, route, base, param):
    client, *_ = env
    assert _get(client, route, {**base, "none": "true"}).status_code == 200
    assert _get(client, route, {**base, "none": "true", **param}).status_code == 422


EMPTY = {
    "/calendar/months": {"months": [], "undated_count": 0},
    "/calendar/days": {"days": []},
    "/photos": {"file_ids": [], "total": 0},
    "/points": {"points": []},
}


@pytest.mark.parametrize("route, base", PHOTO_ROUTES)
def test_pd016_i11_none_with_an_empty_search_is_not_a_target(env, route, base):
    client, lib, *_ = env
    seed(lib)
    r = _get(client, route, {**base, "none": "true", "search": ""})
    assert r.status_code == 200, r.text
    assert r.json() == EMPTY[route]


@pytest.mark.parametrize("route, base", PHOTO_ROUTES)
def test_pd016_i11_none_false_is_the_same_as_no_none(env, route, base):
    client, lib, *_ = env
    seed(lib)
    tagged = _ok(client, route, {**base, "tag": ["trip"]})
    assert tagged != _ok(client, route, base)
    assert _ok(client, route, {**base, "tag": ["trip"], "none": "false"}) == tagged
    assert _ok(client, route, {**base, "none": "false"}) == _ok(client, route, base)


@pytest.mark.parametrize("route, base", PHOTO_ROUTES)
def test_pd016_type_parameter_is_ignored_and_images_stay(env, route, base):
    client, lib, *_ = env
    seed(lib)
    tagged = _ok(client, route, {**base, "tag": ["trip"]})
    assert _ok(client, route, {**base, "tag": ["trip"], "type": "video"}) == tagged
    assert tagged != _ok(client, route, base)


MALFORMED = [
    pytest.param({"size": ["big"]}, id="size-word"),
    pytest.param({"size": ["gt:-1"]}, id="size-negative"),
    pytest.param({"folder": ["../up"]}, id="folder-dotdot"),
    pytest.param({"folder": [f"f{i}" for i in range(11)]}, id="folder-too-many"),
    pytest.param({"collection": ["x" * 101]}, id="collection-too-long"),
]


@pytest.mark.parametrize("route, base", PHOTO_ROUTES)
@pytest.mark.parametrize("param", MALFORMED)
def test_pd016_i11_target_the_core_cannot_normalise_is_400(env, route, base, param):
    client, lib, *_ = env
    seed(lib)
    assert listing_status(client, param) == 400
    assert _get(client, route, {**base, **param}).status_code == 400


def listing_status(client, params):
    return client.get(f"/api/drives/{DRIVE}/files", params={**params, "type": "image"}).status_code


@pytest.mark.parametrize("route, base", PHOTO_ROUTES)
def test_pd016_search_bound_is_200_characters(env, route, base):
    client, lib, *_ = env
    for folder, taken in (("dated", "2026-10-03T08:00:00"), ("undated", None)):
        lib.add(filename=("b" * 200) + ".jpg", folder=folder, taken=taken, lat=1.0, lon=1.0)
        lib.add(filename="other.jpg", folder=folder, taken=taken, lat=1.0, lon=1.0)
    at_bound = _get(client, route, {**base, "search": "b" * 200})
    assert at_bound.status_code == 200, at_bound.text
    assert at_bound.json() != _ok(client, route, base)
    assert _get(client, route, {**base, "search": "b" * 201}).status_code == 422
