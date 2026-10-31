import json
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.models import File, FileExif

DRIVE = "photos"
OTHER_DRIVE = "other"
LOCKED_DRIVE = "private"
JA_DRIVE = "写真"
LOCK_GROUP = "family"
BASE = "/api/addons/photo_diary"


def _enable_fk(engine):
    @event.listens_for(engine, "connect")
    def _pragma(dbapi_conn, _record):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()


class Library:
    """Rows are added through the core's own tables; the addon owns none."""

    def __init__(self, session):
        self.session = session
        self._n = 0

    def add(
        self,
        drive=DRIVE,
        filename=None,
        taken=None,
        lat=None,
        lon=None,
        file_type="image",
        exif=True,
        deleted=False,
        missing=False,
        file_id=None,
        folder="",
    ):
        self._n += 1
        filename = filename or f"img{self._n:04d}.jpg"
        fid = file_id or f"f{self._n:011d}"
        path = f"{folder}/{filename}" if folder else filename
        row = File(
            id=fid,
            filename=filename,
            title=filename,
            drive=drive,
            folder_path=folder,
            file_path=path,
            file_size=1,
            file_type=file_type,
            mime_type="image/jpeg" if file_type == "image" else "video/mp4",
            deleted_at=datetime.now(UTC) if deleted else None,
            missing_since=datetime.now(UTC) if missing else None,
        )
        self.session.add(row)
        self.session.flush()
        if exif:
            self.session.add(
                FileExif(file_id=fid, datetime_original=taken, gps_lat=lat, gps_lon=lon)
            )
        self.session.commit()
        return fid


@pytest.fixture()
def env(tmp_path, monkeypatch):
    import app.auth as auth
    import app.config as config
    import app.database as database
    import app.main as main

    engine = create_engine(
        f"sqlite:///{tmp_path / 'test.db'}", connect_args={"check_same_thread": False}
    )
    _enable_fk(engine)
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db():
        s = Session()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = override_get_db

    data_dir = tmp_path / "data"
    data_dir.mkdir()
    drives = []
    for name in (DRIVE, OTHER_DRIVE, LOCKED_DRIVE, JA_DRIVE):
        d = tmp_path / "drives" / name
        d.mkdir(parents=True)
        entry = {"name": name, "path": str(d)}
        if name == LOCKED_DRIVE:
            entry["access_group"] = LOCK_GROUP
        drives.append(entry)
    drives_json = tmp_path / "drives.json"
    drives_json.write_text(json.dumps(drives))

    async def noop():
        return None

    async def noop_scan():
        return {}

    monkeypatch.setattr(config, "DRIVES_CONFIG", drives_json)
    monkeypatch.setattr(config, "DATA_DIR", data_dir)
    monkeypatch.setattr(config, "_drives_cache", None)
    monkeypatch.setattr(auth, "_passwords_cache", [{"password": "pw", "groups": [LOCK_GROUP]}])
    monkeypatch.setattr(database, "engine", engine)
    monkeypatch.setattr(database, "SessionLocal", Session)
    monkeypatch.setattr(main, "SessionLocal", Session)
    monkeypatch.setattr(main, "scan_all_drives", noop_scan)
    monkeypatch.setattr(main, "purge_expired_trash", noop)

    session = Session()
    try:
        with TestClient(app) as client:
            yield client, Library(session), drives_json, auth
    finally:
        session.close()
        app.dependency_overrides.clear()
        engine.dispose()


def set_policy(drives_json, drive, policy):
    import app.config as config

    drives = json.loads(drives_json.read_text())
    for d in drives:
        if d["name"] == drive:
            d["addons"] = {"photo_diary": policy}
    drives_json.write_text(json.dumps(drives))
    config._drives_cache = None


def hdr(drive=DRIVE):
    from urllib.parse import quote

    return {"X-Lit-Drive": quote(drive, safe="")}
