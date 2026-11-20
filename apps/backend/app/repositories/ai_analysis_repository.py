"""SQLite adapter for immutable AI analysis results."""

from __future__ import annotations

import json
from datetime import UTC, datetime

from sqlalchemy import func, select

from ..infrastructure.database.models import AIAnalysisRow
from .base import SqlAlchemyRepository


def _payload(row: AIAnalysisRow) -> dict:
    return {
        **json.loads(row.payload_json),
        "analysis_id": row.analysis_id,
        "run_id": row.run_id,
        "task": row.task,
        "scope_key": row.scope_key,
        "source_fingerprint": row.source_fingerprint,
        "model": row.model,
        "prompt_version": row.prompt_version,
        "schema_version": row.schema_version,
        "generation": row.generation,
        "request_id": row.request_id,
        "status": row.status,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


class AIAnalysisRepository(SqlAlchemyRepository):
    def __init__(self, database, *, session=None):
        super().__init__(database, session=session)

    def get(self, analysis_id: str) -> dict | None:
        with self.session_scope() as session:
            row = session.get(AIAnalysisRow, analysis_id)
            return _payload(row) if row else None

    def latest(self, run_id: str, task: str, scope_key: str) -> dict | None:
        with self.session_scope() as session:
            row = session.scalar(
                select(AIAnalysisRow)
                .where(
                    AIAnalysisRow.run_id == run_id,
                    AIAnalysisRow.task == task,
                    AIAnalysisRow.scope_key == scope_key,
                )
                .order_by(AIAnalysisRow.generation.desc())
                .limit(1)
            )
            return _payload(row) if row else None

    def get_by_request(
        self, run_id: str, task: str, scope_key: str, request_id: str
    ) -> dict | None:
        with self.session_scope() as session:
            row = session.scalar(
                select(AIAnalysisRow).where(
                    AIAnalysisRow.run_id == run_id,
                    AIAnalysisRow.task == task,
                    AIAnalysisRow.scope_key == scope_key,
                    AIAnalysisRow.request_id == request_id,
                )
            )
            return _payload(row) if row else None

    def next_generation(self, run_id: str, task: str, scope_key: str) -> int:
        with self.session_scope() as session:
            current = session.scalar(
                select(func.max(AIAnalysisRow.generation)).where(
                    AIAnalysisRow.run_id == run_id,
                    AIAnalysisRow.task == task,
                    AIAnalysisRow.scope_key == scope_key,
                )
            )
            return int(current or 0) + 1

    def create(self, payload: dict) -> dict:
        now = datetime.now(UTC).isoformat()
        row = AIAnalysisRow(
            analysis_id=payload["analysis_id"],
            run_id=payload["run_id"],
            task=payload["task"],
            scope_key=payload["scope_key"],
            source_fingerprint=payload["source_fingerprint"],
            model=payload["model"],
            prompt_version=payload["prompt_version"],
            schema_version=payload["schema_version"],
            generation=payload["generation"],
            request_id=payload["request_id"],
            status=payload["status"],
            payload_json=json.dumps(payload["result"], ensure_ascii=False),
            created_at=now,
            updated_at=now,
        )
        with self.session_scope(write=True) as session:
            session.add(row)
            session.flush()
        return _payload(row)

    def update(self, analysis_id: str, status: str, payload: dict) -> dict:
        with self.session_scope(write=True) as session:
            row = session.get(AIAnalysisRow, analysis_id)
            if row is None:
                raise ValueError("AI分析记录不存在")
            row.status = status
            row.payload_json = json.dumps(payload, ensure_ascii=False)
            row.updated_at = datetime.now(UTC).isoformat()
            session.flush()
        return _payload(row)
