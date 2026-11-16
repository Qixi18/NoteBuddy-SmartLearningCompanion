"""应用运行配置。"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    project_root: Path = Path(__file__).resolve().parents[3]
    data_dir: Path = Path(
        os.getenv("SMART_LEARNING_DATA_DIR", str(project_root / "data"))
    )
    resources_dir: Path = Path(
        os.getenv("SMART_LEARNING_RESOURCES_DIR", str(project_root / "resources"))
    )
    web_dist_dir: Path = Path(
        os.getenv(
            "SMART_LEARNING_WEB_DIST_DIR",
            str(Path(__file__).resolve().parent / "web" / "dist"),
        )
    )
    host: str = os.getenv("SMART_LEARNING_HOST", "127.0.0.1")
    port: int = int(os.getenv("SMART_LEARNING_PORT", "8765"))
    database_url_override: str = os.getenv("SMART_LEARNING_DATABASE_URL", "")
    deepseek_api_key: str = os.getenv("DEEPSEEK_API_KEY", "")
    deepseek_model: str = os.getenv("DEEPSEEK_MODEL", "deepseek-flash")

    @property
    def database_url(self) -> str:
        if self.database_url_override:
            return self.database_url_override
        return f"sqlite:///{(self.data_dir / 'smart_learning.db').resolve().as_posix()}"


settings = Settings()
