"""Build traceable metrics and observation counts from validated responses."""

import re
from collections import defaultdict


def _metric(rows: list[dict], scope: dict) -> dict:
    score = sum(float(row["得分"]) for row in rows)
    maximum = sum(float(row["满分"]) for row in rows)
    return {
        **scope,
        "score": score,
        "maximum": maximum,
        "ratio": score / maximum if maximum else None,
        "count": len(rows),
        "record_ids": [row["记录编号"] for row in rows],
        "event_ids": [row["作答事件编号"] for row in rows],
    }


def build_metrics(eligible: list[dict], items: dict, students: dict) -> list[dict]:
    buckets = defaultdict(list)
    for row in eligible:
        item = items[row["材料编号"]]
        class_id = students[row["学生编号"]]["模拟班级编号"]
        scopes = (
            ("student", row["学生编号"]),
            ("class", class_id),
            ("topic", row["主题编号"]),
            ("indicator", item["指标编号"]),
            ("item", row["材料编号"]),
            ("node", row["节点编号"]),
            ("student_indicator", f"{row['学生编号']}:{item['指标编号']}"),
            ("class_indicator", f"{class_id}:{item['指标编号']}"),
            # Keep a dedicated TASK03 scope so recommendations never need to
            # infer a test moment from an aggregate across nodes.
            (
                "student_node_indicator",
                f"{row['学生编号']}:{row['节点编号']}:{item['指标编号']}",
            ),
        )
        for kind, key in scopes:
            buckets[(kind, key)].append(row)
    metrics = [
        _metric(rows, {"kind": kind, "key": key})
        for (kind, key), rows in sorted(buckets.items())
    ]
    # Add node-scoped counterparts while retaining the historical combined keys.
    # Consumers can migrate incrementally; each added metric names its dimensions.
    scoped = defaultdict(list)
    for row in eligible:
        item = items[row["材料编号"]]
        student_id = row["学生编号"]
        class_id = students[student_id]["模拟班级编号"]
        indicator_id = item["指标编号"]
        node_id = row["节点编号"]
        scoped[("student_indicator", student_id, indicator_id, node_id)].append(row)
        scoped[("class_indicator", class_id, indicator_id, node_id)].append(row)
    for (kind, owner_id, indicator_id, node_id), rows in sorted(scoped.items()):
        key = f"{owner_id}:{indicator_id}@{node_id}"
        metric = _metric(
            rows,
            {
                "kind": kind,
                "key": key,
                "node_id": node_id,
                "indicator_id": indicator_id,
                "student_id": owner_id if kind == "student_indicator" else None,
                "class_id": owner_id if kind == "class_indicator" else None,
            },
        )
        metrics.append(metric)
    return metrics


def build_observations(
    selected: list[dict],
    eligible: list[dict],
    students: dict,
    items: dict,
    objectives: list[dict],
    nodes: dict | None = None,
    findings: list[dict] | None = None,
    raw_records: list[dict] | None = None,
) -> list[dict]:
    eligible_ids = {row["记录编号"] for row in eligible}
    error_ids = {
        finding.get("record_id")
        for finding in (findings or [])
        if finding.get("severity") == "ERROR"
    }
    quarantine_codes = {
        "invalid_revision",
        "revision_conflict",
        "event_identity_conflict",
        "missing_event_id",
    }
    raw_records = raw_records or selected
    raw_by_key = {
        (row.get("记录编号"), row.get("_source_line")): row for row in raw_records
    }
    quarantined_keys = {
        (finding.get("record_id"), finding.get("source_line"))
        for finding in findings or []
        if finding.get("code") in quarantine_codes
    }
    quarantined_event_ids = {
        raw_by_key[key].get("作答事件编号")
        for key in quarantined_keys
        if key in raw_by_key and raw_by_key[key].get("作答事件编号")
    }
    quarantined_records = [
        row
        for row in raw_records
        if (row.get("记录编号"), row.get("_source_line")) in quarantined_keys
        or row.get("作答事件编号") in quarantined_event_ids
    ]
    observations = []
    for student_id, student in students.items():
        for objective in objectives:
            indicator_id = objective["指标编号"]
            item_ids = {
                item_id
                for item_id, item in items.items()
                if item["指标编号"] == indicator_id
            }
            scoped = [
                row
                for row in selected
                if row["学生编号"] == student_id and row["材料编号"] in item_ids
            ]
            observations.append(
                {
                    "student_id": student_id,
                    "class_id": student["模拟班级编号"],
                    "indicator_id": indicator_id,
                    "selected_count": len(scoped),
                    "scored_count": sum(
                        row["记录编号"] in eligible_ids for row in scoped
                    ),
                    "pending_count": sum(row["评分状态"] == "待评分" for row in scoped),
                    "unanswered_count": sum(
                        row["评分状态"] == "未作答" for row in scoped
                    ),
                    "excluded_count": sum(
                        row["记录编号"] not in eligible_ids for row in scoped
                    ),
                    "record_ids": [row["记录编号"] for row in scoped],
                    "node_id": None,
                    "state": "unknown",
                    "unknown_reason": "node_scope_required",
                }
            )
    # Node-scoped status makes absence explicit without inferring mastery or
    # claiming a topic was taught. A node with no available item is not measured.
    for student_id, student in students.items():
        for node_id, node in (nodes or {}).items():
            available = set(re.findall(r"[A-Z]+\d+", node.get("可用题目编号", "")))
            for objective in objectives:
                indicator_id = objective["指标编号"]
                measured_item_ids = {
                    item_id
                    for item_id, item in items.items()
                    if item["指标编号"] == indicator_id and item_id in available
                }
                scoped = [
                    row
                    for row in selected
                    if row["学生编号"] == student_id
                    and row["节点编号"] == node_id
                    and row["材料编号"] in measured_item_ids
                ]
                quarantined_scoped = [
                    row
                    for row in quarantined_records
                    if row["学生编号"] == student_id
                    and row["节点编号"] == node_id
                    and row["材料编号"] in measured_item_ids
                ]
                scored_count = sum(row["记录编号"] in eligible_ids for row in scoped)
                pending_count = sum(row["评分状态"] == "待评分" for row in scoped)
                unanswered_count = sum(row["评分状态"] == "未作答" for row in scoped)
                if not measured_item_ids:
                    state = "not_measured"
                elif not scoped and not quarantined_scoped:
                    state = "no_record"
                elif scored_count:
                    state = "scored"
                elif quarantined_scoped:
                    state = "excluded"
                elif any(row["记录编号"] in error_ids for row in scoped):
                    state = "excluded"
                elif pending_count:
                    state = "pending"
                elif unanswered_count:
                    state = "unanswered"
                else:
                    state = "excluded"
                observations.append(
                    {
                        "student_id": student_id,
                        "class_id": student["模拟班级编号"],
                        "indicator_id": indicator_id,
                        "node_id": node_id,
                        "state": state,
                        "unknown_reason": state
                        if state in {"not_measured", "no_record", "excluded"}
                        else None,
                        "available_item_count": len(measured_item_ids),
                        "selected_count": len(scoped),
                        "scored_count": scored_count,
                        "pending_count": pending_count,
                        "unanswered_count": unanswered_count,
                        "excluded_count": sum(
                            row["记录编号"] not in eligible_ids for row in scoped
                        )
                        + len(quarantined_scoped),
                        "quarantined_count": len(quarantined_scoped),
                        "quarantined_record_ids": [
                            row["记录编号"] for row in quarantined_scoped
                        ],
                        "record_ids": [row["记录编号"] for row in scoped],
                    }
                )
    return observations
