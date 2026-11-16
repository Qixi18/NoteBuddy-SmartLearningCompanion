"""Validate teacher review decisions before persisting a new version."""

from ...repositories.analysis_run_repository import AnalysisRunRepository
from ...repositories.review_repository import ReviewRepository


class ReviewService:
    def __init__(self, runs: AnalysisRunRepository, reviews: ReviewRepository):
        self.runs = runs
        self.reviews = reviews

    def save(
        self, run_id: str, student_id: str, indicator_id: str, payload: dict
    ) -> dict:
        run = self.runs.load(run_id)
        if student_id not in {row["学生编号"] for row in run["students"]}:
            raise ValueError("学生编号不存在")
        if indicator_id not in {row["指标编号"] for row in run["objectives"]}:
            raise ValueError("指标编号不存在")
        if payload.get("status") not in {
            "accepted",
            "edited",
            "rejected",
            "needs_observation",
        }:
            raise ValueError("复核状态无效")
        if (
            payload["status"] == "edited"
            and not str(payload.get("recommendation", "")).strip()
        ):
            raise ValueError("修改后的建议不能为空")

        item_ids = {
            row["材料编号"] for row in run["items"] if row["指标编号"] == indicator_id
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

        key = f"{student_id}:{indicator_id}"
        return self.reviews.append(
            run_id,
            key,
            {
                "status": payload["status"],
                "diagnosis": str(payload.get("diagnosis", "")),
                "recommendation": str(payload.get("recommendation", "")),
                "adjustment_condition": str(payload.get("adjustment_condition", "")),
                "source": str(payload.get("source", "rule")),
                "model": payload.get("model"),
                "prompt_version": payload.get("prompt_version"),
                "original_draft": original,
                "evidence_record_ids": cited,
                "reason": str(payload.get("reason", "")),
                "reviewer": str(payload.get("reviewer", "教师")),
            },
        )
