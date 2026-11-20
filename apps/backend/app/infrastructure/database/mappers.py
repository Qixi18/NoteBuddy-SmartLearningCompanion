"""Explicit ORM/Domain conversion at the SQLAlchemy adapter boundary."""

import json

from ...domain.assessment.models import Response
from ...domain.common.enums import ReviewStatus, ScoringStatus
from ...domain.student.models import Student
from ...domain.subject.models import AssessmentItem, LearningMaterial, LearningObjective
from ...domain.teaching.models import TeacherReview
from .models import (
    AIAnalysisRow,
    ItemRow,
    ObjectiveRow,
    ResponseRow,
    ReviewRow,
    StudentRow,
)


def ai_analysis_from_row(row: AIAnalysisRow) -> dict:
    """Restore the persisted application analysis payload."""
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


def student_from_row(row: StudentRow) -> Student:
    return Student(student_id=row.student_id, class_id=row.class_id)


def student_payload(student: Student) -> dict:
    return {"学生编号": student.student_id, "模拟班级编号": student.class_id}


def objective_from_row(row: ObjectiveRow) -> LearningObjective:
    value = json.loads(row.data_json)
    return LearningObjective(
        indicator_id=row.indicator_id,
        topic_id=row.topic_id,
        title=row.title,
        description=str(value.get("说明", "")),
        source_refs=tuple(value.get("source_refs", ())),
    )


def material_from_row(row: ItemRow) -> LearningMaterial:
    value = json.loads(row.data_json)
    return LearningMaterial(
        material_id=row.material_id,
        material_type=row.item_type,
        objective_ids=tuple(json.loads(row.objective_ids_json)),
        content=str(value.get("题目内容", value.get("材料内容", ""))),
        resource_uri=value.get("资源位置"),
        source_refs=tuple(value.get("来源", ())),
    )


def assessment_item_from_row(row: ItemRow) -> AssessmentItem:
    value = json.loads(row.data_json)
    return AssessmentItem(
        item_id=row.material_id,
        item_type=row.item_type,
        objective_ids=tuple(json.loads(row.objective_ids_json)),
        max_score=float(value.get("满分", 1) or 1),
        content=str(value.get("题目内容", "")),
        source_refs=tuple(value.get("来源", ())),
    )


def response_from_row(row: ResponseRow) -> Response:
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


def review_from_row(row: ReviewRow) -> TeacherReview:
    value = json.loads(row.payload_json)
    return TeacherReview(
        student_id=row.student_id,
        indicator_id=row.indicator_id,
        status=ReviewStatus(row.status),
        version=row.version,
        recommendation=str(value.get("recommendation", "")),
        evidence_record_ids=tuple(value.get("evidence_record_ids", [])),
        reason=str(value.get("reason", "")),
    )
