from __future__ import annotations

import hashlib
import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select

from ...repositories.store import Store
from ..database.models import AnalysisRunRow, ReviewRow

RUN_ID = re.compile(r"^[0-9a-f]{16,64}$")
REVIEW_STATUSES = {"accepted", "edited", "rejected", "needs_observation"}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def discover(data_dir: Path) -> tuple[list[tuple[str, Path, str, dict]], str]:
    data_dir = Path(data_dir)
    pointer_path = data_dir / "current.txt"
    if not pointer_path.is_file():
        raise ValueError("旧数据目录缺少 current.txt")
    current_id = pointer_path.read_text(encoding="utf-8").strip()
    runs = []
    for folder in sorted(data_dir.iterdir()):
        if not folder.is_dir() or not RUN_ID.fullmatch(folder.name):
            continue
        snapshot = folder / "analysis.json"
        if not snapshot.is_file():
            continue
        raw = snapshot.read_bytes().decode("utf-8")
        value = json.loads(raw)
        if value.get("run_id") != folder.name:
            raise ValueError(f"目录与快照 run_id 不匹配：{folder.name}")
        review_path = folder / "reviews.json"
        reviews = (
            json.loads(review_path.read_text(encoding="utf-8"))
            if review_path.exists()
            else {}
        )
        if not isinstance(reviews, dict):
            raise ValueError(f"复核文件格式无效：{folder.name}")
        for key, history in reviews.items():
            if not isinstance(history, list):
                raise ValueError(f"复核历史格式无效：{folder.name}/{key}")
            versions = [record.get("version") for record in history]
            if versions != list(range(1, len(history) + 1)):
                raise ValueError(f"复核版本不连续：{folder.name}/{key}")
            try:
                student_id, indicator_id = key.split(":", 1)
            except ValueError as exc:
                raise ValueError(f"复核键格式无效：{folder.name}/{key}") from exc
            students = {
                str(row.get("学生编号", "")) for row in value.get("students", [])
            }
            objectives = {
                str(row.get("指标编号", "")) for row in value.get("objectives", [])
            }
            if student_id not in students or indicator_id not in objectives:
                raise ValueError(f"复核引用的学生或学习目标不存在：{folder.name}/{key}")
            item_ids = {
                str(row.get("材料编号", ""))
                for row in value.get("items", [])
                if str(row.get("指标编号", "")) == indicator_id
            }
            allowed = {
                str(row.get("记录编号", ""))
                for row in value.get("responses", [])
                if row.get("学生编号") == student_id and row.get("材料编号") in item_ids
            }
            for record in history:
                if record.get("status") not in REVIEW_STATUSES:
                    raise ValueError(f"复核状态无效：{folder.name}/{key}")
                cited = record.get("evidence_record_ids", [])
                if (
                    not isinstance(cited, list)
                    or any(not isinstance(record_id, str) for record_id in cited)
                    or not set(cited).issubset(allowed)
                ):
                    raise ValueError(f"复核证据引用无法验证：{folder.name}/{key}")
                original = record.get("original_draft")
                if original is not None:
                    if not isinstance(original, dict):
                        raise ValueError(f"原建议格式无效：{folder.name}/{key}")
                    original_ids = original.get("evidence_record_ids", [])
                    if (
                        not isinstance(original_ids, list)
                        or any(
                            not isinstance(record_id, str) for record_id in original_ids
                        )
                        or not set(original_ids).issubset(allowed)
                    ):
                        raise ValueError(f"原建议证据引用无法验证：{folder.name}/{key}")
        runs.append((folder.name, snapshot, raw, reviews))
    if not runs:
        raise ValueError("未发现可迁移的分析快照")
    if current_id not in {run_id for run_id, *_ in runs}:
        raise ValueError(f"current.txt 指向的运行不存在：{current_id}")
    return runs, current_id


def create_verified_backup(data_dir: Path, backup_dir: Path) -> dict:
    data_dir = Path(data_dir).resolve()
    backup_dir = Path(backup_dir).resolve()
    if backup_dir == data_dir or data_dir in backup_dir.parents:
        raise ValueError("备份目标不能位于源数据目录内")
    if backup_dir.exists():
        raise FileExistsError(f"备份目标已存在：{backup_dir}")
    backup_dir.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(data_dir, backup_dir)
    source_files = sorted(path for path in data_dir.rglob("*") if path.is_file())
    backup_files = sorted(path for path in backup_dir.rglob("*") if path.is_file())
    source_manifest = {
        p.relative_to(data_dir).as_posix(): sha256(p) for p in source_files
    }
    backup_manifest = {
        p.relative_to(backup_dir).as_posix(): sha256(p) for p in backup_files
    }
    if source_manifest != backup_manifest:
        raise IOError("备份文件 hash 核验失败")
    report = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "source": str(data_dir),
        "backup": str(backup_dir),
        "file_count": len(source_manifest),
        "files": source_manifest,
    }
    (backup_dir / "phase-02-backup-manifest.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return report


def migrate_json_to_sqlite(data_dir: Path, store: Store) -> dict:
    runs, current_id = discover(data_dir)
    initial_hashes = {str(path): sha256(path) for _, path, _, _ in runs}
    review_count = 0
    for run_id, snapshot_path, snapshot_text, reviews in runs:
        store.run_repository.save_snapshot(snapshot_text, set_current=False)
        review_count += store.review_repository.import_history(run_id, reviews)

    store.run_repository.set_current(current_id)
    with store.database.session() as session:
        stored_runs = session.scalars(select(AnalysisRunRow)).all()
        stored_reviews = session.scalars(select(ReviewRow)).all()
        stored_by_id = {row.run_id: row.snapshot_json for row in stored_runs}
        for run_id, snapshot_path, snapshot_text, _ in runs:
            if stored_by_id.get(run_id) != snapshot_text:
                raise IOError(f"快照一致性核验失败：{run_id}")
            if sha256(snapshot_path) != initial_hashes[str(snapshot_path)]:
                raise IOError(f"迁移期间源文件发生变化：{snapshot_path}")
        run_ids = {run[0] for run in runs}
        actual_reviews = sum(1 for row in stored_reviews if row.run_id in run_ids)
        expected_reviews = sum(
            len(records)
            for _, _, _, review_map in runs
            for records in review_map.values()
        )
        if actual_reviews != expected_reviews:
            raise IOError(
                f"复核数量核验失败：expected={expected_reviews}, actual={actual_reviews}"
            )
    counts = {
        key: 0
        for key in (
            "students",
            "objectives",
            "items",
            "nodes",
            "raw_responses",
            "selected_responses",
        )
    }
    for _, _, snapshot_text, _ in runs:
        snapshot = json.loads(snapshot_text)
        counts["students"] += len(snapshot.get("students", []))
        counts["objectives"] += len(snapshot.get("objectives", []))
        counts["items"] += len(snapshot.get("items", []))
        counts["nodes"] += len(snapshot.get("nodes", []))
        counts["raw_responses"] += len(snapshot.get("raw_responses", []))
        counts["selected_responses"] += len(snapshot.get("responses", []))
    return {
        "runs": len(runs),
        "reviews": expected_reviews,
        "new_reviews_inserted": review_count,
        "records": counts,
        "current_run_id": current_id,
        "snapshot_bytes_verified": True,
        "source_files_preserved": True,
    }
