"""Append-only source and case decisions within the active Unit of Work."""

import json
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import select

from ..infrastructure.database.models import (
    AIIndicatorMappingRow,
    ConfirmedCaseRow,
    SourceVerificationRow,
)
from .base import SqlAlchemyRepository


class SourceVerificationVersionConflict(Exception):
    """The source verification changed after the editor loaded it."""


class Stage2Repository(SqlAlchemyRepository):
    def __init__(self, database, *, session=None):
        super().__init__(database, session=session)

    def list_sources(self, run_id: str) -> dict[str, list[dict]]:
        with self.session_scope() as session:
            rows = session.scalars(
                select(SourceVerificationRow)
                .where(SourceVerificationRow.run_id == run_id)
                .order_by(
                    SourceVerificationRow.indicator_id, SourceVerificationRow.version
                )
            ).all()
            result: dict[str, list[dict]] = {}
            for row in rows:
                record = json.loads(row.payload_json)
                record.setdefault("version", row.version)
                record.setdefault("status", row.status)
                result.setdefault(row.indicator_id, []).append(record)
            return result

    def list_ai_mappings(self, run_id: str) -> dict[str, list[dict]]:
        with self.session_scope() as session:
            rows = session.scalars(
                select(AIIndicatorMappingRow)
                .where(AIIndicatorMappingRow.run_id == run_id)
                .order_by(
                    AIIndicatorMappingRow.indicator_id, AIIndicatorMappingRow.version
                )
            ).all()
            result: dict[str, list[dict]] = {}
            for row in rows:
                payload = json.loads(row.payload_json)
                payload.update(
                    version=row.version,
                    status=row.status,
                    input_fingerprint=row.input_fingerprint,
                )
                result.setdefault(row.indicator_id, []).append(payload)
            return result

    def append_ai_mapping(
        self, run_id: str, indicator_id: str, fingerprint: str, payload: dict
    ) -> dict:
        with self.session_scope(write=True) as session:
            latest = session.scalars(
                select(AIIndicatorMappingRow)
                .where(
                    AIIndicatorMappingRow.run_id == run_id,
                    AIIndicatorMappingRow.indicator_id == indicator_id,
                )
                .order_by(AIIndicatorMappingRow.version.desc())
                .limit(1)
            ).first()
            version = (latest.version + 1) if latest else 1
            record = {
                **payload,
                "run_id": run_id,
                "indicator_id": indicator_id,
                "version": version,
                "input_fingerprint": fingerprint,
                "status": payload.get("status", "needs_resolution"),
                "created_at": datetime.now(UTC).isoformat(),
            }
            session.add(
                AIIndicatorMappingRow(
                    mapping_id=uuid4().hex,
                    run_id=run_id,
                    indicator_id=indicator_id,
                    version=version,
                    input_fingerprint=fingerprint,
                    status=record["status"],
                    payload_json=json.dumps(record, ensure_ascii=False),
                    created_at=record["created_at"],
                )
            )
            return record

    def list_cases(self, run_id: str) -> dict[str, list[dict]]:
        with self.session_scope() as session:
            rows = session.scalars(
                select(ConfirmedCaseRow)
                .where(ConfirmedCaseRow.run_id == run_id)
                .order_by(ConfirmedCaseRow.student_id, ConfirmedCaseRow.version)
            ).all()
            result: dict[str, list[dict]] = {}
            for row in rows:
                result.setdefault(row.student_id, []).append(
                    json.loads(row.payload_json)
                )
            return result

    def append_source(
        self,
        run_id: str,
        indicator_id: str,
        payload: dict,
        *,
        expected_version: int | None = None,
    ) -> dict:
        with self.session_scope(write=True) as session:
            latest = session.scalars(
                select(SourceVerificationRow)
                .where(
                    SourceVerificationRow.run_id == run_id,
                    SourceVerificationRow.indicator_id == indicator_id,
                )
                .order_by(SourceVerificationRow.version.desc())
                .limit(1)
            ).first()
            latest_version = latest.version if latest else 0
            if expected_version is not None and expected_version != latest_version:
                raise SourceVerificationVersionConflict(
                    "来源签核已被其他编辑更新，请刷新记录后再保存"
                )
            record = {
                **payload,
                "run_id": run_id,
                "indicator_id": indicator_id,
                "version": latest.version + 1 if latest else 1,
                "reviewed_at": datetime.now(UTC).isoformat(),
            }
            session.add(
                SourceVerificationRow(
                    run_id=run_id,
                    indicator_id=indicator_id,
                    version=record["version"],
                    status=record["status"],
                    payload_json=json.dumps(record, ensure_ascii=False),
                )
            )
            return record

    def append_case(self, run_id: str, student_id: str, payload: dict) -> dict:
        with self.session_scope(write=True) as session:
            latest = session.scalars(
                select(ConfirmedCaseRow)
                .where(
                    ConfirmedCaseRow.run_id == run_id,
                    ConfirmedCaseRow.student_id == student_id,
                )
                .order_by(ConfirmedCaseRow.version.desc())
                .limit(1)
            ).first()
            record = {
                **payload,
                "run_id": run_id,
                "student_id": student_id,
                "version": latest.version + 1 if latest else 1,
                "reviewed_at": datetime.now(UTC).isoformat(),
            }
            session.add(
                ConfirmedCaseRow(
                    run_id=run_id,
                    student_id=student_id,
                    version=record["version"],
                    status=record["status"],
                    payload_json=json.dumps(record, ensure_ascii=False),
                )
            )
            return record
