"""Read-only checks for local runtime, database schema, and optional resources."""

from __future__ import annotations

import importlib.util
import sqlite3
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from alembic.util.exc import CommandError
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError

from ...config import Settings, settings
from ...infrastructure.database import models as _models  # noqa: F401
from ...infrastructure.database.base import Base

BACKEND_ROOT = Path(__file__).resolve().parents[3]
REQUIRED_MODULES = ("fastapi", "sqlalchemy", "alembic")


def _head_revision() -> str:
    config = Config(str(BACKEND_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))
    head = ScriptDirectory.from_config(config).get_current_head()
    if not head:
        raise RuntimeError("当前 Alembic 项目没有 head revision")
    return head


def _database_status(database_url: str, head: str, project_root: Path) -> dict:
    try:
        url = make_url(database_url)
    except (ArgumentError, TypeError, ValueError):
        return {
            "status": "unreadable",
            "revision": None,
            "head_revision": head,
            "schema_matches": False,
        }
    if (
        url.get_backend_name() != "sqlite"
        or not url.database
        or url.database == ":memory:"
    ):
        return {
            "status": "unsupported",
            "revision": None,
            "head_revision": head,
            "schema_matches": False,
        }

    database_path = Path(url.database).expanduser()
    if not database_path.is_absolute():
        database_path = Path(project_root) / database_path
    database_path = database_path.resolve()
    if not database_path.is_file():
        return {
            "status": "migration_required",
            "revision": None,
            "head_revision": head,
            "schema_matches": False,
        }

    expected_columns = {
        name: {column.name for column in table.columns}
        for name, table in Base.metadata.tables.items()
    }
    try:
        with sqlite3.connect(
            database_path.as_uri() + "?mode=ro", uri=True
        ) as connection:
            tables = {
                row[0]
                for row in connection.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
                )
            }
            revision = None
            if "alembic_version" in tables:
                row = connection.execute(
                    "SELECT version_num FROM alembic_version"
                ).fetchone()
                revision = row[0] if row else None
            expected_tables = set(expected_columns) | {"alembic_version"}
            missing_tables = sorted(expected_tables - tables)
            unexpected_tables = sorted(tables - expected_tables)
            column_mismatches = []
            for table, columns in expected_columns.items():
                if table not in tables:
                    continue
                actual_columns = {
                    row[1]
                    for row in connection.execute(f'PRAGMA table_info("{table}")')
                }
                if actual_columns != columns:
                    column_mismatches.append(table)
    except (OSError, sqlite3.Error, ValueError):
        return {
            "status": "unreadable",
            "revision": None,
            "head_revision": head,
            "schema_matches": False,
        }

    schema_matches = (
        not missing_tables and not unexpected_tables and not column_mismatches
    )
    status = "current" if revision == head and schema_matches else "migration_required"
    return {
        "status": status,
        "revision": revision,
        "head_revision": head,
        "schema_matches": schema_matches,
        "missing_tables": missing_tables,
        "unexpected_tables": unexpected_tables,
        "column_mismatches": column_mismatches,
    }


def _source_status(config: Settings) -> dict:
    directories = {
        path.resolve()
        for path in (
            config.source_files_dir,
            config.resources_dir,
            config.data_dir / "imported_sources",
        )
        if path is not None
    }
    pdfs = set()
    for directory in directories:
        if directory.is_dir():
            try:
                pdfs.update(
                    path.resolve()
                    for path in directory.rglob("*.pdf")
                    if path.is_file()
                )
            except OSError:
                continue
    count = len(pdfs)
    return {
        "status": "available_unverified" if count else "missing",
        "pdf_count": count,
        "verified": False,
    }


def inspect_readiness(config: Settings = settings) -> dict:
    """Inspect the local deployment without creating or migrating a database."""
    try:
        head = _head_revision()
    except (OSError, CommandError, RuntimeError):
        head = "unknown"
    database = _database_status(config.database_url, head, config.project_root)
    sources = _source_status(config)
    frontend_built = (config.web_dist_dir / "index.html").is_file()
    missing_modules = [
        module
        for module in REQUIRED_MODULES
        if importlib.util.find_spec(module) is None
    ]
    model_configured = bool((config.model_api_key or config.deepseek_api_key).strip())
    deepseek_ocr_configured = bool(
        config.deepseek_api_key.strip()
        or (
            config.model_provider.strip().lower() == "deepseek"
            and config.model_api_key.strip()
        )
    )

    if database["status"] in {"unreadable", "unsupported"} or missing_modules:
        status = "blocked"
    elif database["status"] != "current":
        status = "migration_required"
    elif (
        not frontend_built
        or sources["status"] == "missing"
        or not model_configured
        or not deepseek_ocr_configured
    ):
        status = "ready_with_warnings"
    else:
        status = "ready"

    checks = [
        {
            "id": "database",
            "status": "passed" if database["status"] == "current" else "blocked",
            "detail": "当前迁移版本与数据库结构一致。"
            if database["status"] == "current"
            else "数据库未就绪；请检查迁移版本和表结构后再显式运行升级命令。",
        },
        {
            "id": "runtime_dependencies",
            "status": "blocked" if missing_modules else "passed",
            "detail": "缺少运行依赖：" + "、".join(missing_modules)
            if missing_modules
            else "核心 Python 依赖可用。",
        },
        {
            "id": "source_pdfs",
            "status": "passed" if sources["pdf_count"] else "warning",
            "detail": "找到 PDF 文件；文件存在不代表内容已核验。"
            if sources["pdf_count"]
            else "未找到来源 PDF；来源签核仍须由教师完成。",
        },
        {
            "id": "deepseek_ocr",
            "status": "passed" if deepseek_ocr_configured else "warning",
            "detail": "DeepSeek OCR 自动解析已配置。"
            if deepseek_ocr_configured
            else "未配置 DeepSeek API Key；导入时课程标准和教材 PDF 将无法自动解析。",
        },
        {
            "id": "frontend_build",
            "status": "passed" if frontend_built else "warning",
            "detail": "前端构建文件可用。"
            if frontend_built
            else "未找到前端构建文件；开发模式仍可使用 Vite。",
        },
        {
            "id": "optional_model",
            "status": "passed" if model_configured else "warning",
            "detail": "模型草稿能力已配置。"
            if model_configured
            else "未配置模型密钥；核心统计、规则草稿和导出仍可使用。",
        },
    ]
    return {
        "status": status,
        "database": database,
        "sources": sources,
        "frontend": {"built": frontend_built},
        "runtime": {"missing_modules": missing_modules},
        "model": {
            "configured": model_configured,
            "required_for_core": False,
        },
        "deepseek_ocr": {"configured": deepseek_ocr_configured},
        "checks": checks,
    }
