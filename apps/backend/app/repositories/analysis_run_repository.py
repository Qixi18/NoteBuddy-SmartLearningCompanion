"""Immutable analysis run persistence with a lossless JSON compatibility snapshot."""

from __future__ import annotations

import json
import hashlib
import threading
from datetime import datetime, timezone

from sqlalchemy import select

from ..infrastructure.database.models import (
    AnalysisRunRow,
    AppStateRow,
    ClassRow,
    ItemObjectiveRow,
    ItemRow,
    NodeRow,
    ObjectiveRow,
    ResponseEventRow,
    ResponseRow,
    StudentRow,
)
from ..infrastructure.database.session import Database


def _json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


class AnalysisRunRepository:
    _save_lock = threading.RLock()

    def __init__(self, root=None, *, database: Database):
        self.root = root
        self.database = database

    def save(self, run: dict) -> None:
        self.save_snapshot(_json(run), set_current=True)

    def save_snapshot(self, snapshot_text: str, *, set_current: bool = True) -> None:
        run = json.loads(snapshot_text)
        run_id = str(run["run_id"])
        with self._save_lock, self.database.session() as session, session.begin():
            existing = session.get(AnalysisRunRow, run_id)
            if existing is None:
                session.add(
                    AnalysisRunRow(
                        run_id=run_id,
                        created_at=str(run.get("created_at", "")),
                        rule_version=str(run.get("rule_version", "")),
                        input_fingerprint=run.get("input_fingerprint")
                        or hashlib.sha256(
                            _json(run.get("source_files", run.get("files", {}))).encode(
                                "utf-8"
                            )
                        ).hexdigest(),
                        snapshot_json=snapshot_text,
                    )
                )
                session.flush()
                self._insert_projection(session, run)
            elif existing.snapshot_json != snapshot_text:
                # A run id is an immutable identity. Reject silent replacement.
                raise ValueError(f"分析运行 {run_id} 已存在且快照内容不同")
            if set_current:
                state = session.get(AppStateRow, "current_run_id")
                if state is None:
                    session.add(
                        AppStateRow(
                            key="current_run_id",
                            value=run_id,
                            updated_at=datetime.now(timezone.utc).isoformat(),
                        )
                    )
                else:
                    state.value = run_id
                    state.updated_at = datetime.now(timezone.utc).isoformat()

    @staticmethod
    def _insert_projection(session, run: dict) -> None:
        run_id = run["run_id"]
        classes: dict[str, str] = {}
        for student in run.get("students", []):
            class_id = str(student.get("模拟班级编号", ""))
            if class_id:
                classes[class_id] = class_id
        for class_id in classes:
            session.add(ClassRow(run_id=run_id, class_id=class_id, name=class_id))
        session.flush()
        for row in run.get("students", []):
            student_id = str(row.get("学生编号", ""))
            class_id = str(row.get("模拟班级编号", ""))
            if student_id and class_id:
                session.add(
                    StudentRow(
                        run_id=run_id,
                        student_id=student_id,
                        class_id=class_id,
                        data_json=_json(row),
                    )
                )
        session.flush()
        for row in run.get("objectives", []):
            indicator_id = str(row.get("指标编号", ""))
            if indicator_id:
                session.add(
                    ObjectiveRow(
                        run_id=run_id,
                        indicator_id=indicator_id,
                        topic_id=str(row.get("主题编号", "")),
                        title=str(row.get("观察指标", row.get("指标名称", ""))),
                        data_json=_json(row),
                    )
                )
        session.flush()
        objective_ids = {
            str(row.get("指标编号", "")) for row in run.get("objectives", [])
        }
        item_links = []
        for row in run.get("items", []):
            material_id = str(row.get("材料编号", ""))
            if material_id:
                linked_ids = row.get("指标编号", [])
                if isinstance(linked_ids, str):
                    linked_ids = [linked_ids]
                linked_ids = [
                    str(value) for value in linked_ids if str(value) in objective_ids
                ]
                session.add(
                    ItemRow(
                        run_id=run_id,
                        material_id=material_id,
                        item_type=str(row.get("材料类型", row.get("题目类型", ""))),
                        objective_ids_json=_json(linked_ids),
                        data_json=_json(row),
                    )
                )
                item_links.extend(
                    (material_id, indicator_id) for indicator_id in linked_ids
                )
        session.flush()
        for material_id, indicator_id in item_links:
            session.add(
                ItemObjectiveRow(
                    run_id=run_id, material_id=material_id, indicator_id=indicator_id
                )
            )
        for row in run.get("nodes", []):
            node_id = str(row.get("节点编号", ""))
            if node_id:
                session.add(
                    NodeRow(run_id=run_id, node_id=node_id, data_json=_json(row))
                )
        session.flush()
        valid_student_ids = {
            str(row.get("学生编号", "")) for row in run.get("students", [])
        }
        valid_material_ids = {
            str(row.get("材料编号", "")) for row in run.get("items", [])
        }
        valid_node_ids = {str(row.get("节点编号", "")) for row in run.get("nodes", [])}
        selected_ids = {
            str(row.get("记录编号", "")) for row in run.get("responses", [])
        }
        raw_responses = run.get("raw_responses", run.get("responses", []))
        seen_records: set[str] = set()
        events: dict[str, str | None] = {}
        rows: list[tuple[str, str | None, dict]] = []
        for index, row in enumerate(raw_responses):
            record_id = str(row.get("记录编号", "") or f"__missing_record_{index}")
            if record_id in seen_records:
                record_id = f"{record_id}__duplicate_{index}"
            seen_records.add(record_id)
            event_id = str(row.get("作答事件编号", "")).strip()
            event_key = event_id or f"__missing_event_{record_id}"
            events[event_key] = event_id or None
            rows.append((record_id, event_key, row))
        for event_key, event_id in events.items():
            session.add(
                ResponseEventRow(run_id=run_id, event_key=event_key, event_id=event_id)
            )
        session.flush()
        for record_id, event_key, row in rows:
            session.add(
                ResponseRow(
                    run_id=run_id,
                    record_id=record_id,
                    event_key=event_key,
                    is_selected=record_id in selected_ids,
                    student_id=(
                        str(row["学生编号"])
                        if str(row.get("学生编号", "")) in valid_student_ids
                        else None
                    ),
                    material_id=(
                        str(row["材料编号"])
                        if str(row.get("材料编号", "")) in valid_material_ids
                        else None
                    ),
                    node_id=(
                        str(row["节点编号"])
                        if str(row.get("节点编号", "")) in valid_node_ids
                        else None
                    ),
                    source_line=row.get("_source_line"),
                    data_json=_json(row),
                )
            )

    @staticmethod
    def compatibility_projection(snapshot_text: str) -> dict:
        run = json.loads(snapshot_text)
        # Older snapshots lacked these projections; preserve the original text in storage.
        run.setdefault("observations", [])
        run.setdefault("source_index", [])
        run.setdefault("source_files", {})
        run.setdefault("source_root", "")
        return run

    def current(self) -> dict:
        with self.database.session() as session:
            state = session.get(AppStateRow, "current_run_id")
            if state is None:
                raise FileNotFoundError("尚未导入赛事数据")
            run = session.get(AnalysisRunRow, state.value)
            if run is None:
                raise FileNotFoundError("当前分析运行不存在")
            return self.compatibility_projection(run.snapshot_json)

    def load(self, run_id: str) -> dict:
        if not run_id or any(char not in "0123456789abcdef" for char in run_id):
            raise ValueError("无效运行编号")
        with self.database.session() as session:
            run = session.get(AnalysisRunRow, run_id)
            if run is None:
                raise FileNotFoundError("分析运行不存在")
            return self.compatibility_projection(run.snapshot_json)

    def list_run_ids(self) -> list[str]:
        with self.database.session() as session:
            return list(
                session.scalars(
                    select(AnalysisRunRow.run_id).order_by(AnalysisRunRow.created_at)
                )
            )

    def set_current(self, run_id: str) -> None:
        with self.database.session() as session, session.begin():
            if session.get(AnalysisRunRow, run_id) is None:
                raise ValueError(f"当前运行不存在：{run_id}")
            state = session.get(AppStateRow, "current_run_id")
            if state is None:
                session.add(
                    AppStateRow(
                        key="current_run_id",
                        value=run_id,
                        updated_at=datetime.now(timezone.utc).isoformat(),
                    )
                )
            else:
                state.value = run_id
                state.updated_at = datetime.now(timezone.utc).isoformat()
