"""Machine-check and human-signoff gates for a competition submission."""

from __future__ import annotations

import hashlib
import json

from ..task02.evidence_reference_service import validate_evidence_references
from ...domain.assessment.evidence_bundle import AnalysisScope
from ..task02.evidence_bundle_service import build_evidence_bundle
from ..task03.teaching_plan_service import validate_teaching_plan


def _check(
    check_id: str, label: str, status: str, detail: str, *, category="machine"
) -> dict:
    return {
        "id": check_id,
        "label": label,
        "status": status,
        "category": category,
        "detail": detail,
    }


def check_release(
    run: dict,
    sources: dict,
    cases: dict[str, list[dict]],
    reviews: dict[str, list[dict]],
    report_data: dict,
    case_ids: list[str],
    *,
    node_id: str,
    content_reviewed: bool = False,
    reviewer: str = "",
    ai_mappings: dict[str, list[dict]] | None = None,
    teaching_adjustments: list[dict] | None = None,
) -> list[dict]:
    student_rows = run.get("students", [])
    student_ids = [str(row.get("学生编号") or "").strip() for row in student_rows]
    students = set(student_ids)
    valid_roster = (
        len(student_ids) == len(set(student_ids))
        and all(student_ids)
        and all(str(row.get("模拟班级编号") or "").strip() for row in student_rows)
    )
    valid_selection = (
        len(case_ids) == 3
        and len(set(case_ids)) == 3
        and set(case_ids).issubset(students)
        and valid_roster
    )
    checks = [
        _check(
            "case_selection",
            "三名不同的有效案例学生",
            "passed" if valid_selection else "blocked",
            "已选择当前运行中的三名不同学生。"
            if valid_selection
            else "名单存在缺失/重复学生编号或空班级编号，或未选择三名不同的当前运行学生；请修复名单后重新导入。"
            if not valid_roster
            else "必须选择三名不同且属于当前运行的学生。",
        )
    ]
    confirmed = {}
    invalid_refs = []
    invalid_case_selection = []
    stale_sources = []
    invalid_reviews = []
    for student_id in case_ids if valid_selection else []:
        history = cases.get(student_id, [])
        case = next(
            (
                row
                for row in reversed(history)
                if row.get("run_id") == run.get("run_id")
            ),
            None,
        )
        if not case or case.get("status") != "confirmed":
            continue
        confirmed[student_id] = case
        if not case.get("need_type") or not case.get("selection_reason", "").strip():
            invalid_case_selection.append(
                f"{student_id} 缺少正式案例需求类型或选择理由"
            )
        if not case.get("review_refs"):
            invalid_reviews.append(f"{student_id} 未关联教师复核版本")
        try:
            refs = validate_evidence_references(run, case.get("evidence_refs", []))
            if not refs:
                invalid_refs.append(f"{student_id} 没有有效证据引用")
        except ValueError as exc:
            refs = []
            invalid_refs.append(f"{student_id}：{exc}")
        for ref in case.get("review_refs", []):
            history = reviews.get(f"{student_id}:{ref.get('indicator_id', '')}", [])
            review = next(
                (
                    row
                    for row in history
                    if row.get("version") == ref.get("version")
                    and row.get("node_id") == ref.get("node_id")
                ),
                None,
            )
            if (
                not review
                or review.get("status") not in {"accepted", "edited"}
                or not review.get("reason", "").strip()
            ):
                invalid_reviews.append(
                    f"{student_id} · {ref.get('indicator_id')} · 版本 {ref.get('version')}"
                )
                continue
            plan = review.get("structured_plan") or review.get("teaching_plan_v2")
            if review.get("teaching_plan_v2"):
                v2 = review["teaching_plan_v2"]
                hints = v2.get("hints", [])
                complete_hints = bool(hints) and all(
                    hint.get("student_prompt", "").strip()
                    and hint.get("teacher_note", "").strip()
                    for hint in hints
                )
                plan_complete = (
                    bool(v2.get("goal", "").strip())
                    and bool(v2.get("steps"))
                    and complete_hints
                    and bool(v2.get("observation_points"))
                    and bool(v2.get("adjustment_conditions"))
                )
            else:
                structured = review.get("structured_plan") or {}
                plan_complete = bool(
                    structured.get("activity", "").strip()
                    and structured.get("steps")
                    and structured.get("practice")
                    and structured.get("observation_points")
                )
            if not plan or not plan_complete:
                invalid_reviews.append(
                    f"{student_id} · {ref.get('indicator_id')} 教学方案或分层提示未完成复核"
                )
                continue
            materials = (plan or {}).get("material_ids", [])
            if materials:
                indicator = ref.get("indicator_id", "")
                source_history = sources.get(indicator, [])
                latest = source_history[-1] if source_history else None
                if (
                    not latest
                    or latest.get("status") != "verified"
                    or latest.get("stale")
                    or review.get("source_verification_versions", {}).get(indicator)
                    != latest.get("version")
                    or not set(materials).issubset(latest.get("material_ids", []))
                ):
                    stale_sources.append(f"{student_id} · {indicator}")
    complete_cases = valid_selection and len(confirmed) == 3
    checks.append(
        _check(
            "confirmed_cases",
            "三份当前运行的教师确认案例",
            "passed" if complete_cases else "blocked",
            "三名学生均已确认案例。"
            if complete_cases
            else f"已确认 {len(confirmed)}/3；请完成未确认案例。",
        )
    )
    checks.append(
        _check(
            "case_selection_reason",
            "正式案例需求类型与选择理由",
            "passed" if complete_cases and not invalid_case_selection else "blocked",
            "三份正式案例均记录需求类型和独立选择理由。"
            if complete_cases and not invalid_case_selection
            else "；".join(invalid_case_selection)
            or "请先完成三份当前运行的正式案例确认。",
        )
    )
    checks.append(
        _check(
            "evidence_references",
            "案例证据引用有效且可追溯",
            "passed" if complete_cases and not invalid_refs else "blocked",
            "证据引用均可由当前运行重算。"
            if complete_cases and not invalid_refs
            else ("；".join(invalid_refs) or "案例尚未全部确认。"),
        )
    )
    checks.append(
        _check(
            "teacher_reviews",
            "正式复核版本和教学方案完整",
            "passed" if complete_cases and not invalid_reviews else "blocked",
            "引用的复核版本均为教师接受或修改状态。"
            if complete_cases and not invalid_reviews
            else (
                "缺少有效教师复核：" + "、".join(invalid_reviews)
                if invalid_reviews
                else "案例尚未全部确认。"
            ),
        )
    )
    checks.append(
        _check(
            "source_signoffs",
            "教学材料来源签核仍有效",
            "passed" if complete_cases and not stale_sources else "blocked",
            "所用材料的来源签核与复核版本一致。"
            if complete_cases and not stale_sources
            else (
                "来源缺失或过期：" + "、".join(stale_sources)
                if stale_sources
                else "案例尚未全部确认。"
            ),
        )
    )
    invalid_adjustments = []
    for adjustment in teaching_adjustments or []:
        if adjustment.get("student_id") not in case_ids or adjustment.get(
            "origin_run_id"
        ) != run.get("run_id"):
            continue
        snapshot = adjustment.get("teaching_plan_snapshot")
        if snapshot is None:
            continue
        student_id = adjustment.get("student_id", "")
        indicator_id = adjustment.get("indicator_id", "")
        node_id = adjustment.get("origin_node_id", "")
        history = reviews.get(f"{student_id}:{indicator_id}", [])
        review = next(
            (row for row in history if row.get("version") == adjustment.get("review_version")),
            None,
        )
        try:
            bundle = build_evidence_bundle(
                run,
                AnalysisScope(
                    run_id=run["run_id"],
                    student_id=student_id,
                    indicator_id=indicator_id,
                    node_id=node_id,
                ),
                sources,
            )
            errors = validate_teaching_plan(snapshot, bundle, sources)
        except (KeyError, TypeError, ValueError):
            errors = [{"detail": "方案范围或证据无法重算"}]
        if (
            not review
            or snapshot != review.get("teaching_plan_v2")
            or adjustment.get("plan_schema_version") != 2
            or adjustment.get("evidence_fingerprint") != snapshot.get("evidence_fingerprint")
            or not adjustment.get("planned_activity")
            or not adjustment.get("planned_practice")
            or not adjustment.get("observation_points")
            or errors
        ):
            invalid_adjustments.append(f"{student_id} · {indicator_id} · 版本 {adjustment.get('review_version')}")
    checks.append(
        _check(
            "teaching_adjustments",
            "V2 教学调整继承当前复核快照",
            "blocked" if invalid_adjustments else "passed",
            "已创建的 V2 教学调整均与复核方案、证据指纹和当前来源一致。"
            if not invalid_adjustments
            else "教学调整方案或证据已失效：" + "、".join(invalid_adjustments),
        )
    )
    case_report_data = report_data.get("cases", {})
    class_report_data = report_data.get("class", {})
    case_report_ready = (
        case_report_data.get("run_id") == run.get("run_id")
        and case_report_data.get("status") == "ready"
        and {row.get("student_id") for row in case_report_data.get("cases", [])}
        == set(case_ids)
    )
    checks.append(
        _check(
            "case_report",
            "三案例阅读报告完整",
            "passed" if case_report_ready else "blocked",
            "报告包含所选三名学生的当前教师确认版本。"
            if case_report_ready
            else "案例报告缺失、未完整确认或与所选学生不匹配。",
        )
    )
    class_ready = (
        class_report_data.get("run_id") == run.get("run_id")
        and class_report_data.get("node_id") == node_id
        and class_report_data.get("status") == "ready"
    )
    checks.append(
        _check(
            "class_report",
            "当前运行的班级阅读报告",
            "passed" if class_ready else "blocked",
            "班级报告与当前运行、节点匹配。"
            if class_ready
            else "请为当前运行生成完整且节点匹配的班级报告。",
        )
    )
    signoff = content_reviewed and bool(reviewer.strip())
    checks.append(
        _check(
            "human_content_review",
            "内容负责人重点风险复核并签名",
            "passed" if signoff else "not_checked",
            f"人工复核人：{reviewer.strip()}。"
            if signoff
            else "机器无法代替内容审阅；提交前需由内容负责人确认报告并填写姓名。",
            category="human",
        )
    )
    checks.append(
        _check(
            "independent_evaluation",
            "赛事独立数据与最终结论验收",
            "not_checked",
            "尚未绑定官方独立数据及人工验收结果。",
            category="human",
        )
    )
    return checks


def release_fingerprint(
    run: dict,
    sources: dict,
    cases: dict[str, list[dict]],
    reviews: dict[str, list[dict]],
    reports: dict,
    case_ids: list[str],
    node_id: str,
    checks: list[dict],
    reviewer: str,
    content_reviewed: bool,
    ai_mappings: dict[str, list[dict]] | None = None,
    teaching_adjustments: list[dict] | None = None,
) -> str:
    payload = {
        "run_id": run.get("run_id"),
        "run_files": run.get("files", {}),
        "case_ids": case_ids,
        "node_id": node_id,
        "cases": {student: cases.get(student, []) for student in case_ids},
        "reviews": {
            key: value
            for key, value in reviews.items()
            if key.partition(":")[0] in case_ids
        },
        "sources": sources,
        "ai_mappings": ai_mappings or {},
        "teaching_adjustments": [
            row for row in (teaching_adjustments or []) if row.get("student_id") in case_ids
        ],
        "reports": reports,
        "checks": checks,
        "reviewer": reviewer.strip(),
        "content_reviewed": content_reviewed,
    }
    encoded = json.dumps(
        payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()
