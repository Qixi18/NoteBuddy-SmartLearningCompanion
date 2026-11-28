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
from ..task02.evidence_reference_service import coverage_reference


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
    draft_context: dict | None = None,
) -> dict:
    """Create a concrete teacher draft only when evidence and verified sources exist.

    ``draft_context`` carries the diagnosis that produced this draft
    (rule_id / evidence_kind / observed_fact / inference_limit /
    score_points_to_review / diagnosis). It lets one template produce
    materially different plans for different students instead of only swapping
    the goal sentence.
    """
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
    purpose = selection["purpose"]
    context = draft_context or {}
    score_points = [
        str(point).strip()
        for point in context.get("score_points_to_review", [])
        if str(point).strip()
    ]
    observed_fact = str(context.get("observed_fact") or "").strip()
    diagnosis = str(context.get("diagnosis") or "").strip()
    evidence_refs = tuple(
        PlanEvidenceRef(
            kind="response",
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
    if not evidence_refs and purpose == "diagnostic":
        coverage = coverage_reference(bundle)
        evidence_refs = (
            PlanEvidenceRef(
                kind="coverage",
                evidence_id=coverage["evidence_id"],
            ),
        )
    if not evidence_refs:
        raise ValueError("当前范围没有有效评分或覆盖证据，不能生成个体化教学方案")
    scope = bundle["scope"]
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
    practice_label = "、".join(
        row["material_id"] for row in selection.get("practice_items", [])
    )
    resource_label = "、".join(
        row["material_id"] for row in selection.get("learning_resources", [])
    )
    materials_label = resource_label or practice_label
    evidence_label = (
        "、".join(ref.record_id for ref in evidence_refs)
        or "当前节点无有效作答记录，依据覆盖情况安排补充观察"
    )
    points_label = "、".join(score_points[:4])
    goal_subject = objective.strip() or scope["indicator_id"]
    goal = template["goal"].format(
        objective=goal_subject, materials=materials_label
    )
    if observed_fact:
        goal += f"当前可核验事实：{observed_fact}"
    elif issue:
        goal += f"当前待核对线索：{issue}"
    steps = _compose_steps(
        purpose,
        evidence_label=evidence_label,
        materials_label=materials_label,
        practice_label=practice_label,
        score_points_label=points_label,
        observed_fact=observed_fact,
        diagnosis=diagnosis,
    )
    hints = _compose_hints(
        template,
        purpose=purpose,
        score_points_label=points_label,
        observed_fact=observed_fact,
    )
    observation_points = _compose_observation_points(
        template,
        purpose=purpose,
        score_points_label=points_label,
        observed_fact=observed_fact,
    )
    adjustment_conditions = _compose_adjustment_conditions(
        template,
        purpose=purpose,
        score_points_label=points_label,
    )
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
        steps=steps,
        hints=hints,
        observation_points=observation_points,
        adjustment_conditions=adjustment_conditions,
        evidence_refs=evidence_refs,
        source_versions={
            key: int(value) for key, value in bundle["source_versions"].items()
        },
        evidence_fingerprint=bundle["fingerprint"],
        template_version=template_catalog["version"],
    )
    return plan.to_dict()


def _compose_steps(
    purpose: str,
    *,
    evidence_label: str,
    materials_label: str,
    practice_label: str,
    score_points_label: str,
    observed_fact: str,
    diagnosis: str,
) -> tuple[str, ...]:
    """Organize steps as review → targeted learning → independent practice → next move."""
    practice_text = practice_label or "节点内练习"
    if purpose == "remediation":
        focus = f"重点关注评分点 {score_points_label} 对应步骤。" if score_points_label else ""
        return (
            f"回看有效评分记录 {evidence_label}，确认本次要巩固的具体步骤。{focus}",
            f"使用材料 {materials_label} 针对性回看该步骤，让学生复述方法与判断依据。",
            f"学生独立完成节点内练习 {practice_text}，逐题记录是否独立完成及卡点位置。",
            "依据观察点核对过程与结果：稳定则换用新题观察迁移，仍不稳定则回到材料片段继续练习。",
        )
    if purpose == "transfer":
        return (
            f"回看有效评分记录 {evidence_label}，说明本次不是重复练习，而是观察学生能否迁移。",
            f"使用材料 {materials_label} 比较新旧任务条件，标出可以保留与需要调整的步骤。",
            f"学生独立完成当前节点内未观察练习 {practice_text}，说明方法如何迁移到新条件。",
            "依据观察点核对学生的条件说明与步骤调整，再决定下一次观察或补充证据。",
        )
    observation = observed_fact or diagnosis
    return (
        f"核对当前范围证据 {evidence_label}，明确本次只做补充观察，暂不下掌握结论。",
        f"使用材料 {materials_label} 说明观察任务、记录方式与完成标准。",
        f"学生完成任务 {practice_text}，教师逐项记录可观察表现"
        + (f"（当前线索：{observation}）" if observation else "")
        + "；依据观察点区分已观察事实与仍不确定的部分，决定补充证据或转入正式方案。",
    )


def _compose_hints(
    template: dict,
    *,
    purpose: str,
    score_points_label: str,
    observed_fact: str,
) -> tuple[PlanHint, ...]:
    """Keep the three-level hint structure and tie teacher notes to this draft."""
    context_suffix = ""
    if purpose == "remediation" and score_points_label:
        context_suffix = f"本次重点观察评分点 {score_points_label} 对应步骤的表现。"
    elif purpose == "transfer":
        context_suffix = "本次重点是条件变化后的方法调整，不以答案相同与否判断迁移。"
    elif purpose == "diagnostic":
        context_suffix = "本次只记录可观察表现；证据不足时保留未知，不补推测结论。"
    elif observed_fact:
        context_suffix = f"结合当前可核验事实观察：{observed_fact}"
    hints = []
    for level, hint in zip(
        ("direction", "structure", "local_check"), template["hints"]
    ):
        teacher_note = str(hint.get("teacher_note", ""))
        if level == "local_check" and context_suffix:
            teacher_note = f"{teacher_note}{context_suffix}"
        hints.append(
            PlanHint(
                level=level,
                student_prompt=str(hint.get("student_prompt", "")),
                teacher_note=teacher_note,
            )
        )
    return tuple(hints)


def _compose_observation_points(
    template: dict,
    *,
    purpose: str,
    score_points_label: str,
    observed_fact: str,
) -> tuple[str, ...]:
    points = [str(point) for point in template["observation_points"]]
    if purpose == "remediation" and score_points_label:
        points.append(
            f"记录学生在评分点 {score_points_label} 对应步骤上是否独立完成并说明依据。"
        )
    elif purpose == "transfer":
        points.append("记录学生说明条件差异与方法调整的依据，不以答案对错替代迁移判断。")
    elif purpose == "diagnostic":
        points.append("记录哪些表现属于已观察事实，哪些仍缺少证据。")
    elif observed_fact:
        points.append(f"记录与当前事实相关的表现：{observed_fact}")
    return tuple(dict.fromkeys(point for point in points if point.strip()))


def _compose_adjustment_conditions(
    template: dict, *, purpose: str, score_points_label: str
) -> tuple[str, ...]:
    conditions = [str(condition) for condition in template["adjustment_conditions"]]
    if purpose == "remediation":
        conditions.append(
            (
                f"若评分点 {score_points_label} 相关步骤连续两次独立完成，改用新题观察迁移；"
                if score_points_label
                else "若相关步骤连续两次独立完成，改用新题观察迁移；"
            )
            + "若仍失分，回到材料对应片段再次讲解并复查。"
        )
    elif purpose == "transfer":
        conditions.append(
            "若学生能说明条件变化对方法的影响，改用不同表征复查；"
            "若沿用方法但未核对条件，先做条件比较再换题。"
        )
    elif purpose == "diagnostic":
        conditions.append(
            "若补充证据与当前判断一致，可形成正式方案；"
            "若仍冲突，继续核对原始记录与评分依据。"
        )
    return tuple(dict.fromkeys(condition for condition in conditions if condition.strip()))


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
    coverage = coverage_reference(bundle)
    invalid_refs = []
    for ref in plan.evidence_refs:
        if ref.kind == "coverage":
            if (
                bundle.get("coverage", {}).get("scored_record_count", 0) > 0
                or ref.evidence_id != coverage.get("evidence_id")
                or ref.record_id
                or ref.material_id
            ):
                invalid_refs.append(ref)
        elif (
            ref.evidence_id,
            ref.record_id,
            ref.material_id,
            ref.source_line,
        ) not in available_evidence:
            invalid_refs.append(ref)
    if invalid_refs:
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
