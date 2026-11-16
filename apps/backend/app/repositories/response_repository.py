"""Run-scoped response persistence exposed as Domain objects."""

import json

from sqlalchemy import select

from ..domain.assessment.models import Response
from ..domain.common.enums import ScoringStatus
from ..infrastructure.database.models import ResponseEventRow, ResponseRow
from ..infrastructure.database.session import Database


class ResponseRepository:
    def __init__(self, database: Database):
        self.database = database

    @staticmethod
    def _domain(row: ResponseRow) -> Response:
        value = json.loads(row.data_json)
        raw_status = str(value.get("评分状态", "异常"))
        try:
            status = ScoringStatus(raw_status)
        except ValueError:
            status = ScoringStatus.INVALID
        raw_score = value.get("得分")
        score = float(raw_score) if raw_score not in (None, "") else None
        return Response(
            record_id=str(value.get("记录编号", row.record_id)),
            event_id=str(value.get("作答事件编号", row.event_key or "")),
            student_id=str(value.get("学生编号", row.student_id or "")),
            material_id=str(value.get("材料编号", row.material_id or "")),
            node_id=str(value.get("节点编号", row.node_id or "")),
            revision_no=int(value.get("修订版本", 1)),
            scoring_status=status,
            score=score,
            max_score=float(value.get("满分", 1) or 1),
            work_steps=str(value.get("解答过程", "")),
            rubric_scores=str(value.get("评分点得分", "")),
            source_file="作答记录.csv",
            source_line=row.source_line,
        )

    def get_by_id(self, run_id: str, record_id: str) -> Response | None:
        with self.database.session() as session:
            row = session.get(ResponseRow, (run_id, record_id))
            return self._domain(row) if row else None

    def list_by_student(
        self, run_id: str, student_id: str, *, selected_only: bool = False
    ) -> list[Response]:
        statement = select(ResponseRow).where(
            ResponseRow.run_id == run_id, ResponseRow.student_id == student_id
        )
        if selected_only:
            statement = statement.where(ResponseRow.is_selected.is_(True))
        with self.database.session() as session:
            rows = session.scalars(statement.order_by(ResponseRow.source_line)).all()
            results = []
            for row in rows:
                try:
                    results.append(self._domain(row))
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
        with self.database.session() as session, session.begin():
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
