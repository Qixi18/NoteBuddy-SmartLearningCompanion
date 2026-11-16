"""Build traceable metrics and observation counts from validated responses."""

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
        )
        for kind, key in scopes:
            buckets[(kind, key)].append(row)
    return [
        _metric(rows, {"kind": kind, "key": key})
        for (kind, key), rows in sorted(buckets.items())
    ]


def build_observations(
    selected: list[dict],
    eligible: list[dict],
    students: dict,
    items: dict,
    objectives: list[dict],
) -> list[dict]:
    eligible_ids = {row["记录编号"] for row in eligible}
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
                }
            )
    return observations
