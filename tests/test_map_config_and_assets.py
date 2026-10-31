"""SPEC-PD-004: tile source configuration and the bundled MapLibre files (I10)."""

import json
import os
import re
import subprocess
import sys
import textwrap
from pathlib import Path

import pytest

from .conftest import BASE, DRIVE, hdr

DEFAULT_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
DEFAULT_ATTRIBUTION = '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>'
ASSETS = Path(__file__).resolve().parent.parent / "backend" / "assets"

PROBE = textwrap.dedent(
    """
    import json, sys
    from fastapi.testclient import TestClient
    import app.config as config
    from pathlib import Path
    config.DRIVES_CONFIG = Path(sys.argv[1])
    from app.main import app
    r = TestClient(app).get(
        "/api/addons/photo_diary/map-config", headers={"X-Lit-Drive": "photos"}
    )
    print(json.dumps({"status": r.status_code, "body": r.json() if r.status_code == 200 else None}))
    """
)


def map_config(tmp_path, **env_vars):
    """A fresh process per case: the variables are read at start, a change needs a restart."""
    drives = tmp_path / "drives.json"
    (tmp_path / "d").mkdir(exist_ok=True)
    drives.write_text(json.dumps([{"name": DRIVE, "path": str(tmp_path / "d")}]))
    env = {k: v for k, v in os.environ.items() if not k.startswith("PHOTO_DIARY_")}
    env.update(env_vars)
    env["DATA_DIR"] = str(tmp_path / "data")
    out = subprocess.run(
        [sys.executable, "-c", PROBE, str(drives)],
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert out.returncode == 0, out.stderr[-2000:]
    return json.loads(out.stdout.strip().splitlines()[-1])


def test_pd004_defaults(tmp_path):
    r = map_config(tmp_path)
    assert r["status"] == 200
    assert r["body"] == {"tile_url": DEFAULT_URL, "attribution": DEFAULT_ATTRIBUTION}


def test_pd004_empty_url_means_defaults_for_both(tmp_path):
    r = map_config(
        tmp_path, PHOTO_DIARY_TILE_URL="", PHOTO_DIARY_TILE_ATTRIBUTION="<b>mine</b>"
    )
    assert r["body"] == {"tile_url": DEFAULT_URL, "attribution": DEFAULT_ATTRIBUTION}


def test_pd004_custom_url_and_attribution(tmp_path):
    r = map_config(
        tmp_path,
        PHOTO_DIARY_TILE_URL="https://tiles.example/{z}/{x}/{y}.png",
        PHOTO_DIARY_TILE_ATTRIBUTION="<b>mine</b>",
    )
    assert r["body"] == {
        "tile_url": "https://tiles.example/{z}/{x}/{y}.png",
        "attribution": "<b>mine</b>",
    }


def test_pd004_custom_url_without_attribution_shows_none(tmp_path):
    r = map_config(tmp_path, PHOTO_DIARY_TILE_URL="https://tiles.example/{z}/{x}/{y}.png")
    assert r["status"] == 200
    assert r["body"]["tile_url"] == "https://tiles.example/{z}/{x}/{y}.png"
    assert r["body"]["attribution"] == ""


def asset_files():
    assert ASSETS.is_dir(), f"{ASSETS} does not exist"
    files = sorted(p for p in ASSETS.iterdir() if p.is_file())
    assert files, "no bundled files"
    return files


def test_pd004_bundled_maplibre_names_carry_the_version():
    names = [p.name for p in asset_files()]
    assert any(n.endswith(".js") and "maplibre-gl" in n for n in names)
    assert any(n.endswith(".css") and "maplibre-gl" in n for n in names)
    assert all(re.search(r"\d+\.\d+\.\d+", n) for n in names)


def test_pd004_every_bundled_file_is_served_immutable_without_a_drive(env):
    client, *_ = env
    for p in asset_files():
        r = client.get(f"{BASE}/assets/{p.name}")
        assert r.status_code == 200, p.name
        assert r.content == p.read_bytes()
        assert r.headers["cache-control"] == "public, max-age=31536000, immutable"


def test_pd004_assets_unaffected_by_policy_off(env):
    from .conftest import set_policy

    client, _lib, drives_json, _auth = env
    name = asset_files()[0].name
    set_policy(drives_json, DRIVE, False)
    assert client.get(f"{BASE}/assets/{name}").status_code == 200


@pytest.mark.parametrize(
    "name",
    [
        "nonexistent.js",
        "maplibre-gl.js",
        "../router.py",
        "..%2Frouter.py",
        "%2e%2e%2f%2e%2e%2fbackend%2Frouter.py",
        "sub/maplibre-gl.js",
        "..%2f..%2f..%2fetc%2fpasswd",
        "",
    ],
)
def test_pd004_only_listed_names_are_served(env, name):
    client, *_ = env
    assert client.get(f"{BASE}/assets/{asset_files()[0].name}").status_code == 200
    assert client.get(f"{BASE}/assets/{name}").status_code == 404
