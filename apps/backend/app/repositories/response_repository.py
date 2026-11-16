"""Run-scoped response persistence exposed as Domain objects."""

import json

from sqlalchemy import select

from ..domain.assessment.models import Response
from ..infrastructure.database.models import ResponseEventRow, ResponseRow
from .base import SqlAlchemyRepository
from ..infrastructure.database.mappers import response_from_row


class ResponseRepository(SqlAlchemyRepository):
    def __init__(self, database, *, session=None):
        super().__init__(database, session=session)

    def get_by_id(self, run_id: str, record_id: str) -> Response | None:
        with self.session_scope() as session:
            row = session.get(ResponseRow, (run_id, record_id))
            return response_from_row(row) if row else None

    def list_by_student(
        self, run_id: str, student_id: str, *, selected_only: bool = False
    ) -> list[Response]:
        statement = select(ResponseRow).where(
            ResponseRow.run_id == run_id, ResponseRow.student_id == student_id
        )
        if selected_only:
            statement = statement.where(ResponseRow.is_selected.is_(True))
        with self.session_scope() as session:
            rows = session.scalars(statement.order_by(ResponseRow.source_line)).all()
            results = []
            for row in rows:
                try:
                    results.append(response_from_row(row))
                except (TypeError, ValueError):
                    # Invalid source rows stay available in the immutable run snapshot.
                    continue
            return results

    def save(self, run_id: str, response: Response) -> None:
        event_key = response.event_id or f"__missing_event_{response.record_id}"
        data = {
            "记录编号": response.record_id,
            "作答事件编号": response.event_id,
            "学生编号": response.student_id,
            "材料编号": response.material_id,
            "节点编号": response.node_id,
            "修订版本": str(response.revision_no),
            "评分状态": response.scoring_status.value,
            "得分": "" if response.score is None else str(response.score),
            "满分": str(response.max_score),
            "解答过程": response.work_steps,
            "评分点得分": response.rubric_scores,
            "_source_line": response.source_line,
        }
        with self.session_scope(write=True) as session:
            if session.get(ResponseEventRow, (run_id, event_key)) is None:
                session.add(
                    ResponseEventRow(
                        run_id=run_id,
                        event_key=event_key,
                        event_id=response.event_id or None,
                    )
                )
            row = session.get(ResponseRow, (run_id, response.record_id))
            if row is None:
                session.add(
                    ResponseRow(
                        run_id=run_id,
                        record_id=response.record_id,
                        event_key=event_key,
                        is_selected=False,
                        student_id=response.student_id,
                        material_id=response.material_id,
                        node_id=response.node_id,
                        source_line=response.source_line,
                        data_json=json.dumps(data, ensure_ascii=False),
                    )
                )
            else:
                row.data_json = json.dumps(data, ensure_ascii=False)
