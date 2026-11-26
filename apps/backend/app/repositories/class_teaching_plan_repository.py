"""Persistence adapter for versioned class teaching plans."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import func, select

from ..infrastructure.database.models import ClassTeachingPlanRow
from .base import SqlAlchemyRepository


def _row_to_dict(row: ClassTeachingPlanRow) -> dict:
    return {
        "plan_id": row.plan_id,
        "run_id": row.run_id,
        "class_id": row.class_id,
        "node_id": row.node_id,
        "version": row.version,
        "status": row.status,
        "generation_source": row.generation_source,
        "source_fingerprint": row.source_fingerprint,
        "analysis_id": row.analysis_id or "",
        "reviewer": row.reviewer or "",
        "review_reason": row.review_reason or "",
        "plan": json.loads(row.plan_json),
        "evidence_refs": json.loads(row.evidence_refs_json),
        "created_at": row.created_at,
        "updated_at": row.updated_at,
        "schema_version": 1,
        "teacher_review_required": True,
    }


class ClassTeachingPlanRepository(SqlAlchemyRepository):
    def __init__(self, database, *, session=None):
        super().__init__(database, session=session)

    def list(self, run_id: str, class_id: str, node_id: str) -> list[dict]:
        with self.session_scope() as session:
            statement = (
                select(ClassTeachingPlanRow)
                .where(
                    ClassTeachingPlanRow.run_id == run_id,
                    ClassTeachingPlanRow.class_id == class_id,
                    ClassTeachingPlanRow.node_id == node_id,
                )
                .order_by(ClassTeachingPlanRow.version)
            )
            return [_row_to_dict(row) for row in session.scalars(statement)]

    def get(self, plan_id: str) -> dict | None:
        with self.session_scope() as session:
            row = session.get(ClassTeachingPlanRow, plan_id)
            return _row_to_dict(row) if row else None

    def latest(self, run_id: str, class_id: str, node_id: str) -> dict | None:
        with self.session_scope() as session:
            statement = (
                select(ClassTeachingPlanRow)
                .where(
                    ClassTeachingPlanRow.run_id == run_id,
                    ClassTeachingPlanRow.class_id == class_id,
                    ClassTeachingPlanRow.node_id == node_id,
                )
                .order_by(ClassTeachingPlanRow.version.desc())
                .limit(1)
            )
            row = session.scalars(statement).first()
            return _row_to_dict(row) if row else None

    def next_version(self, run_id: str, class_id: str, node_id: str) -> int:
        with self.session_scope() as session:
            statement = select(func.max(ClassTeachingPlanRow.version)).where(
                ClassTeachingPlanRow.run_id == run_id,
                ClassTeachingPlanRow.class_id == class_id,
                ClassTeachingPlanRow.node_id == node_id,
            )
            current = session.scalar(statement)
            return int(current or 0) + 1

    def create(self, record: dict) -> dict:
        with self.session_scope(write=True) as session:
            now = datetime.now(UTC).isoformat()
            plan_id = record.get("plan_id") or uuid4().hex
            row = ClassTeachingPlanRow(
                plan_id=plan_id,
                run_id=record["run_id"],
                class_id=record["class_id"],
                node_id=record["node_id"],
                version=int(record["version"]),
                status=record["status"],
                generation_source=record["generation_source"],
                source_fingerprint=record["source_fingerprint"],
                analysis_id=record.get("analysis_id") or "",
                reviewer=record.get("reviewer") or "",
                review_reason=record.get("review_reason") or "",
                plan_json=json.dumps(record["plan"], ensure_ascii=False),
                evidence_refs_json=json.dumps(
                    record.get("evidence_refs") or [], ensure_ascii=False
                ),
                created_at=record.get("created_at") or now,
                updated_at=record.get("updated_at") or now,
            )
            session.add(row)
            session.flush()
            return _row_to_dict(row)
