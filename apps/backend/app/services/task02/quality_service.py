"""Apply deterministic reference, status and score-quality rules."""

import math
import re
from collections import Counter


def _number(value: str) -> float | None:
    try:
        result = float(value)
        return result if math.isfinite(result) else None
    except (TypeError, ValueError):
        return None


def _tokens(value: str) -> set[str]:
    return set(re.findall(r"[A-Z]+\d+", value or ""))


def build_rubric_observations(selected: list[dict], items: dict) -> list[dict]:
    """Validate per-point scores without allowing rubric conflicts to alter totals."""

    observations = []
    for row in selected:
        item_id = row.get("材料编号", "")
        item = items.get(item_id, {})
        observation = {
            "record_id": row.get("记录编号"),
            "event_id": row.get("作答事件编号"),
            "student_id": row.get("学生编号"),
            "item_id": item_id,
            "node_id": row.get("节点编号"),
            "state": "unknown",
            "reason": "评分点数据不足，未知不等于 0 分。",
            "conflicts": [],
            "points": [],
            "total_score": None,
            "total_maximum": None,
        }
        if row.get("评分状态") != "已评分":
            observation["reason"] = "记录尚未完成评分；逐点评分未知，不推断为 0 分。"
            observations.append(observation)
            continue

        rubric_lines = [
            line.strip()
            for line in re.split(r"[\r\n]+", str(item.get("评分点", "")))
            if line.strip()
        ]
        if not rubric_lines:
            observation["reason"] = "题目未提供评分点定义；逐点评分未知。"
            observations.append(observation)
            continue

        rubric = {}
        rubric_conflicts = []
        rubric_pattern = re.compile(r"^([A-Z]+\d+P\d+)\s+.+?\s+(\d+)\s*分\s*$")
        for line in rubric_lines:
            match = rubric_pattern.fullmatch(line)
            if not match:
                rubric_conflicts.append("invalid_rubric_definition")
                continue
            point_id, maximum_text = match.groups()
            if not point_id.startswith(f"{item_id}P"):
                rubric_conflicts.append("foreign_rubric_point_id")
                continue
            if point_id in rubric:
                rubric_conflicts.append("duplicate_rubric_point_id")
                continue
            maximum = int(maximum_text)
            if maximum <= 0:
                rubric_conflicts.append("invalid_rubric_point_maximum")
                continue
            rubric[point_id] = maximum

        raw_points = str(row.get("评分点得分", "") or "").strip()
        if not raw_points:
            observation["reason"] = (
                "记录未提供评分点得分；逐点评分未知，不推断为 0 分。"
            )
            observations.append(observation)
            continue
        parsed = {}
        score_pattern = re.compile(r"^([A-Z]+\d+P\d+)\s*=\s*([+-]?\d+)\s*$")
        for entry in re.split(r"[;；]", raw_points):
            match = score_pattern.fullmatch(entry.strip())
            if not match:
                rubric_conflicts.append("malformed_rubric_score")
                continue
            point_id, earned_text = match.groups()
            if point_id in parsed:
                rubric_conflicts.append("duplicate_rubric_score_id")
                continue
            if point_id not in rubric:
                rubric_conflicts.append("unknown_rubric_score_id")
                continue
            earned = int(earned_text)
            if earned < 0 or earned > rubric[point_id]:
                rubric_conflicts.append("rubric_score_out_of_range")
                continue
            parsed[point_id] = earned

        if not rubric_conflicts and set(parsed) != set(rubric):
            observation["reason"] = (
                "部分评分点缺少得分；未提供的评分点保持未知，不推断为 0 分。"
            )
            observations.append(observation)
            continue

        total_score_text = str(row.get("得分", "")).strip()
        total_maximum_text = str(row.get("满分", "")).strip()
        if not re.fullmatch(r"\d+", total_score_text) or not re.fullmatch(
            r"\d+", total_maximum_text
        ):
            rubric_conflicts.append("invalid_total_score")
        else:
            total_score = int(total_score_text)
            total_maximum = int(total_maximum_text)
            observation["total_score"] = total_score
            observation["total_maximum"] = total_maximum
            if sum(rubric.values()) != total_maximum:
                rubric_conflicts.append("rubric_maximum_mismatch")
            if not rubric_conflicts and sum(parsed.values()) != total_score:
                rubric_conflicts.append("rubric_total_mismatch")

        if rubric_conflicts:
            conflicts = sorted(set(rubric_conflicts))
            observation.update(
                {
                    "state": "conflict",
                    "reason": "评分点与题目或总分不一致；保留总分统计，排除逐点评分汇总。",
                    "conflicts": conflicts,
                }
            )
        else:
            observation.update(
                {
                    "state": "valid",
                    "reason": "评分点编号、得分范围及总分校验一致。",
                    "points": [
                        {
                            "point_id": point_id,
                            "earned": parsed[point_id],
                            "maximum": rubric[point_id],
                        }
                        for point_id in rubric
                    ],
                }
            )
        observations.append(observation)
    return observations


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
    def issue(
        code: str,
        row: dict,
        detail: str,
        *,
        severity: str = "ERROR",
        disposition: str = "excluded",
    ) -> None:
        findings.append(
            {
                "code": code,
                "record_id": row.get("记录编号"),
                "source_line": row.get("_source_line"),
                "detail": detail,
                "severity": severity,
                "disposition": disposition,
                "event_id": row.get("作答事件编号") or None,
                "source_file": "作答记录.csv",
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
            issue(
                "pending",
                row,
                "待评分，不计入得分分母",
                severity="INFO",
                disposition="pending",
            )
            valid = False
        elif status == "未作答":
            issue(
                "unanswered",
                row,
                "未作答，单独统计",
                severity="INFO",
                disposition="unanswered",
            )
            valid = False
        elif status != "已评分":
            issue("unknown_status", row, f"未知评分状态：{status}")
            valid = False
        score, maximum = _number(row["得分"]), _number(row["满分"])
        item_maximum = _number(item["满分"]) if item else None
        if status == "已评分" and (
            not re.fullmatch(r"[+-]?\d+", str(row["得分"]).strip())
            or not re.fullmatch(r"[+-]?\d+", str(row["满分"]).strip())
            or score is None
            or maximum is None
            or maximum <= 0
            or score < 0
            or score > maximum
        ):
            issue("invalid_score", row, "得分或满分超出有效范围")
            valid = False
        if status in {"待评分", "未作答"} and (
            str(row.get("得分", "")).strip() or str(row.get("评分点得分", "")).strip()
        ):
            issue("status_score_conflict", row, "待评分或未作答记录不得包含已评分分值")
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
