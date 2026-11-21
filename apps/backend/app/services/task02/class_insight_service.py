"""Deduplicated class observations with explicit coverage and common-item bounds."""

import re


def _number(value) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _available_items(node: dict) -> set[str]:
    return {
        value.strip()
        for value in re.split(r"[，,、;；\s]+", str(node.get("可用题目编号", "")))
        if value.strip()
    }


def _scoped_score(rows: list[dict], item_ids: set[str] | None = None) -> dict:
    selected = [row for row in rows if item_ids is None or row["item_id"] in item_ids]
    score = sum(row["score"] for row in selected)
    maximum = sum(row["maximum"] for row in selected)
    return {
        "score": score,
        "maximum": maximum,
        "ratio": score / maximum if maximum else None,
        "record_count": len(selected),
        "observed_student_count": len({row["student_id"] for row in selected}),
    }


def build_class_insights(
    run: dict,
    node_id: str,
    source_verifications: dict[str, list[dict]],
    ai_mappings: dict[str, dict] | None = None,
) -> dict:
    node = next(
        (item for item in run.get("nodes", []) if item.get("节点编号") == node_id),
        None,
    )
    if node is None:
        raise ValueError("测验节点不存在")
    student_class = {
        row.get("学生编号"): row.get("模拟班级编号", "")
        for row in run.get("students", [])
    }
    classes = sorted(set(student_class.values()))
    allowed_items = _available_items(node)
    item_by_id = {
        row.get("材料编号"): row for row in run.get("items", []) if row.get("材料编号")
    }
    disposition_by_row = {
        (row.get("record_id"), row.get("source_line")): row.get(
            "disposition", "unknown"
        )
        for row in run.get("quality", {}).get("record_dispositions", [])
    }
    rubric_by_row = {
        (
            row.get("record_id"),
            row.get("student_id"),
            row.get("item_id"),
            row.get("node_id"),
        ): row
        for row in run.get("rubric_observations", [])
    }
    scored_rows = []
    for row in run.get("responses", []):
        item_id = row.get("材料编号")
        item = item_by_id.get(item_id)
        score, maximum = _number(row.get("得分")), _number(row.get("满分"))
        if (
            row.get("节点编号") != node_id
            or row.get("学生编号") not in student_class
            or item_id not in allowed_items
            or item is None
            or not item.get("指标编号")
            or disposition_by_row.get((row.get("记录编号"), row.get("_source_line")))
            != "scored"
            or score is None
            or maximum is None
            or maximum <= 0
            or score < 0
            or score > maximum
        ):
            continue
        observation = rubric_by_row.get(
            (
                row.get("记录编号"),
                row.get("学生编号"),
                item_id,
                node_id,
            ),
            {},
        )
        scored_rows.append(
            {
                "record_id": row.get("记录编号"),
                "source_line": row.get("_source_line"),
                "student_id": row["学生编号"],
                "class_id": student_class[row["学生编号"]],
                "indicator_id": item["指标编号"],
                "item_id": item_id,
                "score": score,
                "maximum": maximum,
                "rubric_observation": observation,
            }
        )

    indicators = sorted(
        {
            row.get("指标编号")
            for item_id, row in item_by_id.items()
            if row.get("指标编号") and item_id in allowed_items
        }
        | {row["indicator_id"] for row in scored_rows}
    )
    source_mapping_view = {
        indicator_id: (ai_mappings or {}).get(
            indicator_id,
            {
                "status": "not_generated",
                "usable_count": 0,
                "needs_resolution_count": 0,
                "mappings": [],
            },
        )
        for indicator_id in indicators
    }
    comparisons = []
    issues = []
    summaries = []
    for indicator_id in indicators:
        indicator_rows = [
            row for row in scored_rows if row["indicator_id"] == indicator_id
        ]
        per_class = {
            class_id: [row for row in indicator_rows if row["class_id"] == class_id]
            for class_id in classes
        }
        observed_items = {
            class_id: {row["item_id"] for row in rows}
            for class_id, rows in per_class.items()
        }
        common_items = (
            set.intersection(*(values for values in observed_items.values()))
            if observed_items and all(observed_items.values())
            else set()
        )
        comparison_classes = []
        for class_id, rows in per_class.items():
            all_score = _scoped_score(rows)
            common_score = _scoped_score(rows, common_items) if common_items else None
            comparison_classes.append(
                {
                    "class_id": class_id,
                    "scored_record_count": all_score["record_count"],
                    "observed_student_count": all_score["observed_student_count"],
                    "score": all_score["score"],
                    "maximum": all_score["maximum"],
                    "ratio": all_score["ratio"],
                    "common_score": common_score["score"] if common_score else None,
                    "common_maximum": common_score["maximum"] if common_score else None,
                    "common_ratio": common_score["ratio"] if common_score else None,
                    "common_record_count": common_score["record_count"]
                    if common_score
                    else 0,
                }
            )
        comparisons.append(
            {
                "indicator_id": indicator_id,
                "status": "available"
                if common_items
                else "unavailable_no_common_questions",
                "common_material_ids": sorted(common_items),
                "classes": comparison_classes,
            }
        )

        history = source_verifications.get(indicator_id, [])
        latest = history[-1] if history else {}
        if latest.get("status") != "verified" or latest.get("stale"):
            continue
        for mapping in latest.get("rubric_mappings", []):
            if mapping.get("status") != "verified":
                continue
            point_ids = set(mapping.get("rubric_point_ids", []))
            mapped_materials = set(mapping.get("material_ids", []))
            by_class = []
            for class_id in classes:
                observed_students = {row["student_id"] for row in per_class[class_id]}
                evidence_by_student: dict[str, list[dict]] = {}
                for row in per_class[class_id]:
                    if row["item_id"] not in mapped_materials:
                        continue
                    observation = row["rubric_observation"]
                    if observation.get("state") != "valid":
                        continue
                    lost = any(
                        point.get("point_id") in point_ids
                        and (earned := _number(point.get("earned"))) is not None
                        and (maximum := _number(point.get("maximum"))) is not None
                        and earned < maximum
                        for point in observation.get("points", [])
                    )
                    if lost:
                        evidence_by_student.setdefault(row["student_id"], []).append(
                            {
                                "record_id": row["record_id"],
                                "source_line": row["source_line"],
                                "material_id": row["item_id"],
                            }
                        )
                affected = sorted(
                    student_id
                    for student_id, evidence in evidence_by_student.items()
                    if len({row["material_id"] for row in evidence}) >= 2
                )
                by_class.append(
                    {
                        "class_id": class_id,
                        "affected_count": len(affected),
                        "affected_student_ids": affected,
                        "observed_student_count": len(observed_students),
                        "evidence_refs": [
                            evidence
                            for student_id in affected
                            for evidence in evidence_by_student[student_id]
                        ],
                    }
                )
            if not any(row["affected_count"] for row in by_class):
                continue
            issues.append(
                {
                    "indicator_id": indicator_id,
                    "issue_id": mapping.get("issue_id", ""),
                    "label": mapping.get("label")
                    or mapping.get("issue_id", "已核验问题"),
                    "by_class": by_class,
                    "limitations": [
                        "按学生去重；分母仅含本指标、该节点至少有一条有效已评分记录的学生。",
                        "这是已核验评分点的观察计数，不是能力等级或因果结论。",
                    ],
                }
            )

    for class_id in classes:
        class_students = sorted(
            student_id
            for student_id, assigned_class in student_class.items()
            if assigned_class == class_id
        )
        summaries.append(
            {
                "class_id": class_id,
                "student_count": len(class_students),
                "student_ids": class_students,
                "scored_record_count": sum(
                    row["class_id"] == class_id for row in scored_rows
                ),
            }
        )
    return {
        "run_id": run.get("run_id", ""),
        "node_id": node_id,
        "classes": summaries,
        "comparisons": comparisons,
        "issues": issues,
        "source_mappings": source_mapping_view,
        "limitations": [
            "不输出班级能力排名或显著性结论。",
            "全题集口径受各班实际作答覆盖影响；可比口径仅重算共同观察题目。",
            "共同题目集合为空时明确标记不可比较。",
        ],
    }
