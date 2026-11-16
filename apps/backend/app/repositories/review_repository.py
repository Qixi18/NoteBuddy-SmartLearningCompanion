"""Append-only JSON persistence for teacher review history."""

from __future__ import annotations

import json
import threading
from datetime import datetime, timezone
from pathlib import Path


class ReviewRepository:
    def __init__(self, root: Path):
        self.root = Path(root)
        self._lock = threading.Lock()

    def list(self, run_id: str) -> dict:
        path = self.root / run_id / "reviews.json"
        return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}

    def append(self, run_id: str, key: str, payload: dict) -> dict:
        with self._lock:
            all_reviews = self.list(run_id)
            history = all_reviews.setdefault(key, [])
            record = {
                **payload,
                "version": len(history) + 1,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
            history.append(record)
            path = self.root / run_id / "reviews.json"
            temporary = path.with_suffix(".json.tmp")
            temporary.write_text(
                json.dumps(all_reviews, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            temporary.replace(path)
            return record
