"""按分析运行和复核版本导出成果包。"""

from __future__ import annotations

import csv
import hashlib
import html
import io
import json
import zipfile
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path

from ...domain.assessment.evidence_bundle import AnalysisScope
from ..task02.case_service import suggest_cases
from ..task02.evidence_bundle_service import build_evidence_bundle
from ..task02.evidence_reference_service import validate_evidence_references
from ..task03.recommendation_service import draft
from ..task03.teaching_plan_service import validate_teaching_plan


def validate_package_scope(files: dict, case_ids: set[str]) -> list[dict]:
    """Find current-run student or evidence identifiers outside the selected case scope."""
    raw_rows = files.get("raw_responses.json", [])
    scope_rows = files.get("_scope_raw_responses", raw_rows)
    record_owners = {
        row.get("记录编号"): row.get("学生编号")
        for row in scope_rows
        if row.get("记录编号") and row.get("学生编号")
    }
    event_owners: dict[str, set[str]] = {}
    for row in scope_rows:
        event_id, student_id = row.get("作答事件编号"), row.get("学生编号")
        if event_id and student_id:
            event_owners.setdefault(event_id, set()).add(student_id)

    violations = []
    record_fields = {
        "record_id",
        "record_ids",
        "evidence_record_ids",
        "origin_evidence_record_ids",
        "followup_evidence_record_ids",
        "excluded_record_ids",
        "quarantined_record_ids",
    }
    event_fields = {"event_id", "event_ids"}

    def values(value):
        return value if isinstance(value, list) else [value]

    def visit(member: str, value, path: str) -> None:
        if isinstance(value, dict):
            if (
                member
                in {
                    "class_summary.json",
                    "all_metrics.json",
                    "node_scoped_metrics.json",
                }
                and value.get("kind", "").startswith("class")
                and any(
                    field in value
                    for field in ("record_id", "record_ids", "event_id", "event_ids")
                )
            ):
                violations.append(
                    {
                        "code": "class_metric_contains_individual_references",
                        "member": member,
                        "path": path,
                    }
                )
            for key, item in value.items():
                child_path = f"{path}.{key}" if path else key
                if key == "student_id" and item is not None and item not in case_ids:
                    violations.append(
                        {
                            "code": "unselected_student",
                            "member": member,
                            "path": child_path,
                            "student_id": item,
                        }
                    )
                if (
                    member == "teacher_cases_history.json"
                    and not path
                    and key not in case_ids
                ):
                    violations.append(
                        {
                            "code": "unselected_student_history",
                            "member": member,
                            "path": child_path,
                            "student_id": key,
                        }
                    )
                if member == "teacher_review_history.json" and not path:
                    student_id = key.partition(":")[0]
                    if student_id not in case_ids:
                        violations.append(
                            {
                                "code": "unselected_student_history",
                                "member": member,
                                "path": child_path,
                                "student_id": student_id,
                            }
                        )
                if key in record_fields:
                    for record_id in values(item):
                        owner = record_owners.get(record_id)
                        if owner and owner not in case_ids:
                            violations.append(
                                {
                                    "code": "unselected_record_reference",
                                    "member": member,
                                    "path": child_path,
                                    "record_id": record_id,
                                }
                            )
                        elif (
                            record_id
                            and owner is None
                            and member != "teaching_adjustments.json"
                        ):
                            violations.append(
                                {
                                    "code": "unresolved_record_reference",
                                    "member": member,
                                    "path": child_path,
                                    "record_id": record_id,
                                }
                            )
                if key in event_fields:
                    for event_id in values(item):
                        owners = event_owners.get(event_id, set())
                        if owners - case_ids:
                            violations.append(
                                {
                                    "code": "unselected_event_reference",
                                    "member": member,
                                    "path": child_path,
                                    "event_id": event_id,
                                }
                            )
                        elif (
                            event_id
                            and not owners
                            and member != "teaching_adjustments.json"
                        ):
                            violations.append(
                                {
                                    "code": "unresolved_event_reference",
                                    "member": member,
                                    "path": child_path,
                                    "event_id": event_id,
                                }
                            )
                visit(member, item, child_path)
        elif isinstance(value, list):
            for index, item in enumerate(value):
                visit(member, item, f"{path}[{index}]")

    for member, value in files.items():
        if member.startswith("_"):
            continue
        visit(member, value, "")
    return violations


def package(
    run: dict,
    reviews: dict,
    case_ids: list[str] | None = None,
    *,
    sources: dict | None = None,
    cases: dict | None = None,
    teaching_adjustments: list[dict] | None = None,
    submission: dict | None = None,
) -> bytes:
    case_ids = case_ids or []
    sources = sources or {}
    cases = cases or {}
    teaching_adjustments = teaching_adjustments or []
    known_students = {s["学生编号"] for s in run["students"]}
    if (
        len(case_ids) != 3
        or len(set(case_ids)) != 3
        or not set(case_ids).issubset(known_students)
    ):
        raise ValueError("请选择三名不同的有效学生作为案例")
    accepted, pending = [], []
    for student in run["students"]:
        if student["学生编号"] not in case_ids:
            continue
        for objective in run["objectives"]:
            student_id, indicator_id = student["学生编号"], objective["指标编号"]
            baseline = draft(run, student_id, indicator_id)
            history = reviews.get(f"{student_id}:{indicator_id}", [])
            by_node: dict[str | None, list[dict]] = {}
            for item in history:
                node_id = item.get("node_id")
                if node_id is None and isinstance(item.get("original_draft"), dict):
                    node_id = item["original_draft"].get("node_id")
                by_node.setdefault(node_id, []).append(item)
            scoped_history = by_node or {None: []}
            for review_node_id, node_history in scoped_history.items():
                final = node_history[-1] if node_history else None
                scoped_baseline = (
                    draft(run, student_id, indicator_id, review_node_id)
                    if review_node_id
                    else baseline
                )
                entry = {
                    **scoped_baseline,
                    "node_id": review_node_id or scoped_baseline.get("node_id"),
                    "review": final,
                }
                # A snapshot's historical source hints are not an explicit stage-2 signoff.
                entry["material_ids"] = []
                if final and final["status"] in {"accepted", "edited"}:
                    entry.update(
                        {
                            k: final[k]
                            for k in (
                                "diagnosis",
                                "recommendation",
                                "adjustment_condition",
                                "source",
                                "evidence_record_ids",
                            )
                            if k in final
                        }
                    )
                    plan = final.get("structured_plan")
                    plan_v2 = final.get("teaching_plan_v2")
                    verification_history = sources.get(indicator_id, [])
                    latest_source = (
                        verification_history[-1] if verification_history else None
                    )
                    plan_v2_valid = False
                    if plan_v2:
                        try:
                            plan_bundle = build_evidence_bundle(
                                run,
                                AnalysisScope(
                                    run_id=run["run_id"],
                                    student_id=student_id,
                                    indicator_id=indicator_id,
                                    node_id=review_node_id,
                                ),
                                sources,
                            )
                            plan_v2_valid = not validate_teaching_plan(
                                plan_v2, plan_bundle, sources
                            )
                        except (KeyError, TypeError, ValueError):
                            plan_v2_valid = False
                        if plan_v2_valid:
                            entry["teaching_plan_v2"] = plan_v2
                        else:
                            entry["teaching_plan_v2_status"] = (
                                "evidence_or_source_changed"
                            )
                    if (
                        plan
                        and (not plan_v2 or plan_v2_valid)
                        and latest_source
                        and latest_source["status"] == "verified"
                        and not latest_source.get("stale", False)
                        and final.get("source_verification_versions", {}).get(
                            indicator_id
                        )
                        == latest_source["version"]
                        and set(plan.get("material_ids", [])).issubset(
                            latest_source["material_ids"]
                        )
                    ):
                        entry["structured_plan"] = plan
                        entry["material_ids"] = plan["material_ids"]
                    elif plan:
                        entry["structured_plan_status"] = "source_verification_changed"
                    accepted.append(entry)
                else:
                    pending.append(entry)
    manifest = {
        "package_type": "competition_submission"
        if submission
        else "selected_student_cases",
        "schema_version": "2.0" if submission else "1.0",
        "run_id": run["run_id"],
        "created_at": run["created_at"],
        "rule_version": run["rule_version"],
        "exported_at": datetime.now(UTC).isoformat(),
        "case_ids": case_ids,
        "files": run["files"],
        "source_files": run.get("source_files", {}),
        "reviewed_recommendations": len(accepted),
        "pending_recommendations": len(pending),
    }
    if submission:
        manifest.update(
            release_status=submission["release_status"],
            release_fingerprint=submission["fingerprint"],
            release_check_count=len(submission["checks"]),
            content_reviewer=submission["reviewer"],
            content_reviewed=submission["content_reviewed"],
        )
    metric = run["metrics"]
    suggested = {c["student_id"]: c for c in suggest_cases(run)}
    course_relations = [
        {
            "indicator_id": entry.get("indicator_id"),
            "topic_id": entry.get("topic_id"),
            "material_ids": [
                item.get("材料编号")
                for item in run.get("items", [])
                if item.get("指标编号") == entry.get("indicator_id")
            ],
            "curriculum_reference": entry.get("curriculum_reference"),
            "textbook_reference": entry.get("textbook_reference"),
            "verification": entry.get("verification", "pending"),
            "indicator_check": entry.get("indicator_check", {}),
            "integrity_issues": entry.get("integrity_issues", []),
        }
        for entry in run.get("source_index", [])
    ]
    verified_relations = [
        history[-1]
        for history in sources.values()
        if history
        and history[-1]["status"] == "verified"
        and not history[-1].get("stale", False)
    ]
    confirmed_cases = []
    for student_id, history in cases.items():
        if (
            student_id not in case_ids
            or not history
            or history[-1]["status"] != "confirmed"
        ):
            continue
        case = history[-1]
        valid = True
        try:
            evidence_refs = validate_evidence_references(
                run, case.get("evidence_refs", [])
            )
        except ValueError:
            continue
        coverage_refs = [
            reference for reference in evidence_refs if reference["kind"] == "coverage"
        ]
        if not case.get("evidence_record_ids") and not coverage_refs:
            continue
        if coverage_refs:
            if len(coverage_refs) != 1 or case.get("evidence_record_ids"):
                continue
            if len(coverage_refs) != len(evidence_refs):
                continue
        response_ref_ids = {
            reference["record_id"]
            for reference in evidence_refs
            if reference["kind"] == "response"
        }
        if response_ref_ids and response_ref_ids != set(
            case.get("evidence_record_ids", [])
        ):
            continue
        referenced_evidence = set()
        for ref in case["review_refs"]:
            review_history = reviews.get(f"{student_id}:{ref['indicator_id']}", [])
            match = next(
                (item for item in review_history if item["version"] == ref["version"]),
                None,
            )
            source_history = sources.get(ref["indicator_id"], [])
            latest_source = source_history[-1] if source_history else None
            if coverage_refs:
                expected_scope = {
                    "run_id": run["run_id"],
                    "student_id": student_id,
                    "indicator_id": ref["indicator_id"],
                    "node_id": ref["node_id"],
                }
                plan = match.get("structured_plan") if match else None
                if (
                    not match
                    or match["status"] not in {"accepted", "edited"}
                    or coverage_refs[0]["scope"] != expected_scope
                    or coverage_refs[0] not in match.get("evidence_refs", [])
                    or not plan
                    or plan.get("material_ids")
                    or not plan.get("activity")
                    or not plan.get("steps")
                    or not plan.get("practice")
                    or not plan.get("observation_points")
                    or not match.get("reason", "").strip()
                ):
                    valid = False
                    break
                continue
            v2_plan = match.get("teaching_plan_v2") if match else None
            v2_plan_valid = True
            if v2_plan:
                try:
                    plan_bundle = build_evidence_bundle(
                        run,
                        AnalysisScope(
                            run_id=run["run_id"],
                            student_id=student_id,
                            indicator_id=ref["indicator_id"],
                            node_id=ref["node_id"],
                        ),
                        sources,
                    )
                    v2_plan_valid = not validate_teaching_plan(
                        v2_plan, plan_bundle, sources
                    )
                except (KeyError, TypeError, ValueError):
                    v2_plan_valid = False
            if (
                not match
                or match["status"] not in {"accepted", "edited"}
                or not match.get("structured_plan")
                or not v2_plan_valid
                or not latest_source
                or latest_source["status"] != "verified"
                or latest_source.get("stale", False)
                or match.get("source_verification_versions", {}).get(
                    ref["indicator_id"]
                )
                != latest_source["version"]
            ):
                valid = False
                break
            referenced_evidence.update(match.get("evidence_record_ids", []))
        if not coverage_refs and (
            not set(case.get("evidence_record_ids", [])).issubset(
                {row["记录编号"] for row in run.get("raw_responses", [])}
            )
            or not set(case.get("evidence_record_ids", [])).issubset(
                referenced_evidence
            )
        ):
            valid = False
        if valid:
            confirmed_cases.append(case)
    selected_class_ids = {
        student.get("模拟班级编号")
        for student in run["students"]
        if student["学生编号"] in case_ids
    }
    scoped_metric = [
        entry
        for entry in metric
        if (
            entry.get("kind", "").startswith("student")
            and (
                entry.get("key") in case_ids
                or any(
                    entry.get("key", "").startswith(student_id + ":")
                    for student_id in case_ids
                )
            )
        )
        or (
            entry.get("kind", "").startswith("class")
            and (
                entry.get("key") in selected_class_ids
                or any(
                    entry.get("key", "").startswith(f"{class_id}:")
                    for class_id in selected_class_ids
                )
            )
        )
    ]
    scoped_metric = [
        {
            key: value
            for key, value in entry.items()
            if not (
                entry.get("kind", "").startswith("class")
                and key in {"record_id", "record_ids", "event_id", "event_ids"}
            )
        }
        for entry in scoped_metric
    ]
    scoped_observations = [
        entry for entry in run["observations"] if entry.get("student_id") in case_ids
    ]
    scoped_rubric_observations = [
        entry
        for entry in run.get("rubric_observations", [])
        if entry.get("student_id") in case_ids
    ]
    scoped_responses = [row for row in run["responses"] if row["学生编号"] in case_ids]
    scoped_raw_responses = [
        row for row in run["raw_responses"] if row["学生编号"] in case_ids
    ]
    scoped_record_ids = {row.get("记录编号") for row in scoped_raw_responses}
    scoped_dispositions = [
        row
        for row in run["quality"].get("record_dispositions", [])
        if row.get("record_id") in scoped_record_ids
    ]
    scoped_findings = [
        row
        for row in run["quality"].get("findings", [])
        if row.get("record_id") in scoped_record_ids
    ]
    scoped_quality = {
        **run["quality"],
        "raw_rows": len(scoped_raw_responses),
        "events": len({row.get("作答事件编号") for row in scoped_raw_responses}),
        "selected_revisions": sum(
            row.get("disposition") != "superseded" for row in scoped_dispositions
        ),
        "eligible_scored": sum(
            row.get("disposition") == "scored" for row in scoped_dispositions
        ),
        "excluded_record_ids": sorted(
            {
                row.get("record_id")
                for row in scoped_dispositions
                if row.get("disposition") == "excluded" and row.get("record_id")
            }
        ),
        "record_dispositions": scoped_dispositions,
        "disposition_counts": dict(
            Counter(row["disposition"] for row in scoped_dispositions)
        ),
        "raw_status_counts": dict(
            Counter(row.get("评分状态", "") for row in scoped_raw_responses)
        ),
        "event_disposition_counts": dict(
            Counter(
                row["disposition"]
                for row in scoped_dispositions
                if row.get("disposition") != "superseded"
            )
        ),
        "finding_counts": dict(Counter(row["code"] for row in scoped_findings)),
        "findings": scoped_findings,
    }
    node_scoped_metrics = [entry for entry in scoped_metric if entry.get("node_id")]
    node_observations = [entry for entry in scoped_observations if entry.get("node_id")]
    files = {
        "manifest.json": manifest,
        "learning_objectives.json": run["objectives"],
        "field_dictionary.json": run["field_dictionary"],
        "data_quality.json": scoped_quality,
        "class_summary.json": [
            m for m in scoped_metric if m["kind"] in {"class", "class_indicator"}
        ],
        "student_summary.json": [
            m for m in scoped_metric if m["kind"] in {"student", "student_indicator"}
        ],
        "student_cases.json": [
            {
                "student_id": student_id,
                "selection": suggested.get(
                    student_id,
                    {
                        "type": "人工选择",
                        "reason": "由操作者选择；请在正式案例说明中补充代表性依据。",
                    },
                ),
                "metrics": [
                    m
                    for m in metric
                    if m["kind"] in {"student", "student_indicator"}
                    and (
                        m["key"] == student_id or m["key"].startswith(student_id + ":")
                    )
                ],
                "responses": [
                    r for r in run["responses"] if r["学生编号"] == student_id
                ],
                "reviewed_recommendations": [
                    r for r in accepted if r["student_id"] == student_id
                ],
            }
            for student_id in case_ids
        ],
        "all_metrics.json": scoped_metric,
        "observations.json": scoped_observations,
        "rubric_observations.json": scoped_rubric_observations,
        "responses.json": scoped_responses,
        "raw_responses.json": scoped_raw_responses,
        "evidence_index.json": [
            {
                "record_id": r["记录编号"],
                "event_id": r["作答事件编号"],
                "student_id": r["学生编号"],
                "item_id": r["材料编号"],
                "source_file": "作答记录.csv",
                "source_line": r["_source_line"],
            }
            for r in scoped_raw_responses
        ],
        "items.json": run["items"],
        "source_index.json": run["source_index"],
        # Add structured mappings and node-scoped views without changing legacy members.
        "course_relations.json": course_relations,
        "source_verification_history.json": sources,
        "verified_source_relations.json": verified_relations,
        "teacher_cases_history.json": {
            student_id: cases.get(student_id, []) for student_id in case_ids
        },
        "teaching_adjustments.json": [
            adjustment
            for adjustment in teaching_adjustments
            if adjustment.get("student_id") in case_ids
        ],
        "confirmed_cases.json": confirmed_cases,
        "node_scoped_metrics.json": node_scoped_metrics,
        "node_observations.json": node_observations,
        "recommendations.json": accepted,
        "pending_review.json": pending,
        "teacher_review_history.json": {
            key: value
            for key, value in reviews.items()
            if key.partition(":")[0] in case_ids
        },
    }
    scope_violations = validate_package_scope(
        files | {"_scope_raw_responses": run.get("raw_responses", [])}, set(case_ids)
    )
    if scope_violations:
        raise ValueError(f"案例包超出所选范围：{scope_violations}")
    if submission:
        files.update(
            {
                "release_checks.json": submission["checks"],
                "case_reports.json": submission["reports"]["cases"],
                "class_report.json": submission["reports"]["class"],
                "submission.schema.json": json.loads(
                    (
                        Path(__file__).resolve().parents[2]
                        / "content"
                        / "submission.schema.json"
                    ).read_text(encoding="utf-8")
                ),
            }
        )
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, value in files.items():
            archive.writestr(name, json.dumps(value, ensure_ascii=False, indent=2))
        if submission:
            check_rows = "".join(
                f"<tr><td>{html.escape(str(check['label']))}</td><td>{html.escape(str(check['status']))}</td><td>{html.escape(str(check['detail']))}</td></tr>"
                for check in submission["checks"]
            )
            case_sections = "".join(
                "<section><h2>案例 "
                + html.escape(str(case.get("student_id", "")))
                + " · "
                + html.escape(str(case.get("status", "")))
                + "</h2><p>"
                + html.escape(str(case.get("narrative", case.get("message", ""))))
                + "</p><p><b>解释限制：</b>"
                + html.escape(str(case.get("limitations", "")))
                + "</p><ul>"
                + "".join(
                    f"<li>{html.escape(str(item.get('source_locator') or item.get('description') or item.get('record_id') or '证据'))} · {html.escape(str(item.get('score', '')))} / {html.escape(str(item.get('maximum', '')))}</li>"
                    for item in case.get("evidence", [])
                )
                + "</ul></section>"
                for case in submission["reports"]["cases"].get("cases", [])
            )
            class_report = submission["reports"]["class"]
            class_sections = (
                "<section><h2>班级范围与覆盖</h2><ul>"
                + "".join(
                    f"<li>{html.escape(str(item.get('class_id', '')))} · {int(item.get('student_count', 0))} 名学生 · {int(item.get('scored_record_count', 0))} 条有效评分</li>"
                    for item in class_report.get("classes", [])
                )
                + "</ul><h2>共同题目比较</h2><ul>"
                + "".join(
                    f"<li>{html.escape(str(item.get('indicator_id', '')))} · 共同材料 {html.escape('、'.join(item.get('common_material_ids', [])))} · 差异 {html.escape(str(item.get('difference', '不可计算')))}</li>"
                    for item in class_report.get("comparisons", [])
                )
                + "</ul></section>"
            )
            archive.writestr(
                "submission-report.html",
                '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>智慧学伴发布核验</title>'
                "<style>body{font:16px/1.65 system-ui,sans-serif;max-width:1000px;margin:40px auto;padding:0 24px;color:#172b43}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccd5e0;padding:10px;text-align:left}th{background:#eef3fa}</style>"
                f"<h1>智慧学伴竞赛发布核验</h1><p>运行：{html.escape(str(run['run_id']))} · 案例：{html.escape('、'.join(case_ids))}</p>"
                f"<p>报告状态：{html.escape(submission['release_status'])} · 内容审阅人：{html.escape(submission['reviewer'])}</p>"
                f"<table><thead><tr><th>检查项</th><th>状态</th><th>依据</th></tr></thead><tbody>{check_rows}</tbody></table>{case_sections}{class_sections}</html>",
            )
        metric_csv = io.StringIO(newline="")
        writer = csv.DictWriter(
            metric_csv,
            fieldnames=[
                "kind",
                "key",
                "score",
                "maximum",
                "ratio",
                "count",
                "record_ids",
            ],
            extrasaction="ignore",
        )
        writer.writeheader()
        for row in scoped_metric:
            writer.writerow({**row, "record_ids": "|".join(row.get("record_ids", []))})
        archive.writestr("metrics.csv", "\ufeff" + metric_csv.getvalue())
        relations_csv = io.StringIO(newline="")
        relation_fields = [
            "indicator_id",
            "topic_id",
            "material_ids",
            "curriculum_reference",
            "textbook_reference",
            "verification",
            "integrity_issues",
        ]
        relation_writer = csv.DictWriter(
            relations_csv, fieldnames=relation_fields, extrasaction="ignore"
        )
        relation_writer.writeheader()
        for relation in course_relations:
            relation_writer.writerow(
                {
                    **relation,
                    "material_ids": "|".join(relation["material_ids"]),
                    "integrity_issues": "|".join(relation["integrity_issues"]),
                }
            )
        archive.writestr("course_relations.csv", "\ufeff" + relations_csv.getvalue())
        objective_csv = io.StringIO(newline="")
        objective_fields = (
            [key for key in run["objectives"][0] if not key.startswith("_")]
            if run["objectives"]
            else []
        )
        if objective_fields:
            writer = csv.DictWriter(
                objective_csv, fieldnames=objective_fields, extrasaction="ignore"
            )
            writer.writeheader()
            writer.writerows(run["objectives"])
        archive.writestr("learning_objectives.csv", "\ufeff" + objective_csv.getvalue())
        archive.writestr(
            "字段与口径说明.md",
            "# 字段与统计口径\n\n"
            "本包为三名所选学生的案例包；学生级统计、观测、作答、复核、案例历史、教学调整和证据索引仅含所选学生。班级统计是所选学生所属班级的整班聚合，可能包含其他同学的聚合贡献，但不导出其个人记录或事件编号。\n"
            "`manifest.json` 的 `case_ids` 记录所选学生；不包含完整运行审计数据。\n"
            "`run_id` 由导入文件哈希生成；`record_ids` 为实际进入得分统计的修订记录。\n"
            "`score/maximum` 是有效已评分记录的得分率；待评分、未作答及异常记录不进入分母。\n"
            "`class_summary.json` 和 `student_summary.json` 保留跨节点旧汇总；节点分层数据见 `node_scoped_metrics.json` 与 `node_observations.json`。\n"
            "`data_quality.json` 中逐行 disposition 覆盖原始作答行；`pending`、`unanswered`、`superseded` 与 `excluded` 不作为有效计分。\n"
            "`course_relations.json/csv` 从当前快照生成；`pending`/`invalid` 表示关系尚未签核，不得当作已核验教学资源。\n"
            "`verified_source_relations.json` 仅含最新人工签核为 verified 的指标；`source_verification_history.json` 保留版本。\n"
            "`confirmed_cases.json` 仅含最新教师确认为 confirmed 的案例；候选仍见 `student_cases.json`。\n"
            "结构化方案与来源核验版本不一致时不输出已确认材料；旧建议字段保持兼容。\n"
            "覆盖状态表示可观察到的记录/评分覆盖；没有逐生任务分配表时，不代表应测完成率。\n"
            "`pending_review.json` 单列未接受的建议；`recommendations.json` 仅含已接受或修改项。\n"
            "来源文件哈希与规则版本见 `manifest.json`。\n",
        )
    result = output.getvalue()
    if not submission:
        return result
    with zipfile.ZipFile(io.BytesIO(result)) as existing:
        members = {name: existing.read(name) for name in existing.namelist()}
    formal_manifest = json.loads(members["manifest.json"])
    formal_manifest["checksum_file"] = "checksums.json"
    formal_manifest["hash_algorithm"] = "sha256"
    members["manifest.json"] = json.dumps(
        formal_manifest, ensure_ascii=False, indent=2
    ).encode("utf-8")
    checksums = {
        name: hashlib.sha256(payload).hexdigest() for name, payload in members.items()
    }
    members["checksums.json"] = json.dumps(
        checksums, ensure_ascii=False, indent=2, sort_keys=True
    ).encode("utf-8")
    verified_output = io.BytesIO()
    with zipfile.ZipFile(verified_output, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, payload in members.items():
            archive.writestr(name, payload)
    return verified_output.getvalue()
