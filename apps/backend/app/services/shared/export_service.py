"""按分析运行和复核版本导出成果包。"""

from __future__ import annotations

import csv
import io
import json
import zipfile
from datetime import UTC, datetime

from ..task02.case_service import suggest_cases
from ..task03.recommendation_service import draft


def package(
    run: dict,
    reviews: dict,
    case_ids: list[str] | None = None,
    *,
    sources: dict | None = None,
    cases: dict | None = None,
) -> bytes:
    case_ids = case_ids or []
    sources = sources or {}
    cases = cases or {}
    known_students = {s["学生编号"] for s in run["students"]}
    if (
        len(case_ids) != 3
        or len(set(case_ids)) != 3
        or not set(case_ids).issubset(known_students)
    ):
        raise ValueError("请选择三名不同的有效学生作为案例")
    accepted, pending = [], []
    for student in run["students"]:
        for objective in run["objectives"]:
            student_id, indicator_id = student["学生编号"], objective["指标编号"]
            baseline = draft(run, student_id, indicator_id)
            history = reviews.get(f"{student_id}:{indicator_id}", [])
            final = history[-1] if history else None
            review_node_id = final.get("node_id") if final else None
            if final and review_node_id is None:
                original = final.get("original_draft")
                if isinstance(original, dict):
                    review_node_id = original.get("node_id")
            entry = {
                **baseline,
                "node_id": review_node_id or baseline.get("node_id"),
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
                verification_history = sources.get(indicator_id, [])
                latest_source = (
                    verification_history[-1] if verification_history else None
                )
                if (
                    plan
                    and latest_source
                    and latest_source["status"] == "verified"
                    and final.get("source_verification_versions", {}).get(indicator_id)
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
        if history and history[-1]["status"] == "verified"
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
        referenced_evidence = set()
        for ref in case["review_refs"]:
            review_history = reviews.get(f"{student_id}:{ref['indicator_id']}", [])
            match = next(
                (item for item in review_history if item["version"] == ref["version"]),
                None,
            )
            source_history = sources.get(ref["indicator_id"], [])
            latest_source = source_history[-1] if source_history else None
            if (
                not match
                or match["status"] not in {"accepted", "edited"}
                or not match.get("structured_plan")
                or not latest_source
                or latest_source["status"] != "verified"
                or match.get("source_verification_versions", {}).get(
                    ref["indicator_id"]
                )
                != latest_source["version"]
            ):
                valid = False
                break
            referenced_evidence.update(match.get("evidence_record_ids", []))
        if not set(case.get("evidence_record_ids", [])).issubset(
            {row["记录编号"] for row in run.get("raw_responses", [])}
        ) or not set(case.get("evidence_record_ids", [])).issubset(referenced_evidence):
            valid = False
        if valid:
            confirmed_cases.append(case)
    node_scoped_metrics = [entry for entry in metric if entry.get("node_id")]
    node_observations = [
        entry for entry in run.get("observations", []) if entry.get("node_id")
    ]
    files = {
        "manifest.json": manifest,
        "learning_objectives.json": run["objectives"],
        "field_dictionary.json": run["field_dictionary"],
        "data_quality.json": run["quality"],
        "class_summary.json": [
            m for m in metric if m["kind"] in {"class", "class_indicator"}
        ],
        "student_summary.json": [
            m for m in metric if m["kind"] in {"student", "student_indicator"}
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
        "all_metrics.json": metric,
        "observations.json": run["observations"],
        "rubric_observations.json": run.get("rubric_observations", []),
        "responses.json": run["responses"],
        "raw_responses.json": run["raw_responses"],
        "evidence_index.json": [
            {
                "record_id": r["记录编号"],
                "event_id": r["作答事件编号"],
                "student_id": r["学生编号"],
                "item_id": r["材料编号"],
                "source_file": "作答记录.csv",
                "source_line": r["_source_line"],
            }
            for r in run["raw_responses"]
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
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, value in files.items():
            archive.writestr(name, json.dumps(value, ensure_ascii=False, indent=2))
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
        for row in metric:
            writer.writerow({**row, "record_ids": "|".join(row["record_ids"])})
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
    return output.getvalue()
