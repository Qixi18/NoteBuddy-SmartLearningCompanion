from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import sqlite3
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path

from ...application.ports.unit_of_work import UnitOfWork
from ..database import models as database_models

RUN_ID = re.compile(r"^[0-9a-f]{16,64}$")
REVIEW_STATUSES = {"accepted", "edited", "rejected", "needs_observation"}
ALEMBIC_HEAD = "8a1d3c5e7f90"


class MigrationTargetError(ValueError):
    def __init__(self, message: str, details: dict):
        super().__init__(message)
        self.details = details


def inspect_migration_target(
    database_path: Path,
    incoming_runs: list[tuple[str, Path, str, dict]],
    current_run_id: str,
) -> dict:
    """Inspect a target database read-only and reject incompatible/conflicting data."""
    database_path = Path(database_path).resolve()
    if not database_path.exists():
        return {
            "exists": False,
            "compatible": True,
            "path": str(database_path),
            "nonempty": False,
            "table_counts": {},
            "conflicts": [],
        }
    if not database_path.is_file():
        raise MigrationTargetError(
            f"迁移目标不是数据库文件：{database_path}",
            {"exists": True, "compatible": False, "path": str(database_path)},
        )

    uri = database_path.as_uri() + "?mode=ro"
    diagnostics = {"exists": True, "compatible": False, "path": str(database_path)}
    try:
        connection = sqlite3.connect(uri, uri=True)
        connection.execute("PRAGMA query_only = ON")
        with connection:
            integrity = [row[0] for row in connection.execute("PRAGMA integrity_check")]
            foreign_keys = list(connection.execute("PRAGMA foreign_key_check"))
            table_names = {
                row[0]
                for row in connection.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
                )
            }
            diagnostics["tables"] = sorted(table_names)
            diagnostics["integrity_check"] = integrity
            diagnostics["foreign_key_violations"] = len(foreign_keys)
            table_counts = {}
            for table_name in sorted(table_names):
                quoted = table_name.replace('"', '""')
                table_counts[table_name] = int(
                    connection.execute(f'SELECT COUNT(*) FROM "{quoted}"').fetchone()[0]
                )
            diagnostics["table_counts"] = table_counts
            expected_columns = {
                name: {column.name for column in table.columns}
                for name, table in database_models.Base.metadata.tables.items()
            }
            expected_tables = set(expected_columns) | {"alembic_version"}
            if table_names != expected_tables:
                raise MigrationTargetError(
                    "目标数据库表结构不兼容："
                    f"missing={sorted(expected_tables - table_names)}, "
                    f"unexpected={sorted(table_names - expected_tables)}",
                    diagnostics,
                )
            for table_name, expected in expected_columns.items():
                quoted = table_name.replace('"', '""')
                actual = {
                    row[1]
                    for row in connection.execute(f'PRAGMA table_info("{quoted}")')
                }
                if actual != expected:
                    raise MigrationTargetError(
                        f"目标数据库表列不兼容：{table_name}; "
                        f"missing={sorted(expected - actual)}, "
                        f"unexpected={sorted(actual - expected)}",
                        diagnostics,
                    )
            revision_columns = {
                row[1]
                for row in connection.execute('PRAGMA table_info("alembic_version")')
            }
            if revision_columns != {"version_num"}:
                raise MigrationTargetError(
                    "目标数据库 alembic_version 表结构不兼容", diagnostics
                )
            revision_rows = [
                row[0]
                for row in connection.execute("SELECT version_num FROM alembic_version")
            ]
            if revision_rows != [ALEMBIC_HEAD]:
                diagnostics["revision"] = revision_rows
                raise MigrationTargetError(
                    f"目标数据库 Alembic revision 不兼容：{revision_rows}，期望 {ALEMBIC_HEAD}",
                    diagnostics,
                )
            if integrity != ["ok"] or foreign_keys:
                raise MigrationTargetError(
                    "目标数据库完整性校验失败："
                    f"integrity={integrity}, foreign_keys={foreign_keys[:10]}",
                    diagnostics,
                )

            pointer = connection.execute(
                "SELECT value FROM app_state WHERE key='current_run_id'"
            ).fetchone()
            existing_current = pointer[0] if pointer else None
            conflicts = []
            for run_id, _snapshot_path, snapshot_text, reviews in incoming_runs:
                row = connection.execute(
                    "SELECT snapshot_json FROM analysis_runs WHERE run_id=?", (run_id,)
                ).fetchone()
                if row is not None and row[0] != snapshot_text:
                    conflicts.append({"kind": "run_snapshot", "run_id": run_id})
                for key, records in reviews.items():
                    student_id, indicator_id = key.split(":", 1)
                    for record in records:
                        existing = connection.execute(
                            "SELECT payload_json FROM teacher_reviews "
                            "WHERE run_id=? AND student_id=? AND indicator_id=? AND version=?",
                            (run_id, student_id, indicator_id, int(record["version"])),
                        ).fetchone()
                        if existing is not None and json.loads(existing[0]) != record:
                            conflicts.append(
                                {
                                    "kind": "review_version",
                                    "run_id": run_id,
                                    "key": key,
                                    "version": int(record["version"]),
                                }
                            )
            incoming_ids = {run_id for run_id, *_ in incoming_runs}
            if existing_current is not None and existing_current != current_run_id:
                conflicts.append(
                    {
                        "kind": "current_pointer",
                        "existing": existing_current,
                        "incoming": current_run_id,
                    }
                )
            nonempty = any(
                count
                for name, count in table_counts.items()
                if name != "alembic_version"
            )
            if existing_current is not None and existing_current not in incoming_ids:
                conflicts.append(
                    {
                        "kind": "current_run_missing_from_source",
                        "run_id": existing_current,
                    }
                )
            return {
                "exists": True,
                "compatible": True,
                "path": str(database_path),
                "nonempty": nonempty,
                "revision": revision_rows[0],
                "integrity_check": integrity,
                "foreign_key_violations": len(foreign_keys),
                "table_counts": table_counts,
                "current_run_id": existing_current,
                "conflicts": conflicts,
            }
    except sqlite3.DatabaseError as exc:
        diagnostics["error"] = str(exc)
        raise MigrationTargetError(
            f"迁移目标不是可读的有效 SQLite 数据库：{exc}", diagnostics
        ) from exc
    finally:
        if "connection" in locals():
            connection.close()

    raise AssertionError("unreachable")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def discover(
    data_dir: Path, *, with_report: bool = False
) -> (
    tuple[list[tuple[str, Path, str, dict]], str]
    | tuple[list[tuple[str, Path, str, dict]], str, dict]
):
    data_dir = Path(data_dir)
    if data_dir.is_symlink():
        raise ValueError(f"迁移来源目录不允许符号链接：{data_dir}")
    linked = next((path for path in data_dir.rglob("*") if path.is_symlink()), None)
    if linked is not None:
        raise ValueError(f"迁移来源不允许符号链接：{linked}")
    pointer_path = data_dir / "current.txt"
    if not pointer_path.is_file():
        raise ValueError("旧数据目录缺少 current.txt")
    current_id = pointer_path.read_text(encoding="utf-8").strip()
    if not RUN_ID.fullmatch(current_id):
        raise ValueError(f"current.txt 运行编号格式无效：{current_id}")
    runs = []
    inventory = []
    for folder in sorted(data_dir.iterdir()):
        if folder.is_symlink():
            raise ValueError(f"迁移来源不允许符号链接：{folder}")
        if not folder.is_dir():
            inventory.append(
                {"path": folder.name, "decision": "excluded_non_directory"}
            )
            continue
        # Run-like directories are never silently ignored: that can hide legacy data.
        if not RUN_ID.fullmatch(folder.name):
            if (folder / "analysis.json").exists() or (
                folder / "reviews.json"
            ).exists():
                raise ValueError(f"疑似运行目录名称无效：{folder}")
            inventory.append(
                {"path": folder.name, "decision": "excluded_unrelated_directory"}
            )
            continue
        snapshot = folder / "analysis.json"
        if snapshot.is_symlink():
            raise ValueError(f"迁移来源不允许符号链接：{snapshot}")
        if not snapshot.is_file():
            raise ValueError(f"运行目录缺少 analysis.json：{folder}")
        try:
            raw = snapshot.read_bytes().decode("utf-8")
            value = json.loads(raw)
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ValueError(f"快照 JSON 无法读取：{snapshot}: {exc}") from exc
        if not isinstance(value, dict):
            raise ValueError(f"快照根节点必须是对象：{snapshot}")
        if value.get("run_id") != folder.name:
            raise ValueError(f"目录与快照 run_id 不匹配：{folder.name}")
        required_fields = ("students", "objectives", "items", "nodes", "responses")
        missing_fields = [field for field in required_fields if field not in value]
        if missing_fields:
            raise ValueError(
                f"快照缺少必需字段：{snapshot} ({', '.join(missing_fields)})"
            )
        for field in (*required_fields, "raw_responses"):
            if field in value and not isinstance(value[field], list):
                raise ValueError(f"快照字段必须是数组：{snapshot} ({field})")
        id_fields = {
            "students": "学生编号",
            "objectives": "指标编号",
            "items": "材料编号",
            "nodes": "节点编号",
            "responses": "记录编号",
        }
        for collection, id_field in id_fields.items():
            seen = set()
            for index, row in enumerate(value.get(collection, [])):
                if not isinstance(row, dict):
                    raise ValueError(
                        f"快照行必须是对象：{snapshot} ({collection}[{index}])"
                    )
                identifier = str(row.get(id_field, ""))
                if identifier and identifier in seen:
                    raise ValueError(
                        f"快照 ID 重复：{snapshot} ({collection}/{identifier})"
                    )
                if identifier:
                    seen.add(identifier)
        raw_responses = value.get("raw_responses", value.get("responses", []))
        if any(not isinstance(row, dict) for row in raw_responses):
            raise ValueError(f"原始作答行必须是对象：{snapshot} (raw_responses)")
        for index, item in enumerate(value.get("items", [])):
            objective_ids = item.get("指标编号", [])
            if isinstance(objective_ids, str):
                objective_ids = [objective_ids]
            if not isinstance(objective_ids, list) or any(
                not isinstance(identifier, (str, int)) for identifier in objective_ids
            ):
                raise ValueError(f"材料目标引用格式无效：{snapshot} (items[{index}])")
        review_path = folder / "reviews.json"
        if review_path.is_symlink():
            raise ValueError(f"迁移来源不允许符号链接：{review_path}")
        try:
            reviews = (
                json.loads(review_path.read_text(encoding="utf-8"))
                if review_path.exists()
                else {}
            )
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ValueError(f"复核 JSON 无法读取：{review_path}: {exc}") from exc
        if not isinstance(reviews, dict):
            raise ValueError(f"复核文件格式无效：{folder.name}")
        for key, history in reviews.items():
            if not isinstance(history, list):
                raise ValueError(f"复核历史格式无效：{folder.name}/{key}")
            if any(not isinstance(record, dict) for record in history):
                raise ValueError(f"复核记录必须是对象：{folder.name}/{key}")
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
        inventory.append(
            {"path": folder.name, "decision": "included", "run_id": folder.name}
        )
    if not runs:
        raise ValueError("未发现可迁移的分析快照")
    if current_id not in {run_id for run_id, *_ in runs}:
        raise ValueError(f"current.txt 指向的运行不存在：{current_id}")
    if with_report:
        return (
            runs,
            current_id,
            {
                "source": str(data_dir.resolve()),
                "current_run_id": current_id,
                "entries": inventory,
                "included_runs": len(runs),
                "excluded_entries": sum(
                    entry["decision"].startswith("excluded_") for entry in inventory
                ),
            },
        )
    return runs, current_id


def create_verified_backup(
    data_dir: Path, backup_dir: Path, *, excluded_paths: tuple[Path, ...] = ()
) -> dict:
    data_dir = Path(data_dir).resolve()
    backup_dir = Path(backup_dir).resolve()
    if (
        backup_dir == data_dir
        or data_dir in backup_dir.parents
        or backup_dir in data_dir.parents
    ):
        raise ValueError("备份目标与源数据目录不能重叠")
    if backup_dir.exists():
        raise FileExistsError(f"备份目标已存在：{backup_dir}")
    database_files = {Path(path).expanduser().resolve() for path in excluded_paths}
    excluded = set(database_files)
    excluded.update(Path(f"{path}-wal").resolve() for path in database_files)
    excluded.update(Path(f"{path}-shm").resolve() for path in database_files)
    excluded_relative = {
        path.relative_to(data_dir) for path in excluded if path.is_relative_to(data_dir)
    }

    def ignore_excluded(directory: str, names: list[str]) -> set[str]:
        parent = Path(directory).resolve()
        return {name for name in names if (parent / name).resolve() in excluded}

    backup_dir.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(data_dir, backup_dir, ignore=ignore_excluded)
    source_files = sorted(
        path
        for path in data_dir.rglob("*")
        if path.is_file() and path.resolve() not in excluded
    )
    backup_files = sorted(path for path in backup_dir.rglob("*") if path.is_file())
    source_manifest = {
        p.relative_to(data_dir).as_posix(): sha256(p) for p in source_files
    }
    backup_manifest = {
        p.relative_to(backup_dir).as_posix(): sha256(p) for p in backup_files
    }
    if source_manifest != backup_manifest:
        raise OSError("备份文件 hash 核验失败")
    report = {
        "created_at": datetime.now(UTC).isoformat(),
        "source": str(data_dir),
        "backup": str(backup_dir),
        "file_count": len(source_manifest),
        "files": source_manifest,
        "excluded_files": sorted(path.as_posix() for path in excluded_relative),
    }
    (backup_dir / "phase-02-backup-manifest.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return report


def write_migration_report(report_path: Path, report: dict) -> None:
    """Atomically persist the migration's plan and last completed phase."""
    report_path = Path(report_path).resolve()
    report_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = report_path.with_suffix(report_path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8", newline="\n") as stream:
        stream.write(json.dumps(report, ensure_ascii=False, indent=2))
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, report_path)


def _expected_projection_counts(run: dict) -> dict[str, int]:
    objectives = {
        str(row.get("指标编号", ""))
        for row in run.get("objectives", [])
        if str(row.get("指标编号", ""))
    }
    classes = {
        str(row.get("模拟班级编号", ""))
        for row in run.get("students", [])
        if str(row.get("模拟班级编号", ""))
    }
    valid_items = {
        str(row.get("材料编号", ""))
        for row in run.get("items", [])
        if str(row.get("材料编号", ""))
    }
    valid_nodes = {
        str(row.get("节点编号", ""))
        for row in run.get("nodes", [])
        if str(row.get("节点编号", ""))
    }
    item_links = set()
    for row in run.get("items", []):
        material_id = str(row.get("材料编号", ""))
        if not material_id:
            continue
        ids = row.get("指标编号", [])
        if isinstance(ids, str):
            ids = [ids]
        item_links.update(
            (material_id, str(identifier))
            for identifier in ids
            if str(identifier) in objectives
        )
    raw = run.get("raw_responses", run.get("responses", []))
    seen_records, event_keys = set(), set()
    for index, row in enumerate(raw):
        record_id = str(row.get("记录编号", "") or f"__missing_record_{index}")
        if record_id in seen_records:
            record_id = f"{record_id}__duplicate_{index}"
        seen_records.add(record_id)
        event_id = str(row.get("作答事件编号", "")).strip()
        event_keys.add(event_id or f"__missing_event_{record_id}")
    return {
        "runs": 1,
        "classes": len(classes),
        "students": sum(
            bool(str(row.get("学生编号", "")))
            and bool(str(row.get("模拟班级编号", "")))
            for row in run.get("students", [])
        ),
        "objectives": len(objectives),
        "items": len(valid_items),
        "item_objectives": len(item_links),
        "nodes": len(valid_nodes),
        "response_events": len(event_keys),
        "responses": len(raw),
    }


def migrate_json_to_sqlite(
    data_dir: Path, uow_factory: Callable[[], UnitOfWork]
) -> dict:
    runs, current_id = discover(data_dir)
    data_dir = Path(data_dir).resolve()
    source_files = [data_dir / "current.txt"]
    for _run_id, snapshot_path, _snapshot_text, _reviews in runs:
        source_files.append(snapshot_path)
        review_path = snapshot_path.parent / "reviews.json"
        if review_path.is_file():
            source_files.append(review_path)
    initial_hashes = {
        path.relative_to(data_dir).as_posix(): sha256(path) for path in source_files
    }
    review_count = 0
    projection_counts = {}
    with uow_factory() as uow:
        for run_id, _snapshot_path, snapshot_text, reviews in runs:
            uow.runs.save_snapshot(snapshot_text, set_current=False)
            review_count += uow.reviews.import_history(run_id, reviews)

        uow.runs.set_current(current_id)
        uow.flush()
        for run_id, snapshot_path, snapshot_text, _ in runs:
            if uow.runs.load_snapshot(run_id) != snapshot_text:
                raise OSError(f"快照一致性核验失败：{run_id}")
            expected_projection = _expected_projection_counts(json.loads(snapshot_text))
            actual_projection = uow.runs.projection_counts(run_id)
            if actual_projection != expected_projection:
                raise OSError(
                    f"规范化投影计数不一致：{run_id}; expected={expected_projection}; actual={actual_projection}"
                )
            for key, value in actual_projection.items():
                projection_counts[key] = projection_counts.get(key, 0) + value
        final_hashes = {
            relative: sha256(data_dir / relative) for relative in initial_hashes
        }
        if final_hashes != initial_hashes:
            raise OSError("迁移期间 source 文件清单或内容发生变化")
        actual_reviews = sum(
            len(history)
            for run_id, *_ in runs
            for history in uow.reviews.list(run_id).values()
        )
        expected_reviews = sum(
            len(records)
            for _, _, _, review_map in runs
            for records in review_map.values()
        )
        if actual_reviews != expected_reviews:
            raise OSError(
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
        "database_projection_records": projection_counts,
        "current_run_id": current_id,
        "snapshot_bytes_verified": True,
        "source_files_preserved": True,
    }
