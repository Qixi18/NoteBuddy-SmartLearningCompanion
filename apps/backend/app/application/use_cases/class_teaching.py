"""班级教学方案的生成、查询与教师审核用例。"""

from __future__ import annotations

from datetime import UTC, datetime

from ...domain.teaching.class_plan import (
    ClassPlanBody,
    ClassPlanScope,
    ClassTeachingPlan,
)
from ...services.shared.report_service import build_class_report
from ...services.task02.class_insight_service import build_class_insights
from ...services.task03.class_teaching_plan_service import (
    build_rule_plan,
    current_class_plan_fingerprint,
)


class ClassTeachingPlanUseCases:
    def __init__(self, uow_factory, stage2, source_service):
        self.uow_factory = uow_factory
        self.stage2 = stage2
        self.source_service = source_service

    # -- 内部 ---------------------------------------------------------------
    def _snapshot(self) -> tuple[dict, dict, dict]:
        with self.uow_factory(immediate=False) as uow:
            run = uow.runs.current()
            sources = uow.stage2.list_sources(run["run_id"])
            mappings = uow.stage2.list_ai_mappings(run["run_id"])
        return run, self.stage2.with_source_freshness(run, sources), mappings

    def _report(self, run: dict, node_id: str, sources: dict, mappings: dict) -> dict:
        # 延迟导入：workbench 在模块层导入本用例，避免循环依赖。
        from .workbench import _ai_mapping_summaries

        insights = build_class_insights(
            run,
            node_id,
            sources,
            _ai_mapping_summaries(run, mappings, self.source_service),
        )
        return build_class_report(run, node_id, insights)

    def _validate_class(self, run: dict, class_id: str, node_id: str) -> None:
        classes = {
            row.get("模拟班级编号") for row in run.get("students", [])
        } - {None, ""}
        if class_id not in classes:
            raise ValueError("班级不存在")
        if node_id not in {row.get("节点编号") for row in run.get("nodes", [])}:
            raise ValueError("测验节点不存在")

    def _latest_class_analysis(self, uow, run_id: str, node_id: str, class_id: str) -> dict | None:
        key = f"node:{node_id}|class:{class_id}"
        latest = uow.ai_analyses.latest(run_id, "task02", key)
        if latest and latest.get("status") == "complete":
            return latest
        return None

    # -- 查询 ---------------------------------------------------------------
    def list(self, class_id: str, node_id: str) -> dict:
        run, sources, mappings = self._snapshot()
        self._validate_class(run, class_id, node_id)
        report = self._report(run, node_id, sources, mappings)
        fingerprint = current_class_plan_fingerprint(run, class_id, node_id, report, sources)
        with self.uow_factory(immediate=False) as uow:
            plans = uow.class_teaching_plans.list(run["run_id"], class_id, node_id)
        return {
            "run_id": run["run_id"],
            "class_id": class_id,
            "node_id": node_id,
            "current_fingerprint": fingerprint,
            "latest_status": plans[-1]["status"] if plans else None,
            "plans": [
                {**plan, "stale": plan["source_fingerprint"] != fingerprint}
                for plan in plans
            ],
        }

    # -- 生成草稿 ------------------------------------------------------------
    def draft(self, class_id: str, node_id: str, reviewer: str = "") -> dict:
        run, sources, mappings = self._snapshot()
        self._validate_class(run, class_id, node_id)
        report = self._report(run, node_id, sources, mappings)
        record = build_rule_plan(run, class_id, node_id, report, sources)
        now = datetime.now(UTC).isoformat()

        with self.uow_factory() as uow:
            existing = uow.class_teaching_plans.latest(run["run_id"], class_id, node_id)
            analysis = self._latest_class_analysis(uow, run["run_id"], node_id, class_id)
            analysis_id = analysis["analysis_id"] if analysis else ""
            if (
                existing
                and existing["status"] != "rejected"
                and existing["source_fingerprint"] == record["source_fingerprint"]
            ):
                return {**existing, "stale": False, "reused": True, "analysis_id": existing.get("analysis_id") or analysis_id}
            plan = ClassTeachingPlan(
                plan_id="",
                scope=ClassPlanScope(run["run_id"], class_id, node_id),
                version=1,
                status="draft",
                generation_source="rule",
                source_fingerprint=record["source_fingerprint"],
                plan=ClassPlanBody.from_payload(record["plan"]),
                evidence_refs=tuple(record["evidence_refs"]),
                analysis_id=analysis_id,
                reviewer="",
                review_reason="",
                created_at=now,
                updated_at=now,
            ).to_dict()
            plan["version"] = uow.class_teaching_plans.next_version(
                run["run_id"], class_id, node_id
            )
            saved = uow.class_teaching_plans.create(plan)
        return {
            **saved,
            "stale": False,
            "reused": False,
            "reviewer_hint": reviewer,
        }

    # -- 教师审核 ------------------------------------------------------------
    def review(self, plan_id: str, payload: dict) -> dict:
        with self.uow_factory() as uow:
            existing = uow.class_teaching_plans.get(plan_id)
            if existing is None:
                raise ValueError("班级教学方案不存在")
            plan = ClassTeachingPlan(
                plan_id=existing["plan_id"],
                scope=ClassPlanScope(
                    existing["run_id"], existing["class_id"], existing["node_id"]
                ),
                version=int(existing["version"]),
                status=existing["status"],
                generation_source=existing["generation_source"],
                source_fingerprint=existing["source_fingerprint"],
                plan=ClassPlanBody.from_payload(existing.get("plan")),
                evidence_refs=tuple(existing.get("evidence_refs") or []),
                analysis_id=existing.get("analysis_id") or "",
                reviewer=existing.get("reviewer") or "",
                review_reason=existing.get("review_reason") or "",
                created_at=existing.get("created_at") or "",
                updated_at=existing.get("updated_at") or "",
            )
            body = (
                ClassPlanBody.from_payload(payload.get("plan"))
                if payload.get("plan") is not None
                else None
            )
            updated = plan.reviewed(
                payload["status"], payload["reviewer"], payload["reason"], body
            )
            record = updated.to_dict()
            # 审核产生的是一个新版本行：使用新的 plan_id，历史版本保持不可变。
            record["plan_id"] = ""
            record["version"] = uow.class_teaching_plans.next_version(
                existing["run_id"], existing["class_id"], existing["node_id"]
            )
            saved = uow.class_teaching_plans.create(record)
        return {**saved, "stale": False}
