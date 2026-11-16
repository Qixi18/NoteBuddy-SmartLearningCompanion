"""Consistent SQLite backup and safe restore helpers."""

from __future__ import annotations

import hashlib
import sqlite3
from contextlib import closing
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy.engine import make_url

from . import models as database_models

BACKEND_ROOT = Path(__file__).resolve().parents[3]


def _known_revisions() -> set[str]:
    config = Config(str(BACKEND_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))
    scripts = ScriptDirectory.from_config(config)
    return {revision.revision for revision in scripts.walk_revisions()}


def sqlite_path(database_url: str) -> Path:
    url = make_url(database_url)
    if (
        url.get_backend_name() != "sqlite"
        or not url.database
        or url.database == ":memory:"
    ):
        raise ValueError("备份/恢复仅支持文件型 SQLite 数据库")
    return Path(url.database).expanduser().resolve()


def _verify(path: Path) -> dict:
    with closing(sqlite3.connect(path)) as connection:
        integrity = [row[0] for row in connection.execute("PRAGMA integrity_check")]
        foreign_keys = list(connection.execute("PRAGMA foreign_key_check"))
        tables = [
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
            )
        ]
        revision = None
        if "alembic_version" in tables:
            row = connection.execute(
                "SELECT version_num FROM alembic_version"
            ).fetchone()
            revision = row[0] if row else None
        counts = {}
        for table in tables:
            escaped = table.replace('"', '""')
            counts[table] = connection.execute(
                f'SELECT COUNT(*) FROM "{escaped}"'
            ).fetchone()[0]
    if integrity != ["ok"] or foreign_keys:
        raise ValueError(
            f"SQLite 校验失败：integrity={integrity}, foreign_keys={foreign_keys[:10]}"
        )
    known_revisions = _known_revisions()
    if revision not in known_revisions:
        raise ValueError(f"SQLite 文件不是受支持的应用数据库 revision：{revision!r}")
    expected = {
        name: {column.name for column in table.columns}
        for name, table in database_models.Base.metadata.tables.items()
    }
    if set(tables) != set(expected) | {"alembic_version"}:
        raise ValueError("SQLite 文件的表集合与应用数据库 schema 不匹配")
    with closing(sqlite3.connect(path)) as connection:
        for table, expected_columns in expected.items():
            actual_columns = {
                row[1] for row in connection.execute(f'PRAGMA table_info("{table}")')
            }
            if actual_columns != expected_columns:
                raise ValueError(f"SQLite 文件的表结构与应用 schema 不匹配：{table}")
    hasher = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            hasher.update(chunk)
    digest = hasher.hexdigest()
    return {
        "path": str(path),
        "sha256": digest,
        "bytes": path.stat().st_size,
        "integrity_check": integrity,
        "foreign_key_violations": len(foreign_keys),
        "revision": revision,
        "tables": counts,
    }


def backup_database(database_url: str, destination: Path) -> dict:
    source = sqlite_path(database_url)
    destination = Path(destination).expanduser().resolve()
    if source == destination:
        raise ValueError("备份目标不能与数据库相同")
    if destination.exists():
        raise FileExistsError(f"备份目标已存在：{destination}")
    if not source.is_file():
        raise FileNotFoundError(f"SQLite 数据库不存在：{source}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    # Reserve atomically so a concurrent invocation cannot overwrite another backup.
    with destination.open("xb"):
        pass
    try:
        # SQLite backup API provides a consistent snapshot even while connections are open.
        with closing(
            sqlite3.connect(f"file:{source.as_posix()}?mode=ro", uri=True)
        ) as src:
            with closing(sqlite3.connect(destination)) as dst:
                src.backup(dst)
    except BaseException:
        destination.unlink(missing_ok=True)
        raise
    try:
        return _verify(destination)
    except Exception:
        destination.unlink(missing_ok=True)
        raise


def restore_database(backup: Path, destination: Path) -> dict:
    backup = Path(backup).expanduser().resolve()
    destination = Path(destination).expanduser().resolve()
    if destination.exists():
        raise FileExistsError(f"恢复目标已存在：{destination}")
    if not backup.is_file():
        raise FileNotFoundError(f"备份文件不存在：{backup}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("xb"):
        pass
    try:
        with closing(
            sqlite3.connect(f"file:{backup.as_posix()}?mode=ro", uri=True)
        ) as src:
            with closing(sqlite3.connect(destination)) as dst:
                src.backup(dst)
        return _verify(destination)
    except Exception:
        destination.unlink(missing_ok=True)
        raise
