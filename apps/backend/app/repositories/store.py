"""分析运行与人工复核的本地持久化。"""
from __future__ import annotations

import json
import hashlib
import threading
from datetime import datetime, timezone
from pathlib import Path

from ..services.analysis import analyze, read_bundle
from ..config import settings


class Store:
    def __init__(self, root: Path):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self._review_lock = threading.Lock()

    def import_folder(self, folder: Path) -> dict:
        tables, files = read_bundle(folder)
        result = analyze(tables, files)
        result["source_root"] = str(Path(folder).resolve().parents[1])
        source_names = {"课程标准_2022.pdf"}
        for entry in result["source_index"]:
            source_names.update(entry["source_check"].get("textbook_slices", []))
        source_files = {}
        for name in sorted(source_names):
            path = self.source_file(result, name)
            if path is None:
                continue
            digest = hashlib.sha256()
            with path.open("rb") as file:
                for chunk in iter(lambda: file.read(1024 * 1024), b""):
                    digest.update(chunk)
            source_files[name] = {"sha256": digest.hexdigest(), "bytes": path.stat().st_size}
        result["source_files"] = source_files
        result["run_id"] = hashlib.sha256(json.dumps({"csv_run_id": result["run_id"], "source_files": source_files}, sort_keys=True).encode()).hexdigest()[:16]
        destination = self.root / result["run_id"]
        destination.mkdir(exist_ok=True)
        (destination / "analysis.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        (self.root / "current.txt").write_text(result["run_id"], encoding="utf-8")
        return result

    @staticmethod
    def source_file(run: dict, name: str) -> Path | None:
        candidates = [settings.resources_dir / name,
                      Path(run.get("source_root", "")) / "5_课程标准及相关教学资源" / name]
        return next((candidate for candidate in candidates if candidate.is_file()), None)

    def current(self) -> dict:
        pointer = self.root / "current.txt"
        if not pointer.exists():
            raise FileNotFoundError("尚未导入赛事数据")
        return self.load(pointer.read_text(encoding="utf-8").strip())

    def load(self, run_id: str) -> dict:
        if not run_id or any(c not in "0123456789abcdef" for c in run_id):
            raise ValueError("无效运行编号")
        return json.loads((self.root / run_id / "analysis.json").read_text(encoding="utf-8"))

    def reviews(self, run_id: str) -> dict:
        path = self.root / run_id / "reviews.json"
        return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}

    def save_review(self, run_id: str, student_id: str, indicator_id: str, payload: dict) -> dict:
        run = self.load(run_id)
        if student_id not in {r["学生编号"] for r in run["students"]}:
            raise ValueError("学生编号不存在")
        if indicator_id not in {r["指标编号"] for r in run["objectives"]}:
            raise ValueError("指标编号不存在")
        if payload.get("status") not in {"accepted", "edited", "rejected", "needs_observation"}:
            raise ValueError("复核状态无效")
        if payload["status"] == "edited" and not str(payload.get("recommendation", "")).strip():
            raise ValueError("修改后的建议不能为空")
        allowed = {r["记录编号"] for r in run["responses"] if r["学生编号"] == student_id and
                   r["材料编号"] in {item["材料编号"] for item in run["items"] if item["指标编号"] == indicator_id}}
        cited = payload.get("evidence_record_ids", [])
        if not isinstance(cited, list) or not set(cited).issubset(allowed):
            raise ValueError("复核引用了无效记录")
        original = payload.get("original_draft")
        if original is not None:
            if not isinstance(original, dict) or not set(original.get("evidence_record_ids", [])).issubset(allowed):
                raise ValueError("原草稿证据引用无效")
        key = f"{student_id}:{indicator_id}"
        with self._review_lock:
            all_reviews = self.reviews(run_id)
            history = all_reviews.setdefault(key, [])
            record = {"version": len(history) + 1, "status": payload["status"],
                      "diagnosis": str(payload.get("diagnosis", "")),
                      "recommendation": str(payload.get("recommendation", "")),
                      "adjustment_condition": str(payload.get("adjustment_condition", "")),
                      "source": str(payload.get("source", "rule")),
                      "model": payload.get("model"), "prompt_version": payload.get("prompt_version"),
                      "original_draft": original,
                      "evidence_record_ids": cited,
                      "reason": str(payload.get("reason", "")),
                      "reviewer": str(payload.get("reviewer", "教师")),
                      "updated_at": datetime.now(timezone.utc).isoformat()}
            history.append(record)
            path = self.root / run_id / "reviews.json"
            temporary = path.with_suffix(".json.tmp")
            temporary.write_text(json.dumps(all_reviews, ensure_ascii=False, indent=2), encoding="utf-8")
            temporary.replace(path)
            return record
