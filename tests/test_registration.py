"""SPEC-PD-001, SPEC-PD-002, SPEC-PD-003: registration metadata and viewer messages."""

import json
from pathlib import Path

from .conftest import DRIVE, OTHER_DRIVE, set_policy

FRONTEND_MESSAGES = Path(__file__).resolve().parent.parent / "frontend" / "messages"


def status(client, drive=None):
    r = client.get("/api/addons/status", params={"drive": drive} if drive else {})
    assert r.status_code == 200
    return r.json()


def test_pd003_addon_is_registered_with_declared_metadata(env):
    client, *_ = env
    addon = status(client, DRIVE)["addons"]["photo_diary"]
    assert addon["label"] == "Photo Diary"
    assert addon["scope"] == "drive"
    assert addon["href"] == "/addons/photo_diary"
    assert addon["description"] == "Look back at your photos on a calendar and a map."
    assert not addon.get("policy_features")
    nav = addon["navigation"]
    assert nav["i18n_key"] == "photoDiary.nav.label"
    assert nav["label"] == "Photo Diary"
    assert nav["placement"] == "primary"
    assert nav["priority"] == 30
    assert "icon" not in nav or nav["icon"] is None


def test_pd003_addon_is_dropped_from_a_drive_whose_policy_is_off(env):
    client, _lib, drives_json, _auth = env
    assert "photo_diary" in status(client, DRIVE)["addons"]
    set_policy(drives_json, DRIVE, False)
    assert "photo_diary" not in status(client, DRIVE)["addons"]
    assert "photo_diary" in status(client, OTHER_DRIVE)["addons"]


def flatten(node):
    if isinstance(node, dict):
        for v in node.values():
            yield from flatten(v)
    elif isinstance(node, str):
        yield node


EXPECTED = {
    "en": [
        "Could not load", "Retry", "Not available on this drive",
        "No photos with a capture date", "No photos on this day",
        "No photos with a location", "Map tiles could not be loaded",
        "The map cannot be shown on this device", "Calendar", "Map",
        "Previous month", "Next month", "Choose month", "Close",
        "No capture date",
    ],
    "ja": [
        "読み込めませんでした", "再試行", "このドライブでは使えません",
        "撮影日のある写真はありません", "この日の写真はありません",
        "位置情報のある写真はありません", "地図を読み込めません",
        "この環境では地図を表示できません", "カレンダー", "地図",
        "前の月", "次の月", "月を選ぶ", "閉じる", "撮影日なし",
    ],
}


def load(locale):
    path = FRONTEND_MESSAGES / f"{locale}.json"
    assert path.is_file(), f"{path} does not exist"
    return json.loads(path.read_text())


def test_pd003_viewer_messages_exist_in_both_locales():
    for locale, phrases in EXPECTED.items():
        values = set(flatten(load(locale)))
        missing = [p for p in phrases if p not in values]
        assert not missing, (locale, missing)


def test_pd003_nav_label_key():
    assert load("en")["photoDiary"]["nav"]["label"] == "Photo Diary"
    assert load("ja")["photoDiary"]["nav"]["label"] == "フォトダイアリー"
