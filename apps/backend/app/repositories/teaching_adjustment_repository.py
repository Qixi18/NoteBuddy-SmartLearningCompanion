"""Persistence adapter for teacher recorded cross-run adjustment cycles."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import select

from ..infrastructure.database.models import (
    TeachingAdjustmentOriginRow,
    TeachingAdjustmentRow,
)
from .base import SqlAlchemyRepository


class TeachingAdjustmentRepository(SqlAlchemyRepository):
    def __init__(self, database, *, session=None):
        super().__init__(database, session=session)

    def list(self, student_id: str | None = None) -> list[dict]:
        with self.session_scope() as session:
            statement = select(TeachingAdjustmentRow).order_by(
                TeachingAdjustmentRow.created_at, TeachingAdjustmentRow.adjustment_id
            )
            if student_id:
                statement = statement.where(
                    TeachingAdjustmentRow.student_id == student_id
                )
            return [json.loads(row.payload_json) for row in session.scalars(statement)]

    def get(self, adjustment_id: str) -> dict | None:
        with self.session_scope() as session:
            row = session.get(TeachingAdjustmentRow, adjustment_id)
            return json.loads(row.payload_json) if row else None

    def create(self, origin: dict, payload: dict) -> dict:
        with self.session_scope(write=True) as session:
            adjustment_id = uuid4().hex
            now = datetime.now(UTC).isoformat()
            record = {
                **origin,
                **payload,
                "adjustment_id": adjustment_id,
                "created_at": now,
                "updated_at": now,
                "followup_run_id": None,
                "followup_node_id": None,
                "followup_evidence_record_ids": [],
                "comparability": "pending",
                "teacher_conclusion": "",
                "reviewer": "",
                "concluded_at": None,
                "history": [],
            }
            session.add(
                TeachingAdjustmentRow(
                    adjustment_id=adjustment_id,
                    student_id=origin["student_id"],
                    indicator_id=origin["indicator_id"],
                    payload_json=json.dumps(record, ensure_ascii=False),
                    created_at=now,
                    updated_at=now,
                )
            )
            session.flush()
            session.add(
                TeachingAdjustmentOriginRow(
                    adjustment_id=adjustment_id,
                    student_id=origin["student_id"],
                    indicator_id=origin["indicator_id"],
                    run_id=origin["origin_run_id"],
                    node_id=origin["origin_node_id"],
                    review_version=origin["review_version"],
                )
            )
            return record

    def update(self, adjustment_id: str, payload: dict) -> dict:
        with self.session_scope(write=True) as session:
            row = session.get(TeachingAdjustmentRow, adjustment_id)
            if row is None:
                raise FileNotFoundError("教学调整记录不存在")
            record = json.loads(row.payload_json)
            history = record.setdefault("history", [])
            history.append(
                {
                    "implementation": record.get("implementation", ""),
                    "implementation_status": record.get(
                        "implementation_status", "pending"
                    ),
                    "outcome_observations": record.get("outcome_observations", ""),
                    "followup_run_id": record.get("followup_run_id"),
                    "followup_node_id": record.get("followup_node_id"),
                    "followup_evidence_record_ids": record.get(
                        "followup_evidence_record_ids", []
                    ),
                    "comparability": record.get("comparability", "pending"),
                    "comparability_reason": record.get("comparability_reason", ""),
                    "teacher_conclusion": record.get("teacher_conclusion", ""),
                    "reviewer": record.get("reviewer", ""),
                    "concluded_at": record.get("concluded_at"),
                    "updated_at": record.get("updated_at"),
                }
            )
            record.update(payload)
            record["updated_at"] = datetime.now(UTC).isoformat()
            row.payload_json = json.dumps(record, ensure_ascii=False)
            row.updated_at = record["updated_at"]
            return record
