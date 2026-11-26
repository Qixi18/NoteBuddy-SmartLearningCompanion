"""班级级教学实施与复测记录用例（与学生级教学调整相互独立）。"""

from __future__ import annotations

from datetime import UTC, datetime

from ...services.task02.quality_service import validate_records

ADJUSTMENT_STATUSES = {"not_completed", "partial", "completed"}


class ClassTeachingAdjustments:

    def __init__(self, uow_factory, class_teaching_plans=None):
        self.uow_factory = uow_factory
        self.class_teaching_plans = class_teaching_plans

    def list(self, class_id: str, node_id: str) -> list[dict]:
        with self.uow_factory(immediate=False) as uow:
            run = uow.runs.current()
            self._validate_scope(run, class_id, node_id)
            return uow.class_teaching_adjustments.list(run["run_id"], class_id, node_id)

    def evidence(self, class_id: str, node_id: str) -> dict:
        """本班该节点可引用的作答记录，供实施与复测记录选择。"""
        with self.uow_factory(immediate=False) as uow:
            run = uow.runs.current()
        self._validate_scope(run, class_id, node_id)
        records = self._available_class_evidence(run, class_id, node_id)
        return {
            "run_id": run["run_id"],
            "class_id": class_id,
            "node_id": node_id,
            "records": sorted(records, key=lambda row: str(row["record_id"])),
        }

    def _available_class_evidence(self, run: dict, class_id: str, node_id: str) -> list[dict]:
        students = {
            row.get("学生编号"): row.get("模拟班级编号")
            for row in run.get("students", [])
        }
        eligible_ids = self._eligible_response_ids(run)
        return [
            {
                "record_id": row.get("记录编号"),
                "student_id": row.get("学生编号"),
                "material_id": row.get("材料编号"),
                "score": row.get("得分"),
                "maximum": row.get("满分"),
                "score_status": row.get("评分状态"),
            }
            for row in run.get("responses", [])
            if students.get(row.get("学生编号")) == class_id
            and row.get("节点编号") == node_id
            and row.get("记录编号") in eligible_ids
        ]

    def create(self, payload: dict) -> dict:
        # Compute the freshness fingerprint before opening the write transaction;
        # the plan use case owns its own read-only unit of work.
        current_fingerprint = None
        if self.class_teaching_plans is not None:
            current_fingerprint = self.class_teaching_plans.current_fingerprint(
                payload["class_id"], payload["node_id"]
            )
        with self.uow_factory() as uow:
            run = uow.runs.current()
            if payload.get("run_id") and payload["run_id"] != run["run_id"]:
                raise ValueError("当前运行已变化；请刷新后重新记录")
            class_id = payload["class_id"]
            node_id = payload["node_id"]
            self._validate_scope(run, class_id, node_id)
            latest = uow.class_teaching_plans.latest(run["run_id"], class_id, node_id)
            if latest is None or latest["status"] not in {"accepted", "edited"}:
                raise ValueError("班级教学方案尚未被教师采纳，不能创建实施记录")
            if payload["plan_id"] != latest["plan_id"]:
                raise ValueError("只能基于当前最新且已采纳的班级方案创建实施记录")
            if current_fingerprint is not None:
                if latest["source_fingerprint"] != current_fingerprint:
                    raise ValueError("方案已过期：请刷新证据并重新生成、审核后再创建实施记录")
            return uow.class_teaching_adjustments.create(
                {
                    "run_id": run["run_id"],
                    "class_id": class_id,
                    "node_id": node_id,
                    "plan_id": latest["plan_id"],
                    "plan_version": latest["version"],
                    "planned_activity": payload["planned_activity"].strip(),
                    "planned_practice": [
                        value.strip()
                        for value in payload.get("planned_practice", [])
                        if value.strip()
                    ],
                    "observation_points": [
                        value.strip()
                        for value in payload.get("observation_points", [])
                        if value.strip()
                    ],
                    "teacher": (payload.get("teacher") or "").strip(),
                    "planned_at": payload.get("planned_at")
                    or datetime.now(UTC).isoformat(),
                }
            )

    def update(self, adjustment_id: str, payload: dict) -> dict:
        with self.uow_factory() as uow:
            record = uow.class_teaching_adjustments.get(adjustment_id)
            if record is None:
                raise FileNotFoundError("班级教学实施记录不存在")
            run = uow.runs.current()
            if record["run_id"] != run["run_id"]:
                raise ValueError("当前运行已变化；请刷新后重新记录")
            status = payload["implementation_status"]
            if status not in ADJUSTMENT_STATUSES:
                raise ValueError("实施状态无效")
            if not payload["implementation"].strip():
                raise ValueError("请填写实施情况")
            followup_node = payload["followup_node_id"]
            self._validate_scope(run, record["class_id"], followup_node)
            node_order = {
                node.get("节点编号"): index
                for index, node in enumerate(run.get("nodes", []))
            }
            if node_order[followup_node] < node_order[record["node_id"]]:
                raise ValueError("复测节点必须与实施节点相同或在其后")
            cited = payload.get("followup_evidence_record_ids", [])
            allowed = self._class_evidence_ids(run, record["class_id"], followup_node)
            if (
                not cited
                or len(cited) != len(set(cited))
                or not set(cited).issubset(allowed)
            ):
                raise ValueError("后续效果必须引用本班所选复测节点的实际作答记录")
            eligible_ids = self._eligible_response_ids(run)
            if any(record_id not in eligible_ids for record_id in cited):
                raise ValueError("复测证据必须是当前有效版本的有效评分记录")
            plan = uow.class_teaching_plans.get(record["plan_id"])
            if plan is None:
                raise ValueError("原教学方案不存在，无法核验复测目标")
            objective_ids = {
                str(ref.get("indicator_id"))
                for ref in plan.get("evidence_refs", [])
                if ref.get("kind") == "class_indicator" and ref.get("indicator_id")
            }
            followup_evidence = self._available_class_evidence(
                run, record["class_id"], followup_node
            )
            evidence_by_id = {row["record_id"]: row for row in followup_evidence}
            cited_materials = {evidence_by_id[record_id]["material_id"] for record_id in cited}
            if objective_ids and not any(
                next(
                    (item.get("指标编号") for item in run.get("items", []) if item.get("材料编号") == material_id),
                    None,
                ) in objective_ids
                for material_id in cited_materials
            ):
                raise ValueError("复测证据需至少覆盖原方案教学目标对应的题目")
            conclusion = (payload.get("teacher_conclusion") or "").strip()
            if status == "completed" and not conclusion:
                raise ValueError("完成实施时必须填写教师结论")
            return uow.class_teaching_adjustments.update(
                adjustment_id,
                {
                    "implementation": payload["implementation"].strip(),
                    "implementation_status": status,
                    "outcome_observations": (
                        payload.get("outcome_observations") or ""
                    ).strip(),
                    "followup_node_id": followup_node,
                    "followup_evidence_record_ids": cited,
                    "teacher_conclusion": conclusion,
                    "concluded_at": payload.get("concluded_at")
                    or datetime.now(UTC).isoformat(),
                },
            )
    # -- 校验 ---------------------------------------------------------------

    @staticmethod
    def _validate_scope(run: dict, class_id: str, node_id: str) -> None:
        classes = {
            row.get("模拟班级编号") for row in run.get("students", [])
        } - {None, ""}
        if class_id not in classes:
            raise ValueError("班级不属于当前分析运行")
        if node_id not in {row.get("节点编号") for row in run.get("nodes", [])}:
            raise ValueError("测验节点不属于当前分析运行")

    @staticmethod
    def _class_evidence_ids(run: dict, class_id: str, node_id: str) -> set[str]:
        students = {
            row.get("学生编号")
            for row in run.get("students", [])
            if row.get("模拟班级编号") == class_id
        }
        return {
            row.get("记录编号")
            for row in run.get("responses", [])
            if row.get("学生编号") in students and row.get("节点编号") == node_id
        }

    @staticmethod
    def _eligible_response_ids(run: dict) -> set[str]:
        records = run.get("raw_responses", run.get("responses", []))
        findings: list[dict] = []
        excluded: list[str] = []
        eligible = validate_records(
            run.get("responses", []),
            records,
            {row.get("学生编号"): row for row in run.get("students", [])},
            {row.get("材料编号"): row for row in run.get("items", [])},
            {row.get("节点编号"): row for row in run.get("nodes", [])},
            {row.get("指标编号") for row in run.get("objectives", [])},
            findings,
            excluded,
        )
        return {row.get("记录编号") for row in eligible if row.get("记录编号")}
