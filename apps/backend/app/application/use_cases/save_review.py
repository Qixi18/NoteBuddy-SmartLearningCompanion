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
            original = payload.get("original_draft")
            if original is not None and not isinstance(original, dict):
                raise ValueError("原草稿格式无效")
            scoped_allowed = allowed
            review_node_id = payload.get("node_id")
            if original is not None:
                if original.get("run_id") not in {None, run_id}:
                    raise ValueError("原草稿不属于当前分析运行")
                if original.get("student_id") not in {None, student_id} or (
                    original.get("indicator_id") not in {None, indicator_id}
                ):
                    raise ValueError("原草稿学生或指标范围无效")
                if original.get("scope_required") is True:
                    raise ValueError("原草稿尚未确定测验节点范围")
                node_id = original.get("node_id")
                if node_id is not None:
                    if node_id not in {row["节点编号"] for row in run.get("nodes", [])}:
                        raise ValueError("原草稿测验节点无效")
                    scoped_allowed = {
                        row["记录编号"]
                        for row in run["responses"]
                        if row["学生编号"] == student_id
                        and row["材料编号"] in item_ids
                        and row["节点编号"] == node_id
                    }
                review_node_id = node_id
            if review_node_id is not None and review_node_id not in {
                row["节点编号"] for row in run.get("nodes", [])
            }:
                raise ValueError("复核测验节点无效")
            cited = payload.get("evidence_record_ids", [])
            if (
                not isinstance(cited, list)
                or any(not isinstance(record_id, str) for record_id in cited)
                or not set(cited).issubset(scoped_allowed)
            ):
                raise ValueError("复核引用了范围外或无效记录")
            structured_plan = payload.get("structured_plan")
            source_versions: dict[str, int] = {}
            if structured_plan is not None:
                if (
                    not isinstance(structured_plan, dict)
                    or original is None
                    or review_node_id is None
                ):
                    raise ValueError("结构化方案必须关联原草稿与单一测验节点")
                if status not in {ReviewStatus.ACCEPTED, ReviewStatus.EDITED}:
                    raise ValueError("结构化方案须经教师接受或修改")
                material_ids = structured_plan.get("material_ids", [])
                if (
                    not isinstance(material_ids, list)
                    or not material_ids
                    or len(material_ids) != len(set(material_ids))
                ):
                    raise ValueError("结构化方案须选择不重复的已核验材料")
                if any(
                    not isinstance(value, str) or not value.strip()
                    for value in material_ids
                ):
                    raise ValueError("结构化方案材料编号无效")
                for field in ("activity",):
                    if (
                        not isinstance(structured_plan.get(field), str)
                        or not structured_plan[field].strip()
                    ):
                        raise ValueError("结构化方案须填写学习活动")
                for field in ("steps", "practice", "observation_points"):
                    values = structured_plan.get(field)
                    if (
                        not isinstance(values, list)
                        or not values
                        or any(
                            not isinstance(value, str) or not value.strip()
                            for value in values
                        )
                    ):
                        raise ValueError("结构化方案缺少活动步骤、练习或观察点")
                histories = uow.stage2.list_sources(run_id)
                latest = histories.get(indicator_id, [])[-1:]
                verification = latest[0] if latest else None
                if (
                    not verification
                    or verification["status"] != "verified"
                    or not set(material_ids).issubset(verification["material_ids"])
                ):
                    raise ValueError("所选教学材料尚未完成当前运行的指标来源签核")
                source_versions[indicator_id] = verification["version"]
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
            if original is not None:
                original_ids = original.get("evidence_record_ids", [])
                if (
                    not isinstance(original_ids, list)
                    or any(not isinstance(record_id, str) for record_id in original_ids)
                    or not set(original_ids).issubset(scoped_allowed)
                ):
                    raise ValueError("原草稿证据引用无效")
            return uow.reviews.append(
                run_id,
                f"{student_id}:{indicator_id}",
                {
                    "status": status.value,
                    "node_id": review_node_id,
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
                    "structured_plan": structured_plan,
                    "source_verification_versions": source_versions,
                },
            )

    def save(
        self, run_id: str, student_id: str, indicator_id: str, payload: dict
    ) -> dict:
        """Compatibility spelling for the existing Store facade."""
        return self.execute(run_id, student_id, indicator_id, payload)
