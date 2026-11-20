import hashlib
import json
import sqlite3
import sys
from pathlib import Path

import pytest
from app.api.app import create_app
from app.config import Settings
from app.services.shared.readiness_service import inspect_readiness
from fastapi.testclient import TestClient


def _current_revision() -> str:
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    backend = Path(__file__).resolve().parents[1]
    config = Config(str(backend / "alembic.ini"))
    config.set_main_option("script_location", str(backend / "alembic"))
    return ScriptDirectory.from_config(config).get_current_head()


def _settings(root: Path, database: Path) -> Settings:
    return Settings(
        project_root=root,
        data_dir=root / "data",
        resources_dir=root / "resources",
        source_files_dir=root / "source-files",
        web_dist_dir=root / "web-dist",
        database_url_override=f"sqlite:///{database.as_posix()}",
        model_api_key="",
        deepseek_api_key="",
    )


def _create_database(path: Path, revision: str | None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if revision is not None:
        from app.infrastructure.database import models as _models  # noqa: F401
        from app.infrastructure.database.base import Base
        from sqlalchemy import create_engine

        engine = create_engine(f"sqlite:///{path.as_posix()}")
        Base.metadata.create_all(engine)
        engine.dispose()
    with sqlite3.connect(path) as connection:
        if revision is None:
            connection.execute("CREATE TABLE legacy_data (id INTEGER PRIMARY KEY)")
        else:
            connection.execute(
                "CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL PRIMARY KEY)"
            )
            connection.execute(
                "INSERT INTO alembic_version(version_num) VALUES (?)", (revision,)
            )


def test_old_database_is_reported_as_migration_required_without_ddl(tmp_path: Path):
    database = tmp_path / "data" / "old.sqlite"
    _create_database(database, revision=None)
    before = hashlib.sha256(database.read_bytes()).hexdigest()

    report = inspect_readiness(_settings(tmp_path, database))

    assert report["status"] == "migration_required"
    assert report["database"]["status"] == "migration_required"
    assert report["database"]["revision"] is None
    assert hashlib.sha256(database.read_bytes()).hexdigest() == before
    with sqlite3.connect(database) as connection:
        assert connection.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        ).fetchall() == [("legacy_data",)]


def test_missing_pdf_is_never_reported_as_verified_and_model_is_optional(
    tmp_path: Path,
):
    database = tmp_path / "data" / "current.sqlite"
    _create_database(database, revision=_current_revision())
    config = _settings(tmp_path, database)
    config.web_dist_dir.mkdir(parents=True)
    (config.web_dist_dir / "index.html").write_text("<!doctype html>", encoding="utf-8")

    report = inspect_readiness(config)

    assert report["status"] == "ready_with_warnings"
    assert report["database"]["status"] == "current"
    assert report["sources"]["status"] == "missing"
    assert report["sources"]["verified"] is False
    assert report["model"]["configured"] is False
    assert report["model"]["required_for_core"] is False
    assert "api_key" not in json.dumps(report).lower()


def test_pdf_presence_only_reports_available_unverified_material(tmp_path: Path):
    database = tmp_path / "data" / "current.sqlite"
    _create_database(database, revision=_current_revision())
    source_dir = tmp_path / "source-files"
    source_dir.mkdir()
    (source_dir / "curriculum.pdf").write_bytes(b"synthetic pdf placeholder")

    report = inspect_readiness(_settings(tmp_path, database))

    assert report["sources"]["status"] == "available_unverified"
    assert report["sources"]["pdf_count"] == 1
    assert report["sources"]["verified"] is False


def test_readiness_api_is_read_only_and_returns_safe_status(tmp_path: Path):
    database = tmp_path / "data" / "old.sqlite"
    _create_database(database, revision=None)
    config = _settings(tmp_path, database)
    before = hashlib.sha256(database.read_bytes()).hexdigest()
    app = create_app(config=config)

    with TestClient(app) as client:
        response = client.get("/api/readiness")

    assert response.status_code == 200
    assert response.json()["status"] == "migration_required"
    assert response.headers.get("cache-control") == "no-store"
    assert str(tmp_path) not in response.text
    assert hashlib.sha256(database.read_bytes()).hexdigest() == before


def test_doctor_reports_json_and_returns_nonzero_when_migration_is_required(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys
):
    from app import config as config_module
    from app.cli import main

    database = tmp_path / "data" / "old.sqlite"
    _create_database(database, revision=None)
    before = hashlib.sha256(database.read_bytes()).hexdigest()
    config = _settings(tmp_path, database)
    monkeypatch.setattr(config_module, "settings", config)
    monkeypatch.delenv("SMART_LEARNING_DATABASE_URL", raising=False)
    monkeypatch.setattr(sys, "argv", ["smart-learning", "doctor"])

    with pytest.raises(SystemExit) as result:
        main()

    report = json.loads(capsys.readouterr().out)
    assert result.value.code == 1
    assert report["status"] == "migration_required"
    assert hashlib.sha256(database.read_bytes()).hexdigest() == before
