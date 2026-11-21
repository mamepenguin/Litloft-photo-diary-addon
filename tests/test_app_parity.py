"""SPEC-PD-023 / SPEC-PD-024: the `by=all` Library routes and `tag` on the POST Library routes."""

import pytest

from .conftest import BASE, DRIVE, hdr
from .test_library import all_of_shelf, all_shelves, shelf, shelves
from .test_target import TARGETS
from .test_target import seed as seed_targets
from .test_target_members import ORACLE
from .test_target_members import seed as seed_members

SORTS = ["newest", "oldest"]
CHOSEN = [
    pytest.param([], id="no-tag-chosen"),
    pytest.param(["trip"], id="tag-chosen"),
    pytest.param(["Trip", "nothing"], id="two-tags-chosen"),
]


def under(target, chosen):
    """The target's own parameters with the chosen tags after its own tags."""
    if not chosen:
        return dict(target)
    return {**target, "tag": [*target.get("tag", []), *chosen]}


def _get(client, route, params):
    return client.get(f"{BASE}{route}", params=params, headers=hdr(DRIVE))


def _post(client, route, params, ids):
    return client.post(f"{BASE}{route}", params=params, json={"file_ids": ids}, headers=hdr(DRIVE))


def _ok_get(client, route, params):
    r = _get(client, route, params)
    assert r.status_code == 200, r.text
    return r.json()


def _ok_post(client, route, params, ids):
    r = _post(client, route, params, ids)
    assert r.status_code == 200, r.text
    return r.json()


# ---------------------------------------------------------------- SPEC-PD-023 I3: by=all


@pytest.mark.parametrize("sort", SORTS)
@pytest.mark.parametrize("chosen", CHOSEN)
@pytest.mark.parametrize("target", TARGETS)
def test_pd023_i3_all_holds_the_month_shelves_photos_once_each_in_their_order(env, target, chosen, sort):
    client, lib, *_ = env
    seed_targets(lib)
    cond = under(target, chosen)
    months = all_shelves(client, "month", sort=sort, **cond)
    expected = []
    for s in months:
        expected += all_of_shelf(client, "month", s["key"], sort=sort, **cond)
    got = all_of_shelf(client, "all", "all", sort=sort, **cond)
    assert got == expected
    assert len(got) == len(set(got))
    assert shelf(client, "all", "all", sort=sort, **cond)["total"] == sum(s["count"] for s in months)


@pytest.mark.parametrize("sort", SORTS)
@pytest.mark.parametrize("chosen", CHOSEN)
@pytest.mark.parametrize("target", TARGETS)
def test_pd023_i3_all_shelves_is_one_shelf_with_that_count_or_none(env, target, chosen, sort):
    client, lib, *_ = env
    seed_targets(lib)
    cond = under(target, chosen)
    whole = all_of_shelf(client, "all", "all", sort=sort, **cond)
    got = shelves(client, "all", sort=sort, **cond)
    if whole:
        assert got == {
            "shelves": [{"key": "all", "label": "", "count": len(whole), "file_ids": whole[:12]}],
            "total_shelves": 1,
        }
    else:
        assert got == {"shelves": [], "total_shelves": 0}


def test_pd023_i3_all_holds_photos_no_other_classification_would_shelve(env):
    client, lib, *_ = env
    dated = lib.add(taken="2026-10-03T08:00:00")
    undated = lib.add(taken=None)
    no_exif = lib.add(exif=False, folder="a/b")
    for sort in SORTS:
        got = all_of_shelf(client, "all", "all", sort=sort)
        assert got[0] == dated
        assert sorted(got) == sorted([dated, undated, no_exif])


@pytest.mark.parametrize("sort", SORTS)
def test_pd023_item6_undated_photos_follow_every_dated_one(env, sort):
    client, lib, *_ = env
    undated = [lib.add(taken=None), lib.add(exif=False)]
    dated = [
        lib.add(taken="2026-10-03T08:00:00"),
        lib.add(taken="2024-01-01T08:00:00"),
        lib.add(taken="2025-06-30T08:00:00"),
    ]
    got = all_of_shelf(client, "all", "all", sort=sort)
    by_time = [dated[1], dated[2], dated[0]]
    assert got[:3] == (by_time if sort == "oldest" else by_time[::-1])
    assert sorted(got[3:]) == sorted(undated)


def test_pd023_item6_all_pages_by_40_with_offset(env):
    client, lib, *_ = env
    for i in range(45):
        lib.add(taken=f"2026-10-03T08:{i:02d}:00")
    first = shelf(client, "all", "all")
    assert len(first["file_ids"]) == 40
    assert first["total"] == 45
    rest = shelf(client, "all", "all", offset=40)
    assert len(rest["file_ids"]) == 5
    assert not set(first["file_ids"]) & set(rest["file_ids"])


@pytest.mark.parametrize(
    "key",
    [
        pytest.param("", id="empty"),
        pytest.param("ALL", id="case"),
        pytest.param("2026-10", id="a-month"),
        pytest.param("undated", id="undated"),
        pytest.param("no_tag", id="sentinel"),
    ],
)
def test_pd023_i3_by_all_takes_only_key_all(env, key):
    client, lib, *_ = env
    lib.add(taken="2026-10-03T08:00:00")
    assert _get(client, "/library/shelf", {"by": "all", "key": "all"}).status_code == 200
    assert _get(client, "/library/shelf", {"by": "all", "key": key}).status_code == 422


def test_pd023_i3_by_all_under_an_empty_target_is_nothing(env):
    client, lib, *_ = env
    lib.add(taken="2026-10-03T08:00:00")
    assert shelf(client, "all", "all", none="true") == {"file_ids": [], "total": 0, "label": ""}
    assert shelves(client, "all", none="true") == {"shelves": [], "total_shelves": 0}


@pytest.mark.parametrize("sort", SORTS)
def test_pd023_post_by_all_answers_what_get_answers_for_the_listed_images(env, sort):
    client, lib, *_ = env
    s = seed_members(lib)
    for route, base in (
        ("/library/shelves", {"by": "all", "sort": sort}),
        ("/library/shelf", {"by": "all", "key": "all", "sort": sort}),
    ):
        oracle = _ok_get(client, route, {**base, "collection": [ORACLE]})
        assert oracle != _ok_get(client, route, base)
        assert _ok_post(client, route, base, s["members"]) == oracle


# ---------------------------------------------------------------- SPEC-PD-024 I6: tag on the POST Library routes


LIBRARY_POSTS = [
    pytest.param("/library/shelves", {"by": "month"}, id="shelves-month"),
    pytest.param("/library/shelves", {"by": "month", "sort": "oldest", "per_shelf": "1"}, id="shelves-month-oldest"),
    pytest.param("/library/shelves", {"by": "tag"}, id="shelves-tag"),
    pytest.param("/library/shelves", {"by": "folder"}, id="shelves-folder"),
    pytest.param("/library/shelves", {"by": "collection"}, id="shelves-collection"),
    pytest.param("/library/shelves", {"by": "all"}, id="shelves-all"),
    pytest.param("/library/shelf", {"by": "month", "key": "2026-10"}, id="shelf-month"),
    pytest.param("/library/shelf", {"by": "month", "key": "undated"}, id="shelf-undated"),
    pytest.param("/library/shelf", {"by": "tag", "key": "trip"}, id="shelf-tag"),
    pytest.param("/library/shelf", {"by": "all", "key": "all", "offset": "1", "limit": "2"}, id="shelf-all-paged"),
]

POST_TAGS = [
    pytest.param(["trip"], id="trip"),
    pytest.param(["Trip"], id="case"),
    pytest.param(["trip", "nothing"], id="repeated-no-photo"),
    pytest.param(["trip", "trip"], id="repeated-same"),
]


@pytest.mark.parametrize("tags", POST_TAGS)
@pytest.mark.parametrize("route, base", LIBRARY_POSTS)
def test_pd024_i6_post_with_tag_answers_the_get_for_a_collection_of_the_ids_plus_that_tag(env, route, base, tags):
    client, lib, *_ = env
    s = seed_members(lib)
    oracle = _ok_get(client, route, {**base, "collection": [ORACLE], "tag": tags})
    assert _ok_post(client, route, {**base, "tag": tags}, s["members"]) == oracle


def test_pd024_i6_post_tag_narrows_the_member_set(env):
    client, lib, *_ = env
    a = lib.add(filename="a.jpg", taken="2026-10-03T08:00:00")
    b = lib.add(filename="b.jpg", taken="2026-10-03T09:00:00")
    u = lib.add(filename="u.jpg", taken=None)
    lib.add(filename="c.jpg", taken="2026-10-03T10:00:00")
    from .test_target import _tag

    _tag(lib, a, "trip")
    _tag(lib, u, "trip")
    members = [a, b, u]
    got = _ok_post(client, "/library/shelf", {"by": "month", "key": "2026-10", "tag": ["trip"]}, members)
    assert got == {"file_ids": [a], "total": 1, "label": ""}
    got = _ok_post(client, "/library/shelves", {"by": "month", "tag": ["trip"]}, members)
    assert [(x["key"], x["file_ids"]) for x in got["shelves"]] == [("2026-10", [a]), ("undated", [u])]
    assert _ok_post(client, "/library/shelf", {"by": "month", "key": "2026-10", "tag": ["nothing"]}, members) == {
        "file_ids": [],
        "total": 0,
        "label": "",
    }


@pytest.mark.parametrize(
    "route, base",
    [
        pytest.param("/library/shelves", {"by": "month"}, id="shelves"),
        pytest.param("/library/shelf", {"by": "month", "key": "2026-10"}, id="shelf"),
    ],
)
@pytest.mark.parametrize(
    "tags",
    [pytest.param([""], id="empty-alone"), pytest.param(["trip", ""], id="empty-among-tags")],
)
def test_pd024_i6_an_empty_tag_on_the_post_library_routes_is_422(env, route, base, tags):
    client, lib, *_ = env
    fid = lib.add(filename="a.jpg", taken="2026-10-03T08:00:00")
    assert _post(client, route, {**base, "tag": ["trip"]}, [fid]).status_code == 200
    assert _post(client, route, {**base, "tag": tags}, [fid]).status_code == 422


@pytest.mark.parametrize(
    "param",
    [
        pytest.param({"search": "beach"}, id="search"),
        pytest.param({"folder": ["Photos"]}, id="folder"),
        pytest.param({"collection": ["Album"]}, id="collection"),
        pytest.param({"none": "true"}, id="none"),
        pytest.param({"favorite": "true"}, id="favorite"),
    ],
)
def test_pd024_i6_tag_does_not_open_the_post_library_routes_to_other_target_parameters(env, param):
    client, lib, *_ = env
    fid = lib.add(filename="a.jpg", taken="2026-10-03T08:00:00")
    base = {"by": "month", "tag": ["trip"]}
    assert _post(client, "/library/shelves", base, [fid]).status_code == 200
    assert _post(client, "/library/shelves", {**base, **param}, [fid]).status_code == 422
