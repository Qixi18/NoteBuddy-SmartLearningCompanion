"""Teacher recorded, evidence linked teaching adjustment cycles."""

from __future__ import annotations

from datetime import UTC, datetime

from ...services.task02.evidence_reference_service import (
    validate_evidence_references,
)
from ...domain.assessment.evidence_bundle import AnalysisScope
from ...services.shared.node_ordering import compare_node_dates, compare_nodes
from ...services.task02.evidence_bundle_service import build_evidence_bundle


class TeachingAdjustments:
    def __init__(self, uow_factory):
        self.uow_factory = uow_factory

    def list(self, student_id: str | None = None) -> list[dict]:
        with self.uow_factory(immediate=False) as uow:
            return uow.teaching_adjustments.list(student_id)

    def create(self, payload: dict) -> dict:
        with self.uow_factory() as uow:
            run = uow.runs.load(payload["origin_run_id"])
            self._validate_scope(
                run,
                payload["student_id"],
                payload["indicator_id"],
                payload["origin_node_id"],
            )
            origin_node = next(
                node
                for node in run.get("nodes", [])
                if node.get("节点编号") == payload["origin_node_id"]
            )
            key = f"{payload['student_id']}:{payload['indicator_id']}"
            reviews = uow.reviews.list(run["run_id"]).get(key, [])
            review = next(
                (
                    item
                    for item in reviews
                    if item["version"] == payload["review_version"]
                ),
                None,
            )
            review_node = (review or {}).get("node_id") or (
                (review or {}).get("original_draft") or {}
            ).get("node_id")
            if (
                not review
                or review_node != payload["origin_node_id"]
                or review["status"] not in {"accepted", "edited"}
            ):
                raise ValueError("起始复核必须是该节点已接受或修改的教师复核")
            source_ids = set(review.get("evidence_record_ids", []))
            origin_refs = validate_evidence_references(
                run, payload.get("origin_evidence_refs", [])
            )
            coverage_refs = [
                reference
                for reference in origin_refs
                if isinstance(reference, dict) and reference.get("kind") == "coverage"
            ]
            if len(coverage_refs) > 1 or (coverage_refs and source_ids):
                raise ValueError("起始覆盖引用与作答记录引用冲突")
            if coverage_refs:
                if len(coverage_refs) != len(origin_refs):
                    raise ValueError("覆盖起始证据不能混入作答引用")
                checked = coverage_refs[0]
                if (
                    checked["scope"]
                    != {
                        "run_id": run["run_id"],
                        "student_id": payload["student_id"],
                        "indicator_id": payload["indicator_id"],
                        "node_id": payload["origin_node_id"],
                    }
                    or checked not in review.get("evidence_refs", [])
                    or not review.get("reason", "").strip()
                    or not review.get("structured_plan")
                ):
                    raise ValueError("起始覆盖证据必须关联教师确认的诊断方案和理由")
                origin_refs = [checked]
            elif not source_ids or not source_ids.issubset(
                self._evidence_ids(
                    run,
                    payload["student_id"],
                    payload["indicator_id"],
                    payload["origin_node_id"],
                )
            ):
                raise ValueError("起始复核缺少当前节点的有效证据")
            response_ref_ids = {
                reference["record_id"]
                for reference in origin_refs
                if reference["kind"] == "response"
            }
            if response_ref_ids and response_ref_ids != source_ids:
                raise ValueError("起始作答引用与教师复核证据不一致")
            return uow.teaching_adjustments.create(
                {
                    key: payload[key]
                    for key in (
                        "student_id",
                        "indicator_id",
                        "origin_run_id",
                        "origin_node_id",
                        "review_version",
                    )
                }
                | {
                    "origin_evidence_refs": origin_refs,
                    "origin_node_date": str(origin_node.get("模拟测验日期") or "").strip(),
                },
                {
                    key: payload[key]
                    for key in (
                        "planned_activity",
                        "planned_practice",
                        "observation_points",
                        "teacher",
                        "planned_at",
                    )
                },
            )

    def update(self, adjustment_id: str, payload: dict) -> dict:
        with self.uow_factory() as uow:
            record = uow.teaching_adjustments.get(adjustment_id)
            if record is None:
                raise FileNotFoundError("教学调整记录不存在")
            followup = uow.runs.load(payload["followup_run_id"])
            origin = uow.runs.load(record["origin_run_id"])
            origin_node = next(
                (
                    node
                    for node in origin.get("nodes", [])
                    if node.get("节点编号") == record["origin_node_id"]
                ),
                None,
            )
            followup_node = next(
                (
                    node
                    for node in followup.get("nodes", [])
                    if node.get("节点编号") == payload["followup_node_id"]
                ),
                None,
            )
            if origin_node is None or followup_node is None:
                raise ValueError("起始或复测节点不存在，无法确认测验先后")
            chronology = (
                compare_nodes(
                    followup.get("nodes", []),
                    record["origin_node_id"],
                    payload["followup_node_id"],
                )
                if origin.get("run_id") == followup.get("run_id")
                else compare_node_dates(origin_node, followup_node)
            )
            if chronology == 1:
                raise ValueError("后续测验日期早于起始测验")
            if chronology is None:
                raise ValueError("后续测验日期缺失或与起始日期相同；请先核对测验日期")
            if chronology == 0:
                raise ValueError("后续测验必须晚于起始测验；不能复用起始节点的作答")
            self._validate_scope(
                followup,
                record["student_id"],
                record["indicator_id"],
                payload["followup_node_id"],
            )
            allowed = self._evidence_ids(
                followup,
                record["student_id"],
                record["indicator_id"],
                payload["followup_node_id"],
            )
            cited = payload["followup_evidence_record_ids"]
            if len(cited) != len(set(cited)) or not set(cited).issubset(allowed):
                raise ValueError("后续有效评分证据必须来自同一学生、指标和测验节点")
            followup_refs = validate_evidence_references(
                followup, payload.get("followup_evidence_refs", [])
            )
            if followup_refs:
                expected_scope = {
                    "run_id": followup["run_id"],
                    "student_id": record["student_id"],
                    "indicator_id": record["indicator_id"],
                    "node_id": payload["followup_node_id"],
                }
                response_ref_ids = {
                    reference["record_id"]
                    for reference in followup_refs
                    if reference["kind"] == "response"
                }
                if (
                    any(reference["kind"] != "response" for reference in followup_refs)
                    or any(
                        reference["scope"] != expected_scope
                        for reference in followup_refs
                    )
                    or response_ref_ids != set(cited)
                ):
                    raise ValueError("后续作答引用与所选学生、指标、节点或记录不一致")
            completion = dict(payload)
            completion["followup_run_id"] = followup["run_id"]
            completion["followup_node_id"] = payload["followup_node_id"]
            completion["followup_evidence_refs"] = followup_refs
            completion["concluded_at"] = (
                payload["concluded_at"] or datetime.now(UTC).isoformat()
            )
            return uow.teaching_adjustments.update(adjustment_id, completion)

    @staticmethod
    def _validate_scope(
        run: dict, student_id: str, indicator_id: str, node_id: str
    ) -> None:
        if student_id not in {row["学生编号"] for row in run.get("students", [])}:
            raise ValueError("学生编号不属于所选分析运行")
        if indicator_id not in {row["指标编号"] for row in run.get("objectives", [])}:
            raise ValueError("指标编号不属于所选分析运行")
        if node_id not in {row["节点编号"] for row in run.get("nodes", [])}:
            raise ValueError("测验节点不属于所选分析运行")

    @staticmethod
    def _evidence_ids(
        run: dict, student_id: str, indicator_id: str, node_id: str
    ) -> set[str]:
        scope = AnalysisScope(
            run_id=run.get("run_id", ""),
            student_id=student_id,
            indicator_id=indicator_id,
            node_id=node_id,
        )
        bundle = build_evidence_bundle(run, scope, {})
        return {
            response["record_id"]
            for response in bundle.get("responses", [])
            if response.get("disposition") == "scored" and response.get("record_id")
        }
