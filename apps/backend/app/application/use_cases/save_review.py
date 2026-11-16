"""Validate a teacher decision and append it through one Unit of Work."""

from ...domain.common.enums import ReviewStatus
from ...domain.teaching.models import RecommendationDraft, TeacherReview


class SaveReview:
    def __init__(self, uow_factory):
        self.uow_factory = uow_factory

    def execute(
        self, run_id: str, student_id: str, indicator_id: str, payload: dict
    ) -> dict:
        with self.uow_factory() as uow:
            run = uow.runs.load(run_id)
            if student_id not in {row["学生编号"] for row in run["students"]}:
                raise ValueError("学生编号不存在")
            if indicator_id not in {row["指标编号"] for row in run["objectives"]}:
                raise ValueError("指标编号不存在")
            try:
                status = ReviewStatus(payload.get("status"))
            except ValueError:
                raise ValueError("复核状态无效") from None

            item_ids = {
                row["材料编号"]
                for row in run["items"]
                if row["指标编号"] == indicator_id
            }
            allowed = {
                row["记录编号"]
                for row in run["responses"]
                if row["学生编号"] == student_id and row["材料编号"] in item_ids
            }
            cited = payload.get("evidence_record_ids", [])
            if (
                not isinstance(cited, list)
                or any(not isinstance(record_id, str) for record_id in cited)
                or not set(cited).issubset(allowed)
            ):
                raise ValueError("复核引用了无效记录")
            draft = RecommendationDraft(
                student_id=student_id,
                indicator_id=indicator_id,
                diagnosis=str(payload.get("diagnosis", "")),
                recommendation=str(payload.get("recommendation", "")),
                material_ids=tuple(sorted(item_ids)),
                evidence_record_ids=tuple(cited),
            )
            draft.validate_evidence(allowed)
            history = uow.reviews.list_domain(run_id, student_id, indicator_id)
            review = TeacherReview(
                student_id=student_id,
                indicator_id=indicator_id,
                status=status,
                version=len(history) + 1,
                recommendation=str(payload.get("recommendation", "")),
                evidence_record_ids=tuple(cited),
                reason=str(payload.get("reason", "")),
            )
            review.validate_next(history[-1] if history else None)
            original = payload.get("original_draft")
            if original is not None:
                if not isinstance(original, dict):
                    raise ValueError("原草稿格式无效")
                original_ids = original.get("evidence_record_ids", [])
                if (
                    not isinstance(original_ids, list)
                    or any(not isinstance(record_id, str) for record_id in original_ids)
                    or not set(original_ids).issubset(allowed)
                ):
                    raise ValueError("原草稿证据引用无效")
            return uow.reviews.append(
                run_id,
                f"{student_id}:{indicator_id}",
                {
                    "status": status.value,
                    "diagnosis": str(payload.get("diagnosis", "")),
                    "recommendation": str(payload.get("recommendation", "")),
                    "adjustment_condition": str(
                        payload.get("adjustment_condition", "")
                    ),
                    "source": str(payload.get("source", "rule")),
                    "model": payload.get("model"),
                    "prompt_version": payload.get("prompt_version"),
                    "original_draft": original,
                    "evidence_record_ids": cited,
                    "reason": str(payload.get("reason", "")),
                    "reviewer": str(payload.get("reviewer", "教师")),
                },
            )

    def save(
        self, run_id: str, student_id: str, indicator_id: str, payload: dict
    ) -> dict:
        """Compatibility spelling for the existing Store facade."""
        return self.execute(run_id, student_id, indicator_id, payload)
