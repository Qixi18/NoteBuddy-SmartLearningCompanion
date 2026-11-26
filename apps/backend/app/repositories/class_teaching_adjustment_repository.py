"""Persistence adapter for class-scoped teaching implementation records."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import select

from ..infrastructure.database.models import ClassTeachingAdjustmentRow
from .base import SqlAlchemyRepository


def _row_to_dict(row: ClassTeachingAdjustmentRow) -> dict:
    return json.loads(row.payload_json)


class ClassTeachingAdjustmentRepository(SqlAlchemyRepository):
    def __init__(self, database, *, session=None):
        super().__init__(database, session=session)

    def list(self, run_id: str, class_id: str, node_id: str) -> list[dict]:
        with self.session_scope() as session:
            statement = (
                select(ClassTeachingAdjustmentRow)
                .where(
                    ClassTeachingAdjustmentRow.run_id == run_id,
                    ClassTeachingAdjustmentRow.class_id == class_id,
                    ClassTeachingAdjustmentRow.node_id == node_id,
                )
                .order_by(
                    ClassTeachingAdjustmentRow.created_at,
                    ClassTeachingAdjustmentRow.adjustment_id,
                )
            )
            return [_row_to_dict(row) for row in session.scalars(statement)]

    def get(self, adjustment_id: str) -> dict | None:
        with self.session_scope() as session:
            row = session.get(ClassTeachingAdjustmentRow, adjustment_id)
            return _row_to_dict(row) if row else None

    def create(self, record: dict) -> dict:
        with self.session_scope(write=True) as session:
            now = datetime.now(UTC).isoformat()
            adjustment_id = uuid4().hex
            payload = {
                **record,
                "adjustment_id": adjustment_id,
                "implementation_status": "not_completed",
                "implementation": "",
                "outcome_observations": "",
                "followup_node_id": None,
                "followup_evidence_record_ids": [],
                "followup_comparison": [],
                "teacher_conclusion": "",
                "concluded_at": None,
                "created_at": now,
                "updated_at": now,
                "history": [],
            }
            session.add(
                ClassTeachingAdjustmentRow(
                    adjustment_id=adjustment_id,
                    run_id=record["run_id"],
                    class_id=record["class_id"],
                    node_id=record["node_id"],
                    plan_id=record["plan_id"],
                    payload_json=json.dumps(payload, ensure_ascii=False),
                    created_at=now,
                    updated_at=now,
                )
            )
            session.flush()
            return payload

    def update(self, adjustment_id: str, payload: dict) -> dict:
        with self.session_scope(write=True) as session:
            row = session.get(ClassTeachingAdjustmentRow, adjustment_id)
            if row is None:
                raise FileNotFoundError("班级教学实施记录不存在")
            record = json.loads(row.payload_json)
            history = record.setdefault("history", [])
            history.append(
                {
                    key: record.get(key)
                    for key in (
                        "implementation_status",
                        "implementation",
                        "outcome_observations",
                        "followup_node_id",
                        "followup_evidence_record_ids",
                        "followup_comparison",
                        "teacher_conclusion",
                        "concluded_at",
                        "updated_at",
                    )
                }
            )
            record.update(payload)
            record["updated_at"] = datetime.now(UTC).isoformat()
            row.payload_json = json.dumps(record, ensure_ascii=False)
            row.updated_at = record["updated_at"]
            return record
