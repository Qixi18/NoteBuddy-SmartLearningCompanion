"""Build presentation-ready reports from persisted, run-scoped evidence."""

from __future__ import annotations


def _confirmed_case(history: list[dict], run_id: str) -> dict | None:
    current = next(
        (item for item in reversed(history) if item.get("run_id") == run_id), None
    )
    return current if current and current.get("status") == "confirmed" else None


def build_case_report(
    run: dict,
    confirmed_case: dict | None,
    reviews: dict[str, list[dict]],
    sources: dict[str, list[dict]],
    teaching_adjustments: list[dict] | None = None,
) -> dict:
    """Return a teacher-readable case report without promoting candidates."""
    student_id = (confirmed_case or {}).get("student_id", "")
    if not student_id:
        raise ValueError("案例报告需要学生编号")
    student = next(
        (row for row in run.get("students", []) if row.get("学生编号") == student_id),
        None,
    )
    if student is None:
        raise ValueError("案例学生不属于当前运行")
    teacher_case = _confirmed_case(
        [confirmed_case] if confirmed_case else [], run.get("run_id", "")
    )
    if teacher_case is None:
        return {
            "run_id": run.get("run_id", ""),
            "student_id": student_id,
            "class_id": student.get("模拟班级编号", ""),
            "status": "incomplete",
            "message": "尚无当前运行的教师确认案例；候选不能作为正式案例呈现。",
            "evidence": [],
            "reviews": [],
            "adjustments": [],
        }

    evidence_refs = teacher_case.get("evidence_refs", [])
    record_refs = {
        (ref.get("record_id"), ref.get("source_line"))
        for ref in evidence_refs
        if ref.get("kind") == "response"
    }
    records = [
        row
        for row in run.get("raw_responses", run.get("responses", []))
        if row.get("学生编号") == student_id
        and (row.get("记录编号"), row.get("_source_line")) in record_refs
    ]
    items = {row.get("材料编号"): row for row in run.get("items", [])}
    evidence = []
    for ref in evidence_refs:
        if ref.get("kind") == "coverage":
            evidence.append(
                {
                    "kind": "coverage",
                    "node_id": ref.get("scope", {}).get("node_id", ""),
                    "description": "当前学生、指标和节点范围没有匹配的作答记录；不代表缺席、零分或未掌握。",
                }
            )
        else:
            row = next(
                (
                    item
                    for item in records
                    if item.get("记录编号") == ref.get("record_id")
                    and item.get("_source_line") == ref.get("source_line")
                ),
                None,
            )
            if row is None:
                continue
            material = items.get(row.get("材料编号"), {})
            evidence.append(
                {
                    "kind": "response",
                    "record_id": row.get("记录编号", ""),
                    "source_line": row.get("_source_line"),
                    "node_id": row.get("节点编号", ""),
                    "indicator_id": material.get("指标编号", ""),
                    "material_id": row.get("材料编号", ""),
                    "prompt": material.get("题干或内容", ""),
                    "answer": row.get("学生最终作答", ""),
                    "work": row.get("解答过程", ""),
                    "score": row.get("得分", ""),
                    "maximum": row.get("满分", ""),
                    "score_status": row.get("评分状态", ""),
                    "source_locator": f"{row.get('记录编号', '')} · CSV 第 {row.get('_source_line', '?')} 行",
                }
            )

    report_reviews = []
    for ref in teacher_case.get("review_refs", []):
        key = f"{student_id}:{ref.get('indicator_id', '')}"
        review = next(
            (
                row
                for row in reviews.get(key, [])
                if row.get("version") == ref.get("version")
                and row.get("node_id") == ref.get("node_id")
            ),
            None,
        )
        if review:
            indicator_id = ref.get("indicator_id", "")
            source_history = sources.get(indicator_id, [])
            source_version = review.get("source_verification_versions", {}).get(
                indicator_id
            )
            source = next(
                (
                    item
                    for item in source_history
                    if item.get("version") == source_version
                ),
                None,
            )
            current_source = source_history[-1] if source_history else None
            if source is None or current_source is None:
                source_validity = "unknown"
            elif current_source.get("stale") or current_source.get("version") != source_version:
                source_validity = "changed"
            elif current_source.get("status") != "verified":
                source_validity = "unverified"
            else:
                source_validity = "current"
            report_reviews.append(
                {
                    "indicator_id": indicator_id,
                    "node_id": ref.get("node_id", ""),
                    "version": review.get("version"),
                    "status": review.get("status", ""),
                    "diagnosis": review.get("diagnosis", ""),
                    "recommendation": review.get("recommendation", ""),
                    "reason": review.get("reason", ""),
                    "reviewer": review.get("reviewer", ""),
                    "structured_plan": review.get("structured_plan"),
                    "teaching_plan_v2": review.get("teaching_plan_v2"),
                    "source_verification_versions": review.get(
                        "source_verification_versions", {}
                    ),
                    "source_status": source.get("status", "unknown")
                    if source
                    else "unknown",
                    "source_validity": source_validity,
                    "current_source_status": current_source.get("status", "unknown")
                    if current_source
                    else "unknown",
                    "current_source_version": current_source.get("version")
                    if current_source
                    else None,
                }
            )
    adjustments = [
        {
            "planned_activity": row.get("planned_activity", ""),
            "planned_practice": row.get("planned_practice", []),
            "observation_points": row.get("observation_points", []),
            "implementation": row.get("implementation", ""),
            "implementation_status": row.get("implementation_status", "not_completed"),
            "outcome_observations": row.get("outcome_observations", ""),
            "teacher_conclusion": row.get("teacher_conclusion", ""),
            "comparability": row.get("comparability", "pending"),
            "followup_run_id": row.get("followup_run_id"),
            "followup_node_id": row.get("followup_node_id"),
            "followup_evidence_record_ids": row.get("followup_evidence_record_ids", []),
        }
        for row in (teaching_adjustments or [])
        if row.get("student_id") == student_id
        and row.get("origin_run_id") == run.get("run_id")
    ]
    return {
        "run_id": run.get("run_id", ""),
        "student_id": student_id,
        "class_id": student.get("模拟班级编号", ""),
        "status": "confirmed",
        "case_version": teacher_case.get("version"),
        "reviewer": teacher_case.get("reviewer", ""),
        "reviewed_at": teacher_case.get("reviewed_at", ""),
        "narrative": teacher_case.get("narrative", ""),
        "limitations": teacher_case.get("limitations", ""),
        "evidence": evidence,
        "reviews": report_reviews,
        "adjustments": adjustments,
        "scope": {
            "student_id": student_id,
            "class_id": student.get("模拟班级编号", ""),
            "run_id": run.get("run_id", ""),
        },
    }


def build_case_reports(
    run: dict,
    student_ids: list[str],
    cases: dict[str, list[dict]],
    reviews: dict[str, list[dict]],
    sources: dict[str, list[dict]],
    teaching_adjustments: list[dict] | None = None,
) -> dict:
    if len(student_ids) != 3 or len(set(student_ids)) != 3:
        raise ValueError("三案例报告需要选择三名不同学生")
    report = [
        build_case_report(
            run,
            _confirmed_case(cases.get(student_id, []), run.get("run_id", ""))
            or {"student_id": student_id},
            reviews,
            sources,
            teaching_adjustments,
        )
        for student_id in student_ids
    ]
    return {
        "run_id": run.get("run_id", ""),
        "status": "ready"
        if all(row["status"] == "confirmed" for row in report)
        else "incomplete",
        "cases": report,
        "comparison": [
            {
                "student_id": row["student_id"],
                "class_id": row["class_id"],
                "status": row["status"],
                "review_count": len(row.get("reviews", [])),
                "evidence_count": len(row.get("evidence", [])),
                "adjustment_count": len(row.get("adjustments", [])),
            }
            for row in report
        ],
        "limitations": [
            "案例由教师审核确认；三名入选学生不构成总体代表性证明。",
            "报告分数、材料和来源行取自当前运行存储快照。",
        ],
    }


def build_class_report(run: dict, node_id: str, insights: dict) -> dict:
    if (
        insights.get("run_id") != run.get("run_id")
        or insights.get("node_id") != node_id
    ):
        raise ValueError("班级报告数据与当前运行或节点不匹配")
    classes = insights.get("classes", [])
    comparisons = []
    for item in insights.get("comparisons", []):
        rows = item.get("classes", [])
        ratios = [
            row.get("common_ratio")
            for row in rows
            if row.get("common_ratio") is not None
        ]
        comparisons.append(
            {
                "indicator_id": item.get("indicator_id", ""),
                "status": item.get("status", "unavailable_no_common_questions"),
                "common_material_ids": item.get("common_material_ids", []),
                "classes": rows,
                "difference": max(ratios) - min(ratios) if len(ratios) >= 2 else None,
            }
        )
    issues = insights.get("issues", [])
    return {
        "run_id": run.get("run_id", ""),
        "node_id": node_id,
        "status": "ready" if classes else "incomplete",
        "classes": classes,
        "comparisons": comparisons,
        "common_observations": [
            issue
            for issue in issues
            if sum(
                row.get("affected_count", 0) > 0 for row in issue.get("by_class", [])
            )
            > 1
        ],
        "limitations": insights.get("limitations", []),
    }
