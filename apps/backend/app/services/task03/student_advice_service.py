"""Orchestrate scoped student evidence, resource choice, and V2 plan drafts."""

from __future__ import annotations

import re

from ...domain.assessment.evidence_bundle import AnalysisScope
from ..task02.evidence_bundle_service import build_evidence_bundle
from ..task02.insight_service import build_student_insights
from .resource_selection_service import select_resources
from .teaching_plan_service import build_teaching_plan


def purpose_for_rule(rule_id: str | None) -> str:
    """Map every diagnostic rule to a safe plan purpose or explicit blocker."""
    return {
        "TR-01": "blocked",
        "TR-02": "diagnostic",
        "TR-03": "requires_scoring",
        "TR-04": "diagnostic",
        "TR-05": "remediation",
        "TR-06": "remediation",
        "TR-07": "transfer",
        "TR-08": "blocked",
    }.get(rule_id, "blocked")


_BLOCKED_PLAN_MESSAGES = {
    "no_verified_node_practice": "当前节点没有已核验的练习题；只能展示学习材料，不能生成完整方案。",
    "no_unseen_practice_for_transfer": "当前节点内该指标的练习题都已被观察过，没有未观察题可用于迁移观察。",
    "no_verified_candidate": "当前范围内没有已核验的候选材料，不能生成方案。",
}


def _blocked_plan_reason(selection: dict, source_current: bool) -> str:
    """Name the concrete blocker instead of one generic failure sentence."""
    if not source_current:
        return "当前指标的来源签核尚未通过或已失效，不能生成方案。"
    for code in selection.get("reason_codes", []):
        if code in _BLOCKED_PLAN_MESSAGES:
            return _BLOCKED_PLAN_MESSAGES[code]
    return "当前范围内没有可生成完整方案的材料组合。"


def build_student_advice(
    run: dict, result: dict, sources: dict, ai_mappings: dict | None = None
) -> dict:
    """Attach resource choices and a validated V2 preview to one rule draft."""
    node_id = result.get("node_id")
    if not node_id or result.get("scope_required"):
        result.update(
            plan_status="requires_scope_selection",
            resource_selection={
                "status": "blocked",
                "purpose": "diagnostic",
                "practice_items": [],
                "learning_resources": [],
                "excluded": [],
                "reason_codes": ["node_scope_required"],
            },
            teaching_plan_preview=None,
            teaching_plan_preview_error="请选择单一测验节点后再生成方案。",
        )
        return result

    purpose = purpose_for_rule(result.get("rule_id"))
    if purpose in {"blocked", "requires_scoring"}:
        detail = (
            "当前诊断证据冲突，不能生成个体化教学方案。"
            if purpose == "blocked"
            else "当前存在待评分证据，请完成评分后再生成方案。"
        )
        result.update(
            plan_status=purpose,
            resource_selection={
                "status": "blocked",
                "purpose": "diagnostic",
                "practice_items": [],
                "learning_resources": [],
                "excluded": [],
                "reason_codes": [purpose],
            },
            teaching_plan_preview=None,
            teaching_plan_preview_error=detail,
        )
        return result

    scope = AnalysisScope(
        run_id=run["run_id"],
        student_id=result["student_id"],
        indicator_id=result["indicator_id"],
        node_id=node_id,
    )
    bundle = build_evidence_bundle(run, scope, sources)
    bundle.setdefault("source_context", {})["ai_mappings"] = ai_mappings or {}
    insights = build_student_insights(bundle)
    objective_row = next(
        (
            row
            for row in run.get("objectives", [])
            if row.get("指标编号") == result["indicator_id"]
        ),
        {},
    )
    objective = objective_row.get("观察指标", "")
    indicator_locator = "；".join(
        part
        for part in (
            (
                f"课标：{objective_row['课标定位']}"
                if objective_row.get("课标定位")
                else ""
            ),
            (
                f"教材：{objective_row['教材定位']}"
                if objective_row.get("教材定位")
                else ""
            ),
        )
        if part
    )
    node_items = {
        item_id
        for node in run.get("nodes", [])
        for item_id in re.findall(r"[A-Z]+\d+", str(node.get("可用题目编号", "")))
        if node.get("节点编号") == node_id
    }
    catalog = [
        {
            "material_id": item.get("材料编号", ""),
            "resource_type": (
                "题目"
                if item.get("满分") not in (None, "") or item.get("评分点")
                else item.get("材料类型") or item.get("题目类型") or "学习材料"
            ),
            "indicator_id": item.get("指标编号", ""),
            "topic_id": item.get("主题编号", ""),
            "title": item.get("题干或内容", ""),
            # 只传递导入数据中已经存在的来源与定位；缺失时保持为空，不补造页码。
            "source_file": item.get("来源", ""),
            "locator": indicator_locator,
            "node_ids": [
                node.get("节点编号")
                for node in run.get("nodes", [])
                if item.get("材料编号")
                in re.findall(r"[A-Z]+\d+", str(node.get("可用题目编号", "")))
            ],
            "available_node_ids": [
                node.get("节点编号")
                for node in run.get("nodes", [])
                if item.get("材料编号")
                in re.findall(r"[A-Z]+\d+", str(node.get("可用题目编号", "")))
            ],
        }
        for item in run.get("items", [])
        if item.get("材料编号")
    ]
    selection = select_resources(bundle, insights, catalog, purpose)
    selection["candidate_node_item_count"] = len(node_items)
    result["resource_selection"] = selection
    draft_context = {
        "rule_id": result.get("rule_id"),
        "evidence_kind": result.get("evidence_kind"),
        "observed_fact": result.get("observed_fact", ""),
        "inference_limit": result.get("inference_limit", ""),
        "score_points_to_review": list(result.get("score_points_to_review", [])),
        "diagnosis": result.get("diagnosis", ""),
    }
    source_context = bundle.get("source_context", {})
    source_current = (
        source_context.get("status") == "verified"
        and not source_context.get("stale")
    )
    if selection.get("status") != "ready":
        result["teaching_plan_preview"] = None
        result["teaching_plan_preview_error"] = _blocked_plan_reason(
            selection, source_current
        )
        result["plan_status"] = (
            "requires_source_verification" if not source_current else "blocked"
        )
        return result
    try:
        result["teaching_plan_preview"] = build_teaching_plan(
            bundle,
            insights,
            selection,
            objective,
            set(result.get("evidence_record_ids", [])),
            draft_context=draft_context,
        )
    except ValueError as exc:
        result["teaching_plan_preview"] = None
        result["teaching_plan_preview_error"] = str(exc)
        result["plan_status"] = (
            "requires_source_verification" if not source_current else "blocked"
        )
    else:
        result["teaching_plan_preview_error"] = None
        result["plan_status"] = "ready"
    return result
