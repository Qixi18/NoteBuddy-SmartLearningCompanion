"""JSON snapshot persistence for immutable analysis runs."""

from __future__ import annotations

import json
import tempfile
import threading
from pathlib import Path


class AnalysisRunRepository:
    def __init__(self, root: Path):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self._save_lock = threading.Lock()

    def save(self, run: dict) -> None:
        with self._save_lock:
            run_dir = self.root / run["run_id"]
            run_dir.mkdir(exist_ok=True)
            self._atomic_json(run_dir / "analysis.json", run)
            self._atomic_text(self.root / "current.txt", run["run_id"])

    def current(self) -> dict:
        pointer = self.root / "current.txt"
        if not pointer.exists():
            raise FileNotFoundError("尚未导入赛事数据")
        return self.load(pointer.read_text(encoding="utf-8").strip())

    def load(self, run_id: str) -> dict:
        if not run_id or any(char not in "0123456789abcdef" for char in run_id):
            raise ValueError("无效运行编号")
        return json.loads(
            (self.root / run_id / "analysis.json").read_text(encoding="utf-8")
        )

    @staticmethod
    def _atomic_text(path: Path, value: str) -> None:
        AnalysisRunRepository._atomic_write(path, value.encode("utf-8"))

    @classmethod
    def _atomic_json(cls, path: Path, value: dict) -> None:
        cls._atomic_write(
            path, json.dumps(value, ensure_ascii=False, indent=2).encode("utf-8")
        )

    @staticmethod
    def _atomic_write(path: Path, content: bytes) -> None:
        temporary_name = None
        try:
            with tempfile.NamedTemporaryFile(
                mode="wb",
                dir=path.parent,
                prefix=f"{path.name}.",
                suffix=".tmp",
                delete=False,
            ) as temporary:
                temporary_name = temporary.name
                temporary.write(content)
            Path(temporary_name).replace(path)
        finally:
            if temporary_name is not None:
                Path(temporary_name).unlink(missing_ok=True)
