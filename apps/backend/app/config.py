"""Validated application settings with repository-root path semantics."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlencode

from sqlalchemy.engine import make_url
from dotenv import load_dotenv


PROJECT_ROOT = Path(__file__).resolve().parents[3]
load_dotenv(PROJECT_ROOT / ".env", override=False)


def resolve_path(value: str | Path, *, base: Path = PROJECT_ROOT) -> Path:
    """Resolve configured and CLI paths independently of the process CWD."""
    path = Path(value).expanduser()
    root = Path(base).expanduser().resolve()
    return (path if path.is_absolute() else root / path).resolve()


def resolve_database_url(value: str, *, base: Path = PROJECT_ROOT) -> str:
    url = make_url(value)
    if url.get_backend_name() != "sqlite":
        raise ValueError("本项目仅支持 SQLite 数据库 URL")
    if not url.database or url.database == ":memory:":
        return value
    database = Path(url.database).expanduser()
    if not database.is_absolute():
        resolved = resolve_path(database, base=base).as_posix()
        query = f"?{urlencode(url.query, doseq=True)}" if url.query else ""
        return f"sqlite:///{resolved}{query}"
    return value


@dataclass(frozen=True)
class Settings:
    project_root: Path = field(default_factory=lambda: PROJECT_ROOT)
    data_dir: Path | None = None
    resources_dir: Path | None = None
    source_files_dir: Path | None = None
    web_dist_dir: Path | None = None
    host: str = field(
        default_factory=lambda: os.getenv("SMART_LEARNING_HOST", "127.0.0.1")
    )
    port: int = field(
        default_factory=lambda: int(os.getenv("SMART_LEARNING_PORT", "8765"))
    )
    database_url_override: str = field(
        default_factory=lambda: os.getenv("SMART_LEARNING_DATABASE_URL", "")
    )
    backup_dir: Path | None = None
    deepseek_api_key: str = field(
        default_factory=lambda: os.getenv("DEEPSEEK_API_KEY", ""), repr=False
    )
    deepseek_model: str = field(
        default_factory=lambda: os.getenv("DEEPSEEK_MODEL", "deepseek-flash")
    )
    deepseek_timeout_seconds: int = field(
        default_factory=lambda: int(os.getenv("DEEPSEEK_TIMEOUT_SECONDS", "30"))
    )
    deepseek_ocr_timeout_seconds: int = field(
        default_factory=lambda: int(os.getenv("DEEPSEEK_OCR_TIMEOUT_SECONDS", "180"))
    )
    deepseek_ocr_api_url: str = field(
        default_factory=lambda: os.getenv(
            "DEEPSEEK_OCR_API_URL", "https://api.deepseek.com/v1/tools/ocr"
        )
    )
    model_provider: str = field(
        default_factory=lambda: os.getenv("MODEL_PROVIDER", "deepseek")
    )
    model_api_url: str = field(default_factory=lambda: os.getenv("MODEL_API_URL", ""))
    model_api_key: str = field(
        default_factory=lambda: os.getenv(
            "MODEL_API_KEY", os.getenv("DEEPSEEK_API_KEY", "")
        ),
        repr=False,
    )
    model_name: str = field(
        default_factory=lambda: os.getenv(
            "MODEL_NAME", os.getenv("DEEPSEEK_MODEL", "deepseek-flash")
        )
    )

    def __post_init__(self) -> None:
        root = Path(self.project_root).expanduser().resolve()
        object.__setattr__(self, "project_root", root)
        if not self.host.strip():
            raise ValueError("SMART_LEARNING_HOST 不能为空")
        if not 1 <= self.port <= 65535:
            raise ValueError("SMART_LEARNING_PORT 必须在 1 到 65535 之间")
        if not 1 <= self.deepseek_timeout_seconds <= 120:
            raise ValueError("DEEPSEEK_TIMEOUT_SECONDS 必须在 1 到 120 之间")
        if not 1 <= self.deepseek_ocr_timeout_seconds <= 180:
            raise ValueError("DEEPSEEK_OCR_TIMEOUT_SECONDS 必须在 1 到 180 之间")
        if not self.deepseek_ocr_api_url.startswith("https://"):
            raise ValueError("DEEPSEEK_OCR_API_URL 必须使用 HTTPS")
        provider = self.model_provider.strip().lower()
        if provider == "deepseek" and not self.model_api_url:
            object.__setattr__(
                self, "model_api_url", "https://api.deepseek.com/chat/completions"
            )
        elif provider == "openai" and not self.model_api_url:
            object.__setattr__(
                self, "model_api_url", "https://api.openai.com/v1/chat/completions"
            )
        if self.model_api_key and not self.model_api_url.startswith("https://"):
            raise ValueError("MODEL_API_URL 必须使用 HTTPS")
        if not self.model_provider.strip() or not self.model_name.strip():
            raise ValueError("模型提供商和模型名称不能为空")
        path_values = {
            "data_dir": self.data_dir or os.getenv("SMART_LEARNING_DATA_DIR", "data"),
            "resources_dir": self.resources_dir
            or os.getenv("SMART_LEARNING_RESOURCES_DIR", "resources"),
            "web_dist_dir": self.web_dist_dir
            or os.getenv(
                "SMART_LEARNING_WEB_DIST_DIR", str(root / "apps/backend/app/web/dist")
            ),
        }
        for name, value in path_values.items():
            object.__setattr__(self, name, resolve_path(value, base=root))
        source_files = self.source_files_dir
        if source_files is None:
            source_files = os.getenv("SMART_LEARNING_SOURCE_FILES_DIR", "").strip()
        object.__setattr__(
            self,
            "source_files_dir",
            resolve_path(source_files, base=root) if source_files else None,
        )
        backup = self.backup_dir or os.getenv("SMART_LEARNING_BACKUP_DIR")
        object.__setattr__(
            self, "backup_dir", resolve_path(backup, base=root) if backup else None
        )
        if self.database_url_override:
            object.__setattr__(
                self,
                "database_url_override",
                resolve_database_url(self.database_url_override, base=root),
            )

    @property
    def database_url(self) -> str:
        if self.database_url_override:
            return self.database_url_override
        return f"sqlite:///{(self.project_root / 'data' / 'smart_learning.db').resolve().as_posix()}"

    @property
    def default_backup_root(self) -> Path:
        return self.project_root.parent / "_backups" / "smart-learning"


settings = Settings()
