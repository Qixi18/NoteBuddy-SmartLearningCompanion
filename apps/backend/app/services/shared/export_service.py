"""按分析运行和复核版本导出成果包。"""

from __future__ import annotations

import io
import csv
import json
import zipfile
from datetime import datetime, timezone

from ..task03.recommendation_service import draft
from ..task02.case_service import suggest_cases


def package(run: dict, reviews: dict, case_ids: list[str] | None = None) -> bytes:
    case_ids = case_ids or []
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
            entry = {**baseline, "review": final}
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
                accepted.append(entry)
            else:
                pending.append(entry)
    manifest = {
        "run_id": run["run_id"],
        "created_at": run["created_at"],
        "rule_version": run["rule_version"],
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "case_ids": case_ids,
        "files": run["files"],
        "source_files": run.get("source_files", {}),
        "reviewed_recommendations": len(accepted),
        "pending_recommendations": len(pending),
    }
    metric = run["metrics"]
    suggested = {c["student_id"]: c for c in suggest_cases(run)}
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
        "recommendations.json": accepted,
        "pending_review.json": pending,
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
            "`pending_review.json` 单列未接受的建议；`recommendations.json` 仅含已接受或修改项。\n"
            "来源文件哈希与规则版本见 `manifest.json`。\n",
        )
    return output.getvalue()
