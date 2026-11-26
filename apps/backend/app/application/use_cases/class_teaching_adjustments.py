"""班级级教学实施与复测记录用例（与学生级教学调整相互独立）。"""

from __future__ import annotations

from datetime import UTC, datetime

ADJUSTMENT_STATUSES = {"not_completed", "partial", "completed"}


class ClassTeachingAdjustments:
    def __init__(self, uow_factory):
        self.uow_factory = uow_factory

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
        students = {
            row.get("学生编号"): row.get("模拟班级编号")
            for row in run.get("students", [])
        }
        records = [
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
        ]
        return {
            "run_id": run["run_id"],
            "class_id": class_id,
            "node_id": node_id,
            "records": sorted(records, key=lambda row: str(row["record_id"])),
        }

    def create(self, payload: dict) -> dict:
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
            cited = payload.get("followup_evidence_record_ids", [])
            allowed = self._class_evidence_ids(run, record["class_id"], followup_node)
            if (
                not cited
                or len(cited) != len(set(cited))
                or not set(cited).issubset(allowed)
            ):
                raise ValueError("后续效果必须引用本班该测验节点的实际作答记录")
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
