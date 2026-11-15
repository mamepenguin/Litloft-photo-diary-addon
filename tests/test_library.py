"""SPEC-PD-018: the Library routes /library/shelves and /library/shelf (I1-I6)."""

import os
import time
import unicodedata

import pytest

from app.models import Collection, CollectionItem, Tag, file_tags

from .conftest import BASE, DRIVE, OTHER_DRIVE, hdr
from .test_target import TARGETS, listing_ids, seed

BYS = ["month", "tag", "collection", "folder"]
SORTS = ["newest", "oldest"]


def nfd(s):
    return unicodedata.normalize("NFD", s)


def _get(client, route, params, drive=DRIVE):
    return client.get(f"{BASE}{route}", params=params, headers=hdr(drive))


def _ok(client, route, params, drive=DRIVE):
    r = _get(client, route, params, drive)
    assert r.status_code == 200, r.text
    return r.json()


def shelves(client, by, drive=DRIVE, **params):
    return _ok(client, "/library/shelves", {"by": by, **params}, drive)


def shelf(client, by, key, drive=DRIVE, **params):
    return _ok(client, "/library/shelf", {"by": by, "key": key, **params}, drive)


def keys(answer):
    return [s["key"] for s in answer["shelves"]]


def all_shelves(client, by, **params):
    """Every shelf, paged through by offset with the largest page."""
    out, offset = [], 0
    while True:
        page = shelves(client, by, shelf_limit=50, per_shelf=20, offset=offset, **params)
        out += page["shelves"]
        offset += 50
        if offset >= page["total_shelves"]:
            assert len(out) == page["total_shelves"]
            return out


def all_of_shelf(client, by, key, **params):
    out, offset = [], 0
    while True:
        page = shelf(client, by, key, limit=100, offset=offset, **params)
        out += page["file_ids"]
        offset += 100
        if offset >= page["total"]:
            assert len(out) == page["total"]
            return out


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
    return coll.id


# ---------------------------------------------------------------- month


def test_pd018_month_shelves_newest_first_with_undated_last(env):
    client, lib, *_ = env
    a = lib.add(taken="2026-10-03T08:00:00")
    b = lib.add(taken="2026-10-20T08:00:00")
    c = lib.add(taken="2026-09-30T08:00:00")
    d = lib.add(taken="2025-12-31T08:00:00")
    u = lib.add(taken=None)
    assert shelves(client, "month") == {
        "shelves": [
            {"key": "2026-10", "label": "", "count": 2, "file_ids": [b, a]},
            {"key": "2026-09", "label": "", "count": 1, "file_ids": [c]},
            {"key": "2025-12", "label": "", "count": 1, "file_ids": [d]},
            {"key": "undated", "label": "", "count": 1, "file_ids": [u]},
        ],
        "total_shelves": 4,
    }


def test_pd018_i5_month_shelves_oldest_first_keep_undated_last(env):
    client, lib, *_ = env
    a = lib.add(taken="2026-10-03T08:00:00")
    b = lib.add(taken="2026-10-20T08:00:00")
    lib.add(taken="2026-09-30T08:00:00")
    lib.add(taken="2025-12-31T08:00:00")
    lib.add(taken=None)
    got = shelves(client, "month", sort="oldest")
    assert keys(got) == ["2025-12", "2026-09", "2026-10", "undated"]
    assert got["shelves"][2]["file_ids"] == [a, b]


def test_pd018_sort_defaults_to_newest(env):
    client, lib, *_ = env
    lib.add(taken="2026-10-03T08:00:00")
    lib.add(taken="2025-10-03T08:00:00")
    assert shelves(client, "month") == shelves(client, "month", sort="newest")
    assert keys(shelves(client, "month")) == ["2026-10", "2025-10"]


UNDATED_VALUES = [
    pytest.param(None, id="null"),
    pytest.param("0000-00-00T00:00:00", id="zeros"),
    pytest.param("2026-02-30T10:00:00", id="feb-30"),
    pytest.param("2026-13-01T10:00:00", id="month-13"),
    pytest.param("garbage", id="garbage"),
]


@pytest.mark.parametrize("taken", UNDATED_VALUES)
def test_pd018_i3_undated_photo_is_in_the_undated_shelf_and_no_month(env, taken):
    client, lib, *_ = env
    dated = lib.add(taken="2026-10-03T08:00:00")
    u = lib.add(taken=taken)
    got = shelves(client, "month")
    assert keys(got) == ["2026-10", "undated"]
    assert got["shelves"][0]["file_ids"] == [dated]
    assert got["shelves"][1]["file_ids"] == [u]
    assert shelf(client, "month", "undated")["file_ids"] == [u]


def test_pd018_i3_month_is_the_stored_wall_clock_with_no_time_zone(env):
    client, lib, *_ = env
    late = lib.add(taken="2026-10-31T23:30:00")
    early = lib.add(taken="2026-11-01T00:30:00")
    saved = os.environ.get("TZ")
    os.environ["TZ"] = "Pacific/Kiritimati"
    time.tzset()
    try:
        got = shelves(client, "month")
        listed = shelf(client, "month", "2026-10")["file_ids"]
    finally:
        if saved is None:
            os.environ.pop("TZ", None)
        else:
            os.environ["TZ"] = saved
        time.tzset()
    assert [(s["key"], s["file_ids"]) for s in got["shelves"]] == [("2026-11", [early]), ("2026-10", [late])]
    assert listed == [late]


def test_pd018_photo_without_exif_row_is_undated(env):
    client, lib, *_ = env
    n = lib.add(exif=False)
    assert shelves(client, "month")["shelves"] == [{"key": "undated", "label": "", "count": 1, "file_ids": [n]}]


# ---------------------------------------------------------------- capture order (I4)


def capture_fixture(lib):
    sa = lib.add(filename="same.jpg", file_id="fid000000001", taken="2026-10-03T10:00:00", folder="x")
    sb = lib.add(filename="same.jpg", file_id="fid000000002", taken="2026-10-03T10:00:00", folder="y")
    b = lib.add(filename="b.jpg", taken="2026-10-03T10:00:00")
    a = lib.add(filename="a.jpg", taken="2026-10-03T10:00:00")
    c = lib.add(filename="c.jpg", taken="2026-10-03T09:00:00")
    ua = lib.add(filename="u.jpg", file_id="fid000000009", taken=None, folder="x")
    ub = lib.add(filename="u.jpg", file_id="fid000000008", taken=None, folder="y")
    uz = lib.add(filename="z.jpg", taken=None)
    um = lib.add(filename="m.jpg", taken=None)
    for fid in (sa, sb, b, a, c, ua, ub, uz, um):
        _tag(lib, fid, "all")
    return {
        "newest_dated": [sb, sa, b, a, c],
        "oldest_dated": [c, a, b, sa, sb],
        "undated": [um, ub, ua, uz],
    }


def test_pd018_i4_capture_order_newest_breaks_ties_by_filename_then_id_descending(env):
    client, lib, *_ = env
    o = capture_fixture(lib)
    assert shelf(client, "month", "2026-10")["file_ids"] == o["newest_dated"]
    assert shelf(client, "month", "undated")["file_ids"] == o["undated"]


def test_pd018_i4_capture_order_oldest_ascending_and_undated_unchanged(env):
    client, lib, *_ = env
    o = capture_fixture(lib)
    assert shelf(client, "month", "2026-10", sort="oldest")["file_ids"] == o["oldest_dated"]
    assert shelf(client, "month", "undated", sort="oldest")["file_ids"] == o["undated"]


@pytest.mark.parametrize("sort", SORTS)
def test_pd018_i4_undated_photos_follow_every_dated_one_in_a_mixed_shelf(env, sort):
    client, lib, *_ = env
    o = capture_fixture(lib)
    expected = o[f"{sort}_dated"] + o["undated"]
    assert shelf(client, "tag", "all", sort=sort)["file_ids"] == expected
    got = shelves(client, "tag", sort=sort, per_shelf=20)["shelves"]
    assert got[0]["key"] == "all"
    assert got[0]["file_ids"] == expected


@pytest.mark.parametrize("sort", SORTS)
@pytest.mark.parametrize("limit", [1, 2, 3, 100])
def test_pd018_i4_paging_the_shelf_neither_skips_nor_repeats(env, sort, limit):
    client, lib, *_ = env
    o = capture_fixture(lib)
    expected = o[f"{sort}_dated"] + o["undated"]
    seen, offset = [], 0
    while offset < len(expected) + limit:
        page = shelf(client, "tag", "all", sort=sort, limit=limit, offset=offset)
        assert page["total"] == len(expected)
        assert len(page["file_ids"]) <= limit
        seen += page["file_ids"]
        offset += limit
    assert seen == expected


def test_pd018_shelf_route_limit_defaults_to_40(env):
    client, lib, *_ = env
    made = [lib.add(filename=f"p{i:03d}.jpg", taken=None) for i in range(45)]
    got = shelf(client, "month", "undated")
    assert got["total"] == 45
    assert got["file_ids"] == made[:40]
    assert shelf(client, "month", "undated", offset=40)["file_ids"] == made[40:]


# ---------------------------------------------------------------- paging shelves


def months_fixture(lib, n, cap=23):
    """n months, newest first in the returned list, the month at index i holding min(i + 3, cap) photos."""
    out = []
    for i in range(n):
        year, month = 2026 - i // 12, 12 - i % 12
        fids = [lib.add(taken=f"{year}-{month:02d}-01T{h:02d}:00:00") for h in range(min(i + 3, cap))]
        out.append((f"{year}-{month:02d}", list(reversed(fids))))
    return out


def test_pd018_shelves_default_to_12_shelves_of_12_photos(env):
    client, lib, *_ = env
    made = months_fixture(lib, 15)
    got = shelves(client, "month")
    assert got["total_shelves"] == 15
    assert keys(got) == [k for k, _ in made[:12]]
    for s, (_, fids) in zip(got["shelves"], made[:12]):
        assert s["count"] == len(fids)
        assert s["file_ids"] == fids[:12]


@pytest.mark.parametrize("per_shelf", [1, 20])
def test_pd018_per_shelf_bounds_are_honoured(env, per_shelf):
    client, lib, *_ = env
    made = months_fixture(lib, 23)
    got = shelves(client, "month", per_shelf=per_shelf, shelf_limit=50)
    for s, (_, fids) in zip(got["shelves"], made):
        assert s["file_ids"] == fids[:per_shelf]
        assert s["count"] == len(fids)


@pytest.mark.parametrize("shelf_limit", [1, 50])
def test_pd018_shelf_limit_bounds_are_honoured(env, shelf_limit):
    client, lib, *_ = env
    made = months_fixture(lib, 52, cap=1)
    got = shelves(client, "month", shelf_limit=shelf_limit, per_shelf=1)
    assert got["total_shelves"] == 52
    assert keys(got) == [k for k, _ in made[:shelf_limit]]


@pytest.mark.parametrize("shelf_limit", [1, 5, 12])
def test_pd018_i4_paging_shelves_neither_skips_nor_repeats(env, shelf_limit):
    client, lib, *_ = env
    made = months_fixture(lib, 14)
    lib.add(taken=None)
    expected = [k for k, _ in made] + ["undated"]
    seen, offset = [], 0
    while offset < len(expected) + shelf_limit:
        page = shelves(client, "month", shelf_limit=shelf_limit, offset=offset)
        assert page["total_shelves"] == len(expected)
        seen += keys(page)
        offset += shelf_limit
    assert seen == expected


def test_pd018_offset_past_the_end_is_an_empty_page(env):
    client, lib, *_ = env
    lib.add(taken="2026-10-03T08:00:00")
    assert shelves(client, "month", offset=5) == {"shelves": [], "total_shelves": 1}
    assert shelf(client, "month", "2026-10", offset=5) == {"file_ids": [], "total": 1, "label": ""}


def test_pd018_empty_drive_has_no_shelf(env):
    client, *_ = env
    for by in BYS:
        assert shelves(client, by) == {"shelves": [], "total_shelves": 0}


# ---------------------------------------------------------------- tag


def tag_fixture(lib):
    f = {n: lib.add(filename=f"{n}.jpg", taken=f"2026-10-0{i + 1}T08:00:00") for i, n in enumerate("pqrstuv")}
    for n in "pqr":
        _tag(lib, f[n], "trip")
    _tag(lib, f["p"], "b")
    _tag(lib, f["q"], "a")
    _tag(lib, f["r"], "A")
    _tag(lib, f["s"], "é")
    _tag(lib, f["t"], nfd("é"))
    _tag(lib, f["u"], "elsewhere", drive=OTHER_DRIVE)
    video = lib.add(filename="v.mp4", file_type="video", exif=False)
    _tag(lib, video, "videos-only")
    return f


@pytest.mark.parametrize("sort", SORTS)
def test_pd018_i5_tags_by_count_then_text_order_with_no_tag_last_whatever_the_sort(env, sort):
    client, lib, *_ = env
    f = tag_fixture(lib)
    got = shelves(client, "tag", sort=sort)
    assert keys(got) == ["trip", "A", "a", "b", nfd("é"), "é", "no_tag"]
    by_key = {s["key"]: s for s in got["shelves"]}
    assert by_key["trip"]["label"] == "trip"
    assert by_key["trip"]["count"] == 3
    assert by_key["no_tag"] == {
        "key": "no_tag",
        "label": "",
        "count": 2,
        "file_ids": [f["v"], f["u"]] if sort == "newest" else [f["u"], f["v"]],
    }


def test_pd018_a_photo_is_on_one_tag_shelf_per_tag_it_carries(env):
    client, lib, *_ = env
    f = tag_fixture(lib)
    got = {s["key"]: s["file_ids"] for s in shelves(client, "tag")["shelves"]}
    assert f["p"] in got["trip"] and f["p"] in got["b"]
    assert f["p"] not in got["no_tag"]
    assert shelf(client, "tag", "b") == {"file_ids": [f["p"]], "total": 1, "label": "b"}
    assert shelf(client, "tag", "no_tag")["label"] == ""


def test_pd018_i6_a_tag_of_another_drive_and_a_video_only_tag_make_no_shelf(env):
    client, lib, *_ = env
    tag_fixture(lib)
    got = keys(shelves(client, "tag"))
    assert "elsewhere" not in got
    assert "videos-only" not in got
    assert shelf(client, "tag", "elsewhere") == {"file_ids": [], "total": 0, "label": "elsewhere"}


# ---------------------------------------------------------------- collection


def collection_fixture(lib):
    new = lib.add(taken="2026-10-01T08:00:00")
    old = lib.add(taken="2019-01-01T08:00:00")
    mid = lib.add(taken="2020-06-01T08:00:00")
    also_new = lib.add(taken="2026-10-01T08:00:00")
    u1 = lib.add(taken=None)
    u2 = lib.add(taken=None)
    loose = lib.add(taken="2024-01-01T08:00:00")
    video = lib.add(file_type="video", exif=False)
    ids = {
        "Beta": _collect(lib, "Beta", [new, old]),
        "alpha": _collect(lib, "alpha", [also_new, u1]),
        "Old": _collect(lib, "Old", [mid]),
        "Undated1": _collect(lib, "Undated1", [u1]),
        "Undated0": _collect(lib, "Undated0", [u2]),
        "VideoOnly": _collect(lib, "VideoOnly", [video]),
        "Empty": _collect(lib, "Empty", []),
        "Elsewhere": _collect(lib, "Elsewhere", [loose], drive=OTHER_DRIVE),
    }
    return ids, {"new": new, "old": old, "also_new": also_new, "u1": u1, "loose": loose}


def test_pd018_i5_collections_newest_by_their_newest_photo_ties_by_label(env):
    client, lib, *_ = env
    ids, f = collection_fixture(lib)
    got = shelves(client, "collection")
    assert keys(got) == [ids["alpha"], ids["Beta"], ids["Old"], ids["Undated0"], ids["Undated1"], "no_collection"]
    by_key = {s["key"]: s for s in got["shelves"]}
    assert by_key[ids["Beta"]] == {"key": ids["Beta"], "label": "Beta", "count": 2, "file_ids": [f["new"], f["old"]]}
    assert by_key[ids["alpha"]]["file_ids"] == [f["also_new"], f["u1"]]
    assert by_key["no_collection"] == {"key": "no_collection", "label": "", "count": 1, "file_ids": [f["loose"]]}


def test_pd018_i5_collections_oldest_by_their_oldest_photo(env):
    client, lib, *_ = env
    ids, f = collection_fixture(lib)
    got = shelves(client, "collection", sort="oldest")
    assert keys(got) == [ids["Beta"], ids["Old"], ids["alpha"], ids["Undated0"], ids["Undated1"], "no_collection"]
    assert got["shelves"][0]["file_ids"] == [f["old"], f["new"]]


def test_pd018_i6_collection_label_and_foreign_or_empty_collections(env):
    client, lib, *_ = env
    ids, f = collection_fixture(lib)
    got = keys(shelves(client, "collection"))
    for name in ("VideoOnly", "Empty", "Elsewhere"):
        assert ids[name] not in got
    assert shelf(client, "collection", ids["Beta"])["label"] == "Beta"
    assert shelf(client, "collection", ids["Elsewhere"]) == {"file_ids": [], "total": 0, "label": ""}
    assert shelf(client, "collection", "nosuchid0000") == {"file_ids": [], "total": 0, "label": ""}
    assert shelf(client, "collection", ids["Empty"]) == {"file_ids": [], "total": 0, "label": "Empty"}
    assert shelf(client, "collection", "no_collection") == {"file_ids": [f["loose"]], "total": 1, "label": ""}


# ---------------------------------------------------------------- folder


def test_pd018_folder_base_at_the_root_gives_one_shelf_per_year_and_the_root(env):
    client, lib, *_ = env
    y26 = lib.add(folder="2026/10", taken="2026-10-01T08:00:00")
    y26b = lib.add(folder="2026/11", taken="2026-11-01T08:00:00")
    y25 = lib.add(folder="2025/12", taken="2025-12-01T08:00:00")
    root = lib.add(folder="", taken="2026-01-01T08:00:00")
    got = shelves(client, "folder")
    assert [(s["key"], s["label"], s["count"], s["file_ids"]) for s in got["shelves"]] == [
        ("2026", "2026", 2, [y26b, y26]),
        ("", "", 1, [root]),
        ("2025", "2025", 1, [y25]),
    ]
    assert shelf(client, "folder", "") == {"file_ids": [root], "total": 1, "label": ""}
    assert shelf(client, "folder", "2026") == {"file_ids": [y26b, y26], "total": 2, "label": "2026"}
    assert shelf(client, "folder", "2026/") == {"file_ids": [], "total": 0, "label": "2026"}


def test_pd018_folder_base_moves_down_single_child_chains(env):
    client, lib, *_ = env
    a = lib.add(folder="Photos/2026/10", taken="2026-10-01T08:00:00")
    b = lib.add(folder="Photos/2026/11/deep", taken="2026-11-01T08:00:00")
    got = shelves(client, "folder")
    assert [(s["key"], s["label"], s["file_ids"]) for s in got["shelves"]] == [
        ("Photos/2026/11", "11", [b]),
        ("Photos/2026/10", "10", [a]),
    ]


def test_pd018_folder_base_stops_where_photos_lie_directly(env):
    client, lib, *_ = env
    direct = lib.add(folder="Photos", taken="2026-10-01T08:00:00")
    below = lib.add(folder="Photos/x", taken="2026-09-01T08:00:00")
    got = shelves(client, "folder")
    assert [(s["key"], s["label"], s["file_ids"]) for s in got["shelves"]] == [
        ("Photos/", "Photos", [direct]),
        ("Photos/x", "x", [below]),
    ]
    assert shelf(client, "folder", "Photos/") == {"file_ids": [direct], "total": 1, "label": "Photos"}
    assert shelf(client, "folder", "Photos") == {"file_ids": [direct, below], "total": 2, "label": "Photos"}


def test_pd018_folder_single_folder_drive_is_one_shelf(env):
    client, lib, *_ = env
    only = lib.add(folder="Only", taken="2026-10-01T08:00:00")
    got = shelves(client, "folder")
    assert [(s["key"], s["label"], s["file_ids"]) for s in got["shelves"]] == [("Only/", "Only", [only])]


def test_pd018_folder_key_matches_whole_segments_only(env):
    client, lib, *_ = env
    a = lib.add(folder="Photos/a", taken="2026-10-01T08:00:00")
    lib.add(folder="Photos2/b", taken="2026-10-01T08:00:00")
    assert shelf(client, "folder", "Photos")["file_ids"] == [a]


def test_pd018_i1_folder_names_are_compared_nfc_normalised(env):
    client, lib, *_ = env
    composed = lib.add(folder="café/x", taken="2026-10-01T08:00:00")
    decomposed = lib.add(folder=nfd("café") + "/y", taken="2026-09-01T08:00:00")
    other = lib.add(folder="other", taken="2026-08-01T08:00:00")
    got = shelves(client, "folder")["shelves"]
    assert [s["count"] for s in got] == [2, 1]
    assert got[0]["file_ids"] == [composed, decomposed]
    assert got[1]["file_ids"] == [other]
    assert unicodedata.normalize("NFC", got[0]["label"]) == "café"
    for key in ("café", nfd("café"), got[0]["key"]):
        assert shelf(client, "folder", key)["total"] == 2, key


@pytest.mark.parametrize("sort", SORTS)
def test_pd018_i5_folder_ties_by_label_root_first_all_undated_after(env, sort):
    client, lib, *_ = env
    lib.add(folder="b", taken="2026-10-01T08:00:00")
    lib.add(folder="", taken="2026-10-01T08:00:00")
    lib.add(folder="A", taken="2026-10-01T08:00:00")
    lib.add(folder="z", taken=None)
    lib.add(folder="c", taken=None)
    assert keys(shelves(client, "folder", sort=sort)) == ["", "A", "b", "c", "z"]


def test_pd018_i5_folders_oldest_by_their_oldest_photo(env):
    client, lib, *_ = env
    lib.add(folder="x", taken="2026-10-01T08:00:00")
    lib.add(folder="x", taken="2010-10-01T08:00:00")
    lib.add(folder="y", taken="2020-10-01T08:00:00")
    assert keys(shelves(client, "folder")) == ["x", "y"]
    lib.add(folder="y", taken="2027-01-01T08:00:00")
    assert keys(shelves(client, "folder")) == ["y", "x"]
    assert keys(shelves(client, "folder", sort="oldest")) == ["x", "y"]


# ---------------------------------------------------------------- I1, I2, I6 under targets


@pytest.mark.parametrize("sort", SORTS)
@pytest.mark.parametrize("by", BYS)
@pytest.mark.parametrize("target", TARGETS)
def test_pd018_i1_shelves_agree_with_the_shelf_route_and_cover_the_target(env, target, by, sort):
    client, lib, *_ = env
    seed(lib)
    expected = set(listing_ids(client, target))
    got = all_shelves(client, by, sort=sort, **target)
    union = []
    for s in got:
        assert s["count"] > 0
        whole = all_of_shelf(client, by, s["key"], sort=sort, **target)
        assert s["count"] == len(whole), s
        assert s["file_ids"] == whole[:20], s
        union += whole
        listed = shelf(client, by, s["key"], sort=sort, **target)
        assert listed["label"] == s["label"], s
    assert set(union) == expected
    if by in ("month", "folder"):
        assert sorted(union) == sorted(expected)


@pytest.mark.parametrize("by", BYS)
def test_pd018_i1_default_per_shelf_ids_are_the_head_of_the_shelf(env, by):
    client, lib, *_ = env
    seed(lib)
    for i in range(15):
        lib.add(folder="Photos", taken=f"2026-10-{i + 1:02d}T08:00:00")
    for s in shelves(client, by)["shelves"]:
        assert s["file_ids"] == shelf(client, by, s["key"])["file_ids"][:12]


@pytest.mark.parametrize("target", TARGETS)
def test_pd018_i2_month_counts_equal_the_calendar(env, target):
    client, lib, *_ = env
    seed(lib)
    cal = _ok(client, "/calendar/months", target)
    got = {s["key"]: s["count"] for s in all_shelves(client, "month", **target)}
    assert got.pop("undated", 0) == cal["undated_count"]
    assert got == {m["month"]: m["count"] for m in cal["months"] if m["count"]}


def test_pd018_i6_trashed_missing_and_non_image_files_are_in_no_shelf(env):
    client, lib, *_ = env
    keep = lib.add(folder="P", taken="2026-10-01T08:00:00")
    gone = [
        lib.add(folder="P", taken="2026-10-02T08:00:00", deleted=True),
        lib.add(folder="P", taken="2026-10-02T08:00:00", missing=True),
        lib.add(folder="P", file_type="video", taken="2026-10-02T08:00:00"),
        lib.add(folder="P", file_type="document", taken="2026-10-02T08:00:00"),
        lib.add(drive=OTHER_DRIVE, folder="P", taken="2026-10-02T08:00:00"),
    ]
    for fid in gone + [keep]:
        _tag(lib, fid, "t", drive=OTHER_DRIVE if fid == gone[-1] else DRIVE)
    for by in BYS:
        got = shelves(client, by)["shelves"]
        assert [s["file_ids"] for s in got] == [[keep]], by
        assert [s["count"] for s in got] == [1], by
    assert shelf(client, "month", "2026-10") == {"file_ids": [keep], "total": 1, "label": ""}


def test_pd018_none_target_has_no_shelf(env):
    client, lib, *_ = env
    seed(lib)
    for by in BYS:
        assert shelves(client, by, none="true") == {"shelves": [], "total_shelves": 0}
    assert shelf(client, "month", "2026-10", none="true") == {"file_ids": [], "total": 0, "label": ""}


def test_pd018_well_formed_key_with_no_photo_is_total_zero(env):
    client, lib, *_ = env
    lib.add(taken="2026-10-01T08:00:00")
    assert shelf(client, "month", "2020-01") == {"file_ids": [], "total": 0, "label": ""}
    assert shelf(client, "month", "undated") == {"file_ids": [], "total": 0, "label": ""}
    assert shelf(client, "tag", "nothing") == {"file_ids": [], "total": 0, "label": "nothing"}
    assert shelf(client, "folder", "nowhere/") == {"file_ids": [], "total": 0, "label": "nowhere"}


# ---------------------------------------------------------------- 422 (item 20)


@pytest.mark.parametrize("by", BYS)
def test_pd018_i6_every_by_and_sort_is_accepted(env, by):
    client, *_ = env
    for sort in SORTS:
        assert _get(client, "/library/shelves", {"by": by, "sort": sort}).status_code == 200


@pytest.mark.parametrize(
    "params",
    [
        pytest.param({"by": "year"}, id="by-unknown"),
        pytest.param({"by": "Month"}, id="by-case"),
        pytest.param({"by": ""}, id="by-empty"),
        pytest.param({}, id="by-missing"),
        pytest.param({"by": "month", "sort": "random"}, id="sort-unknown"),
        pytest.param({"by": "month", "sort": ""}, id="sort-empty"),
    ],
)
def test_pd018_i6_shelves_answers_422_to_a_bad_by_or_sort(env, params):
    client, *_ = env
    assert _get(client, "/library/shelves", {"by": "month"}).status_code == 200
    assert _get(client, "/library/shelves", params).status_code == 422


VALID_KEYS = [
    pytest.param("month", "2026-10", id="month"),
    pytest.param("month", "undated", id="month-undated"),
    pytest.param("tag", "trip", id="tag"),
    pytest.param("tag", "no_tag", id="tag-none"),
    pytest.param("collection", "abc", id="collection"),
    pytest.param("collection", "no_collection", id="collection-none"),
    pytest.param("folder", "", id="folder-root"),
    pytest.param("folder", "x/", id="folder-direct"),
    pytest.param("folder", "x", id="folder-subtree"),
]


@pytest.mark.parametrize("by, key", VALID_KEYS)
def test_pd018_shelf_accepts_every_key_form(env, by, key):
    client, *_ = env
    for sort in SORTS:
        r = _get(client, "/library/shelf", {"by": by, "key": key, "sort": sort})
        assert r.status_code == 200, r.text


BAD_SHELF = [
    pytest.param({"by": "month"}, id="key-missing"),
    pytest.param({"key": "2026-10"}, id="by-missing"),
    pytest.param({"by": "year", "key": "2026"}, id="by-unknown"),
    pytest.param({"by": "month", "key": "2026-10", "sort": "random"}, id="sort-unknown"),
    pytest.param({"by": "month", "key": ""}, id="month-empty"),
    pytest.param({"by": "tag", "key": ""}, id="tag-empty"),
    pytest.param({"by": "collection", "key": ""}, id="collection-empty"),
    pytest.param({"by": "month", "key": "2026-13"}, id="month-13"),
    pytest.param({"by": "month", "key": "2026-00"}, id="month-0"),
    pytest.param({"by": "month", "key": "2026-1"}, id="month-short"),
    pytest.param({"by": "month", "key": "202610"}, id="month-no-dash"),
    pytest.param({"by": "month", "key": "2026-10-03"}, id="month-date"),
    pytest.param({"by": "month", "key": "Undated"}, id="undated-case"),
    pytest.param({"by": "month", "key": "no_tag"}, id="month-other-sentinel"),
]


@pytest.mark.parametrize("params", BAD_SHELF)
def test_pd018_i6_shelf_answers_422_to_a_malformed_request(env, params):
    client, *_ = env
    assert _get(client, "/library/shelf", {"by": "month", "key": "2026-10"}).status_code == 200
    assert _get(client, "/library/shelf", params).status_code == 422
