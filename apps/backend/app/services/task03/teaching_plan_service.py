"""Build and validate reviewable, source-bound teaching plan drafts."""

import json
from functools import lru_cache
from pathlib import Path

from ...domain.teaching.plan import (
    PlanEvidenceRef,
    PlanHint,
    PlanResourceReason,
    TeachingPlanScope,
    TeachingPlanV2,
)


@lru_cache(maxsize=1)
def _load_templates() -> dict:
    path = (
        Path(__file__).resolve().parents[2]
        / "content"
        / "teaching-plan-templates-v2.json"
    )
    return json.loads(path.read_text(encoding="utf-8"))


def build_teaching_plan(
    bundle: dict,
    insights: list[dict],
    selection: dict,
    objective: str = "",
    allowed_record_ids: set[str] | None = None,
    templates: dict | None = None,
) -> dict:
    """Create a concrete teacher draft only when evidence and verified sources exist."""
    if selection.get("status") != "ready":
        raise ValueError("没有范围内且来源已核验的候选材料，不能生成结构化方案")
    source_context = bundle.get("source_context", {})
    if source_context.get("status") != "verified" or source_context.get("stale"):
        raise ValueError("来源签核已失效，不能生成结构化方案")
    selected = selection.get("practice_items", []) + selection.get(
        "learning_resources", []
    )
    if not selection.get("practice_items"):
        raise ValueError("当前没有已核验的节点内练习题，不能生成结构化方案")
    material_ids = tuple(dict.fromkeys(row["material_id"] for row in selected))
    if not material_ids:
        raise ValueError("没有可使用的方案材料")
    evidence_refs = tuple(
        PlanEvidenceRef(
            evidence_id=row["evidence_id"],
            record_id=row["record_id"],
            material_id=row["material_id"],
            source_line=row["source_line"],
        )
        for row in bundle.get("responses", [])
        if row.get("disposition") == "scored"
        and (allowed_record_ids is None or row.get("record_id") in allowed_record_ids)
        and row.get("evidence_id")
        and row.get("record_id")
        and row.get("source_line")
    )
    if not evidence_refs:
        raise ValueError("当前范围没有有效评分证据，不能生成个体化教学方案")
    scope = bundle["scope"]
    purpose = selection["purpose"]
    template_catalog = templates or _load_templates()
    template = template_catalog["purposes"][purpose]
    issue = next(
        (
            claim.get("text", "")
            for claim in insights
            if claim.get("kind") in {"rule_observation", "hypothesis"}
            and claim.get("text")
        ),
        "",
    )
    materials_label = "、".join(material_ids)
    evidence_label = "、".join(ref.record_id for ref in evidence_refs)
    goal_subject = objective.strip() or scope["indicator_id"]
    goal = template["goal"].format(objective=goal_subject, materials=materials_label)
    if issue:
        goal += f"当前待核对线索：{issue}"
    plan = TeachingPlanV2(
        scope=TeachingPlanScope(**scope),
        goal=goal,
        purpose=purpose,
        material_ids=material_ids,
        resource_reasons=tuple(
            PlanResourceReason(
                material_id=row["material_id"],
                resource_type=row.get("resource_type", ""),
                reason_codes=tuple(row.get("reason_codes", [])),
                explanation=row.get("reason", "已核验且适用于当前范围"),
            )
            for row in selected
        ),
        steps=(
            template["steps"][0].format(evidence=evidence_label),
            template["step_two"].format(materials=materials_label),
            template["steps"][1],
        ),
        hints=tuple(
            PlanHint(level=level, **hint)
            for level, hint in zip(
                ("direction", "structure", "local_check"), template["hints"]
            )
        ),
        observation_points=tuple(template["observation_points"]),
        adjustment_conditions=tuple(template["adjustment_conditions"]),
        evidence_refs=evidence_refs,
        source_versions={
            key: int(value) for key, value in bundle["source_versions"].items()
        },
        evidence_fingerprint=bundle["fingerprint"],
        template_version=template_catalog["version"],
    )
    return plan.to_dict()


def validate_teaching_plan(
    payload: dict, bundle: dict, sources: dict[str, list[dict]]
) -> list[dict]:
    """Report all stale scope, evidence, and source-bound resource errors."""
    from ...domain.teaching.plan import TeachingPlanV2

    try:
        plan = TeachingPlanV2(
            scope=TeachingPlanScope(**payload.get("scope", {})),
            goal=payload.get("goal", ""),
            purpose=payload.get("purpose", ""),
            material_ids=tuple(payload.get("material_ids", [])),
            resource_reasons=tuple(
                PlanResourceReason(
                    material_id=row.get("material_id", ""),
                    resource_type=row.get("resource_type", ""),
                    reason_codes=tuple(row.get("reason_codes", [])),
                    explanation=row.get("explanation", ""),
                )
                for row in payload.get("resource_reasons", [])
            ),
            steps=tuple(payload.get("steps", [])),
            hints=tuple(PlanHint(**row) for row in payload.get("hints", [])),
            observation_points=tuple(payload.get("observation_points", [])),
            adjustment_conditions=tuple(payload.get("adjustment_conditions", [])),
            evidence_refs=tuple(
                PlanEvidenceRef(**row) for row in payload.get("evidence_refs", [])
            ),
            source_versions=payload.get("source_versions", {}),
            evidence_fingerprint=payload.get("evidence_fingerprint", ""),
            template_version=payload.get("template_version", ""),
            schema_version=payload.get("schema_version", 0),
            teacher_review_required=payload.get("teacher_review_required", False),
        )
    except (TypeError, KeyError, ValueError) as exc:
        return [{"code": "invalid_plan", "detail": str(exc)}]

    errors = []
    if plan.scope != TeachingPlanScope(**bundle.get("scope", {})):
        errors.append(
            {"code": "scope_changed", "detail": "方案学生、指标、节点或运行已变化。"}
        )
    if plan.evidence_fingerprint != bundle.get("fingerprint"):
        errors.append(
            {
                "code": "evidence_changed",
                "detail": "作答证据已变化，请重新生成方案草稿。",
            }
        )
    available_evidence = {
        (
            row.get("evidence_id"),
            row.get("record_id"),
            row.get("material_id"),
            row.get("source_line"),
        )
        for row in bundle.get("responses", [])
        if row.get("disposition") == "scored"
    }
    if any(
        (ref.evidence_id, ref.record_id, ref.material_id, ref.source_line)
        not in available_evidence
        for ref in plan.evidence_refs
    ):
        errors.append(
            {
                "code": "evidence_out_of_scope",
                "detail": "方案引用了当前范围之外或非有效评分的证据。",
            }
        )
    indicator_id = plan.scope.indicator_id
    history = sources.get(indicator_id, [])
    latest = history[-1] if history else None
    if (
        not latest
        or latest.get("status") != "verified"
        or latest.get("stale")
        or plan.source_versions != {indicator_id: latest.get("version")}
    ):
        errors.append(
            {
                "code": "source_version_changed",
                "detail": "来源签核已变化、撤销或过期，请重新生成方案。",
            }
        )
    else:
        signed_questions = set(latest.get("material_ids", []))
        links = {
            row.get("material_id"): row for row in latest.get("resource_links", [])
        }
        valid_questions = {row.get("material_id") for row in bundle.get("items", [])}
        for material_id in plan.material_ids:
            link = links.get(material_id)
            if material_id in valid_questions and material_id in signed_questions:
                continue
            if (
                link
                and link.get("status") == "verified"
                and indicator_id in link.get("indicator_ids", [])
                and plan.scope.node_id in link.get("allowed_node_ids", [])
            ):
                continue
            errors.append(
                {
                    "code": "material_not_verified",
                    "detail": f"材料 {material_id} 不在当前有效签核范围。",
                }
            )
    return errors


def student_safe_plan(payload: dict) -> dict:
    """Drop teacher-only hint notes from a future student-facing payload."""
    return {
        **payload,
        "hints": [
            {"level": row["level"], "student_prompt": row["student_prompt"]}
            for row in payload.get("hints", [])
        ],
    }
