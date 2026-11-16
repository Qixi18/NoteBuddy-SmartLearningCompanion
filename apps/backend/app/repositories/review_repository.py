"""Append-only teacher review history backed by SQLite."""

from __future__ import annotations

import json
from datetime import datetime, timezone

from sqlalchemy import select

from ..domain.teaching.models import TeacherReview
from ..infrastructure.database.models import ReviewRow
from ..infrastructure.database.mappers import review_from_row
from .base import SqlAlchemyRepository


class ReviewRepository(SqlAlchemyRepository):
    def __init__(self, root=None, *, database, session=None):
        self.root = root
        super().__init__(database, session=session)

    def list(self, run_id: str) -> dict:
        with self.session_scope() as session:
            rows = session.scalars(
                select(ReviewRow)
                .where(ReviewRow.run_id == run_id)
                .order_by(
                    ReviewRow.student_id, ReviewRow.indicator_id, ReviewRow.version
                )
            ).all()
            result: dict[str, list] = {}
            for row in rows:
                key = f"{row.student_id}:{row.indicator_id}"
                result.setdefault(key, []).append(json.loads(row.payload_json))
            return result

    def append(self, run_id: str, key: str, payload: dict) -> dict:
        try:
            student_id, indicator_id = key.split(":", 1)
        except ValueError as exc:
            raise ValueError("复核键格式无效") from exc
        with self.session_scope(write=True) as active_session:
            latest = active_session.scalars(
                select(ReviewRow)
                .where(
                    ReviewRow.run_id == run_id,
                    ReviewRow.student_id == student_id,
                    ReviewRow.indicator_id == indicator_id,
                )
                .order_by(ReviewRow.version.desc())
                .limit(1)
            ).first()
            record = {
                **payload,
                "version": latest.version + 1 if latest else 1,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
            active_session.add(
                ReviewRow(
                    run_id=run_id,
                    student_id=student_id,
                    indicator_id=indicator_id,
                    version=record["version"],
                    status=record.get("status", ""),
                    updated_at=record["updated_at"],
                    payload_json=json.dumps(
                        record, ensure_ascii=False, separators=(",", ":")
                    ),
                )
            )
            return record

    def import_history(self, run_id: str, history: dict) -> int:
        inserted = 0
        with self.session_scope(write=True) as active_session:
            for key, records in history.items():
                student_id, indicator_id = key.split(":", 1)
                for record in records:
                    version = int(record["version"])
                    existing = active_session.get(
                        ReviewRow, (run_id, student_id, indicator_id, version)
                    )
                    if existing is not None:
                        if json.loads(existing.payload_json) != record:
                            raise ValueError(f"复核记录冲突：{key} v{version}")
                        continue
                    active_session.add(
                        ReviewRow(
                            run_id=run_id,
                            student_id=student_id,
                            indicator_id=indicator_id,
                            version=version,
                            status=str(record.get("status", "")),
                            updated_at=str(record.get("updated_at", "")),
                            payload_json=json.dumps(
                                record, ensure_ascii=False, separators=(",", ":")
                            ),
                        )
                    )
                    inserted += 1
            return inserted

    def list_domain(
        self, run_id: str, student_id: str, indicator_id: str
    ) -> list[TeacherReview]:
        with self.session_scope() as active_session:
            rows = active_session.scalars(
                select(ReviewRow)
                .where(
                    ReviewRow.run_id == run_id,
                    ReviewRow.student_id == student_id,
                    ReviewRow.indicator_id == indicator_id,
                )
                .order_by(ReviewRow.version)
            ).all()
            return [review_from_row(row) for row in rows]
