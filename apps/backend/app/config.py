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
    deepseek_api_key: str = os.getenv("DEEPSEEK_API_KEY", "")
    deepseek_model: str = os.getenv("DEEPSEEK_MODEL", "deepseek-flash")


settings = Settings()
