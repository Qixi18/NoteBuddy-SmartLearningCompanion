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

AI_REFERENCE_STATUSES = {"complete", "partial"}


class ClassTeachingPlanUseCases:
    def __init__(self, uow_factory, stage2, source_service, ai_analysis=None):
        self.uow_factory = uow_factory
        self.stage2 = stage2
        self.source_service = source_service
        self.ai_analysis = ai_analysis

    # -- 内部 ---------------------------------------------------------------
    def _snapshot(self) -> tuple[dict, dict, dict]:
        with self.uow_factory(immediate=False) as uow:
            run = uow.runs.current()
            sources = uow.stage2.list_sources(run["run_id"])
            mappings = uow.stage2.list_ai_mappings(run["run_id"])
        return run, self.stage2.with_source_freshness(run, sources), mappings

    def _report(self, run: dict, node_id: str, sources: dict, mappings: dict) -> tuple[dict, dict]:
        # 延迟导入：workbench 在模块层导入本用例，避免循环依赖。
        from .workbench import _ai_mapping_summaries

        insights = build_class_insights(
            run,
            node_id,
            sources,
            _ai_mapping_summaries(run, mappings, self.source_service),
        )
        return build_class_report(run, node_id, insights), insights

    def _validate_class(self, run: dict, class_id: str, node_id: str) -> None:
        classes = {
            row.get("模拟班级编号") for row in run.get("students", [])
        } - {None, ""}
        if class_id not in classes:
            raise ValueError("班级不存在")
        if node_id not in {row.get("节点编号") for row in run.get("nodes", [])}:
            raise ValueError("测验节点不存在")

    def _class_analysis(self, node_id: str, class_id: str) -> dict | None:
        """只有当前指纹一致且状态为 complete/partial 的班级 AI 分析才能参与方案。"""
        if self.ai_analysis is None:
            return None
        preview = self.ai_analysis.preview("task02", node_id=node_id, class_id=class_id)
        analysis = preview.get("analysis")
        if not analysis or preview.get("stale"):
            return None
        if analysis.get("status") not in AI_REFERENCE_STATUSES:
            return None
        return {
            "analysis_id": analysis.get("analysis_id", ""),
            "fingerprint": preview.get("source_fingerprint", ""),
            "findings": analysis.get("findings") or [],
        }

    # -- 查询 ---------------------------------------------------------------
    def list(self, class_id: str, node_id: str) -> dict:
        run, sources, mappings = self._snapshot()
        self._validate_class(run, class_id, node_id)
        report, _ = self._report(run, node_id, sources, mappings)
        analysis = self._class_analysis(node_id, class_id)
        fingerprint = current_class_plan_fingerprint(
            run,
            class_id,
            node_id,
            report,
            sources,
            (analysis or {}).get("analysis_id", ""),
        )
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

    def current_fingerprint(self, class_id: str, node_id: str) -> str:
        run, sources, mappings = self._snapshot()
        self._validate_class(run, class_id, node_id)
        report, _ = self._report(run, node_id, sources, mappings)
        return current_class_plan_fingerprint(
            run,
            class_id,
            node_id,
            report,
            sources,
            self._current_analysis_id(node_id, class_id),
        )

    # -- 生成草稿 ------------------------------------------------------------
    def draft(self, class_id: str, node_id: str, reviewer: str = "") -> dict:
        run, sources, mappings = self._snapshot()
        self._validate_class(run, class_id, node_id)
        report, insights = self._report(run, node_id, sources, mappings)
        ai = self._class_analysis(node_id, class_id)
        record = build_rule_plan(
            run,
            class_id,
            node_id,
            report,
            sources,
            issues=insights.get("issues"),
            ai_findings=(ai or {}).get("findings"),
            ai_analysis_id=(ai or {}).get("analysis_id", ""),
            ai_fingerprint=(ai or {}).get("fingerprint", ""),
        )
        now = datetime.now(UTC).isoformat()

        with self.uow_factory() as uow:
            existing = uow.class_teaching_plans.latest(run["run_id"], class_id, node_id)
            if (
                existing
                and existing["status"] != "rejected"
                and existing["source_fingerprint"] == record["source_fingerprint"]
            ):
                return {**existing, "stale": False, "reused": True}
            plan = ClassTeachingPlan(
                plan_id="",
                scope=ClassPlanScope(run["run_id"], class_id, node_id),
                version=1,
                status="draft",
                generation_source=record["generation_source"],
                source_fingerprint=record["source_fingerprint"],
                plan=ClassPlanBody.from_payload(record["plan"]),
                evidence_refs=tuple(record["evidence_refs"]),
                analysis_id=record.get("analysis_id", ""),
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
        run, sources, mappings = self._snapshot()
        with self.uow_factory(immediate=False) as uow:
            existing = uow.class_teaching_plans.get(plan_id)
            if existing is None:
                raise ValueError("班级教学方案不存在")
            if existing["run_id"] != run["run_id"]:
                raise ValueError("当前运行已变化；请刷新页面后重新生成方案")
            if payload.get("run_id") and payload["run_id"] != run["run_id"]:
                raise ValueError("当前运行已变化；请刷新页面后重新生成方案")
            latest = uow.class_teaching_plans.latest(
                existing["run_id"], existing["class_id"], existing["node_id"]
            )
            if latest and latest["plan_id"] != existing["plan_id"]:
                raise ValueError("该方案已被更新的版本取代；只能审核当前最新版本")
        report, _ = self._report(run, existing["node_id"], sources, mappings)
        current = current_class_plan_fingerprint(
            run,
            existing["class_id"],
            existing["node_id"],
            report,
            sources,
            self._current_analysis_id(existing["node_id"], existing["class_id"]),
        )
        if existing["source_fingerprint"] != current:
            raise ValueError("方案已过期：来源核验或作答数据已变化，请重新生成后再审核")
        with self.uow_factory() as uow:
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

    def _current_analysis_id(self, node_id: str, class_id: str) -> str:
        return (self._class_analysis(node_id, class_id) or {}).get("analysis_id", "")
