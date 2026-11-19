"""Teacher recorded, evidence linked teaching adjustment cycles."""

from __future__ import annotations

from datetime import UTC, datetime


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
            if not source_ids or not source_ids.issubset(
                self._evidence_ids(
                    run,
                    payload["student_id"],
                    payload["indicator_id"],
                    payload["origin_node_id"],
                )
            ):
                raise ValueError("起始复核缺少当前节点的有效证据")
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
                raise ValueError("后续证据必须来自同一学生、指标和测验节点")
            completion = dict(payload)
            completion["followup_run_id"] = followup["run_id"]
            completion["followup_node_id"] = payload["followup_node_id"]
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
        item_ids = {
            row["材料编号"]
            for row in run.get("items", [])
            if row["指标编号"] == indicator_id
        }
        return {
            row["记录编号"]
            for row in run.get("responses", [])
            if row["学生编号"] == student_id
            and row["材料编号"] in item_ids
            and row["节点编号"] == node_id
        }
