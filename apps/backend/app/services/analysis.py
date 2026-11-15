"""赛事数据导入、质量检查和可追溯统计。"""
from __future__ import annotations

import csv
import hashlib
import io
import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

from ..config import settings

TABLES = {
    "课程要求": ["主题编号", "指标编号", "观察指标"],
    "题目与材料": ["材料编号", "主题编号", "指标编号", "满分"],
    "模拟学生": ["学生编号", "模拟班级编号"],
    "测验节点": ["节点编号", "可用题目编号"],
    "作答记录": ["记录编号", "学生编号", "材料编号", "节点编号", "作答事件编号", "修订版本", "评分状态", "满分"],
    "字段说明": ["数据表", "字段名"],
}
RULE_VERSION = "2"


def read_bundle(folder: Path) -> tuple[dict, dict]:
    folder = Path(folder)
    tables, files = {}, {}
    for name, required in TABLES.items():
        path = folder / f"{name}.csv"
        if not path.is_file():
            raise ValueError(f"缺少文件：{path}")
        raw = path.read_bytes()
        try:
            text = raw.decode("utf-8-sig")
        except UnicodeDecodeError as exc:
            raise ValueError(f"{path.name} 不是 UTF-8 编码") from exc
        reader = csv.DictReader(io.StringIO(text, newline=""))
        missing = set(required) - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"{path.name} 缺少字段：{', '.join(sorted(missing))}")
        rows = []
        for row in reader:
            line = reader.line_num
            if None in row:
                raise ValueError(f"{path.name} 第 {line} 行字段数量不符")
            rows.append({**row, "_source_line": line})
        tables[name] = rows
        files[name] = {"name": path.name, "sha256": hashlib.sha256(raw).hexdigest(), "rows": len(rows)}
    return tables, files


def _number(value: str) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _tokens(value: str) -> set[str]:
    import re
    return set(re.findall(r"[A-Z]+\d+", value or ""))


def analyze(tables: dict, files: dict) -> dict:
    objectives = tables["课程要求"]
    items = {r["材料编号"]: r for r in tables["题目与材料"]}
    students = {r["学生编号"]: r for r in tables["模拟学生"]}
    nodes = {r["节点编号"]: r for r in tables["测验节点"]}
    indicator_ids = {r["指标编号"] for r in objectives}
    findings = []

    def issue(code, row, detail):
        findings.append({"code": code, "record_id": row.get("记录编号"), "source_line": row.get("_source_line"), "detail": detail})

    events = defaultdict(list)
    record_id_counts = Counter(r["记录编号"] for r in tables["作答记录"])
    for row in tables["作答记录"]:
        if not row["作答事件编号"].strip():
            issue("missing_event_id", row, "作答事件编号为空")
            continue
        events[row["作答事件编号"]].append(row)
    selected = []
    excluded = [r["记录编号"] for r in tables["作答记录"] if not r["作答事件编号"].strip()]
    for event_id, revisions in events.items():
        if len(revisions) > 1:
            issue("multiple_revisions", revisions[0], f"事件 {event_id} 有 {len(revisions)} 个版本")
        identities = {(r["学生编号"], r["材料编号"], r["节点编号"]) for r in revisions}
        if len(identities) != 1:
            for row in revisions:
                issue("event_identity_conflict", row, f"事件 {event_id} 的学生、材料或节点不一致")
            excluded.extend(r["记录编号"] for r in revisions)
            continue
        parsed = []
        for row in revisions:
            try:
                version = int(row["修订版本"])
            except ValueError:
                issue("invalid_revision", row, "修订版本不是整数")
                excluded.append(row["记录编号"])
                continue
            parsed.append((version, row))
        if not parsed:
            continue
        max_version = max(v for v, _ in parsed)
        highest = [r for v, r in parsed if v == max_version]
        if len(highest) != 1:
            for row in highest:
                issue("revision_conflict", row, f"事件 {event_id} 最高版本重复")
            excluded.extend(r["记录编号"] for r in revisions)
            continue
        row = highest[0]
        excluded.extend(r["记录编号"] for r in revisions if r is not row)
        selected.append(row)

    eligible = []
    for row in selected:
        rid = row["记录编号"]
        student, item, node = students.get(row["学生编号"]), items.get(row["材料编号"]), nodes.get(row["节点编号"])
        valid = True
        if not rid.strip() or record_id_counts[rid] > 1:
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
        item_max = _number(item["满分"]) if item else None
        if status == "已评分" and (score is None or maximum is None or maximum <= 0 or score < 0 or score > maximum):
            issue("invalid_score", row, "得分或满分超出有效范围")
            valid = False
        if item and maximum is not None and item_max is not None and maximum != item_max:
            issue("item_max_mismatch", row, "记录满分与材料满分不同")
            valid = False
        if valid:
            eligible.append(row)
        else:
            excluded.append(rid)

    def metric(rows, scope):
        score = sum(float(r["得分"]) for r in rows)
        maximum = sum(float(r["满分"]) for r in rows)
        return {**scope, "score": score, "maximum": maximum, "ratio": score / maximum if maximum else None,
                "count": len(rows), "record_ids": [r["记录编号"] for r in rows],
                "event_ids": [r["作答事件编号"] for r in rows]}

    buckets = defaultdict(list)
    for row in eligible:
        item = items[row["材料编号"]]
        cls = students[row["学生编号"]]["模拟班级编号"]
        for kind, key in (("student", row["学生编号"]), ("class", cls), ("topic", row["主题编号"]),
                          ("indicator", item["指标编号"]), ("item", row["材料编号"]), ("node", row["节点编号"]),
                          ("student_indicator", f'{row["学生编号"]}:{item["指标编号"]}'),
                          ("class_indicator", f'{cls}:{item["指标编号"]}')):
            buckets[(kind, key)].append(row)
    metrics = [metric(rows, {"kind": kind, "key": key}) for (kind, key), rows in sorted(buckets.items())]
    source_checks_path = settings.resources_dir / "source_checks.json"
    source_checks = json.loads(source_checks_path.read_text(encoding="utf-8")) if source_checks_path.exists() else {}
    source_index = []
    for objective in objectives:
        source_index.append({"indicator_id": objective["指标编号"], "topic_id": objective["主题编号"],
                             "curriculum_reference": objective.get("课标文件页／正文页"),
                             "textbook_reference": objective.get("教材正文页"),
                             "source_check": source_checks.get(objective["主题编号"], {}),
                             "verification": "topic_checked_indicator_page_pending" if objective["主题编号"] in source_checks else "pending"})
    eligible_ids = {r["记录编号"] for r in eligible}
    observations = []
    for student_id, student in students.items():
        for objective in objectives:
            indicator_id = objective["指标编号"]
            item_ids = {item_id for item_id, item in items.items() if item["指标编号"] == indicator_id}
            scoped = [r for r in selected if r["学生编号"] == student_id and r["材料编号"] in item_ids]
            observations.append({"student_id": student_id, "class_id": student["模拟班级编号"],
                                 "indicator_id": indicator_id, "selected_count": len(scoped),
                                 "scored_count": sum(r["记录编号"] in eligible_ids for r in scoped),
                                 "pending_count": sum(r["评分状态"] == "待评分" for r in scoped),
                                 "unanswered_count": sum(r["评分状态"] == "未作答" for r in scoped),
                                 "excluded_count": sum(r["记录编号"] not in eligible_ids for r in scoped),
                                 "record_ids": [r["记录编号"] for r in scoped]})
    quality = {"raw_rows": len(tables["作答记录"]), "events": len(events), "selected_revisions": len(selected),
               "eligible_scored": len(eligible), "excluded_record_ids": sorted(set(excluded)),
               "finding_counts": dict(Counter(f["code"] for f in findings)), "findings": findings}
    digest = hashlib.sha256(json.dumps({"files": files, "rule_version": RULE_VERSION, "source_checks": source_checks}, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:16]
    return {"run_id": digest, "created_at": datetime.now(timezone.utc).isoformat(), "rule_version": RULE_VERSION,
            "files": files, "quality": quality, "objectives": objectives, "items": list(items.values()),
            "students": list(students.values()), "nodes": list(nodes.values()),
            "field_dictionary": tables["字段说明"], "source_index": source_index,
            "raw_responses": tables["作答记录"], "responses": selected, "metrics": metrics,
            "observations": observations}
