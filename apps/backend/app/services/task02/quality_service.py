"""Apply deterministic reference, status and score-quality rules."""

import re
from collections import Counter


def _number(value: str) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _tokens(value: str) -> set[str]:
    return set(re.findall(r"[A-Z]+\d+", value or ""))


def validate_records(
    selected: list[dict],
    records: list[dict],
    students: dict,
    items: dict,
    nodes: dict,
    indicator_ids: set[str],
    findings: list[dict],
    excluded: list[str],
) -> list[dict]:
    def issue(code: str, row: dict, detail: str) -> None:
        findings.append(
            {
                "code": code,
                "record_id": row.get("记录编号"),
                "source_line": row.get("_source_line"),
                "detail": detail,
            }
        )

    record_id_counts = Counter(row["记录编号"] for row in records)
    eligible = []
    for row in selected:
        record_id = row["记录编号"]
        student = students.get(row["学生编号"])
        item = items.get(row["材料编号"])
        node = nodes.get(row["节点编号"])
        valid = True
        if not record_id.strip() or record_id_counts[record_id] > 1:
            issue("duplicate_or_missing_record_id", row, "记录编号为空或重复")
            valid = False
        if not student or not item or not node:
            issue("broken_reference", row, "学生、材料或节点不存在")
            valid = False
        if item and node and row["材料编号"] not in _tokens(node["可用题目编号"]):
            issue("item_not_available", row, "材料不在该测验节点可用范围")
            valid = False
        if item and row["主题编号"] != item["主题编号"]:
            issue("topic_mismatch", row, "作答主题与材料主题不一致")
            valid = False
        if item and item["指标编号"] not in indicator_ids:
            issue("unknown_indicator", row, "材料指标不在课程要求中")
            valid = False

        status = row["评分状态"]
        if status == "待评分":
            issue("pending", row, "待评分，不计入得分分母")
            valid = False
        elif status == "未作答":
            issue("unanswered", row, "未作答，单独统计")
            valid = False
        elif status != "已评分":
            issue("unknown_status", row, f"未知评分状态：{status}")
            valid = False
        score, maximum = _number(row["得分"]), _number(row["满分"])
        item_maximum = _number(item["满分"]) if item else None
        if status == "已评分" and (
            score is None
            or maximum is None
            or maximum <= 0
            or score < 0
            or score > maximum
        ):
            issue("invalid_score", row, "得分或满分超出有效范围")
            valid = False
        if (
            item
            and maximum is not None
            and item_maximum is not None
            and maximum != item_maximum
        ):
            issue("item_max_mismatch", row, "记录满分与材料满分不同")
            valid = False
        if valid:
            eligible.append(row)
        else:
            excluded.append(record_id)
    return eligible
