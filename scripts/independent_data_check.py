"""Independent read-only checker for the six contest CSVs.

This module intentionally does not import the production ingestion, revision,
quality, or metrics services. It implements only the source reconciliation
needed to independently verify disposition counts and summed scored points.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

TABLE_FILES = (
    "课程要求.csv",
    "题目与材料.csv",
    "模拟学生.csv",
    "测验节点.csv",
    "作答记录.csv",
    "字段说明.csv",
)
ID_TOKEN = re.compile(r"[A-Z]+\d+")


class SourceDataError(ValueError):
    pass


def _read_csv(path: Path) -> tuple[list[dict[str, str]], str]:
    raw = path.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise SourceDataError(f"{path.name} must be UTF-8") from exc
    try:
        reader = csv.DictReader(text.splitlines(), strict=True)
        if not reader.fieldnames:
            raise SourceDataError(f"{path.name} has no header")
        rows = []
        for row in reader:
            if None in row or any(value is None for value in row.values()):
                raise SourceDataError(
                    f"{path.name} line {reader.line_num} has malformed columns"
                )
            rows.append({**row, "_source_line": str(reader.line_num)})
    except csv.Error as exc:
        raise SourceDataError(f"{path.name} malformed CSV: {exc}") from exc
    return rows, digest


def _unique_index(
    rows: list[dict[str, str]], key: str, label: str
) -> dict[str, dict[str, str]]:
    result = {}
    for row in rows:
        value = row.get(key, "").strip()
        if not value or value in result:
            raise SourceDataError(f"{label}.{key} is empty or duplicated: {value!r}")
        result[value] = row
    return result


def _integer(text: str) -> int | None:
    if not re.fullmatch(r"[+-]?\d+", str(text or "").strip()):
        return None
    try:
        return int(text)
    except ValueError:
        return None


def recalculate(source_dir: Path) -> dict[str, Any]:
    """Reconcile rows and independently sum valid, latest scored responses."""
    source_dir = Path(source_dir).resolve()
    tables: dict[str, list[dict[str, str]]] = {}
    file_hashes = {}
    for filename in TABLE_FILES:
        path = source_dir / filename
        if not path.is_file():
            raise SourceDataError(f"missing contest input file: {filename}")
        tables[filename.removesuffix(".csv")], file_hashes[filename] = _read_csv(path)

    objectives = tables["课程要求"]
    items = _unique_index(tables["题目与材料"], "材料编号", "题目与材料")
    students = _unique_index(tables["模拟学生"], "学生编号", "模拟学生")
    nodes = _unique_index(tables["测验节点"], "节点编号", "测验节点")
    indicators = {row["指标编号"] for row in objectives}
    records = tables["作答记录"]
    record_counts = Counter(row.get("记录编号", "").strip() for row in records)

    events: dict[str, list[dict[str, str]]] = defaultdict(list)
    dispositions: dict[int, str] = {}
    for index, row in enumerate(records):
        event = row.get("作答事件编号", "").strip()
        if not event:
            dispositions[index] = "excluded"
        else:
            events[event].append(row)

    selected: list[tuple[int, dict[str, str]]] = []
    index_by_line = {row["_source_line"]: index for index, row in enumerate(records)}
    for event_rows in events.values():
        row_indices = [index_by_line[row["_source_line"]] for row in event_rows]
        identity = {
            (row.get("学生编号", ""), row.get("材料编号", ""), row.get("节点编号", ""))
            for row in event_rows
        }
        versions = [_integer(row.get("修订版本", "")) for row in event_rows]
        invalid = len(identity) != 1 or any(
            version is None or version < 1 for version in versions
        )
        version_counts = Counter(versions)
        invalid = invalid or any(
            version_counts[version] > 1 for version in versions if version is not None
        )
        if invalid:
            for index in row_indices:
                dispositions[index] = "excluded"
            continue
        latest_version = max(version for version in versions if version is not None)
        latest_offsets = [
            offset
            for offset, version in enumerate(versions)
            if version == latest_version
        ]
        if len(latest_offsets) != 1:
            for index in row_indices:
                dispositions[index] = "excluded"
            continue
        latest_offset = latest_offsets[0]
        latest_index = row_indices[latest_offset]
        for offset, index in enumerate(row_indices):
            if offset != latest_offset:
                dispositions[index] = "superseded"
        selected.append((latest_index, event_rows[latest_offset]))

    scored = []
    for index, row in selected:
        record_id = row.get("记录编号", "").strip()
        student = students.get(row.get("学生编号", "").strip())
        item = items.get(row.get("材料编号", "").strip())
        node = nodes.get(row.get("节点编号", "").strip())
        item_id = row.get("材料编号", "").strip()
        maximum = _integer(row.get("满分", ""))
        earned = _integer(row.get("得分", ""))
        item_maximum = _integer(item.get("满分", "")) if item else None
        allowed_items = (
            set(ID_TOKEN.findall(node.get("可用题目编号", ""))) if node else set()
        )
        valid_refs = bool(
            student
            and item
            and node
            and item.get("指标编号", "") in indicators
            and row.get("主题编号", "") == item.get("主题编号", "")
            and item_id in allowed_items
        )
        valid_score = (
            row.get("评分状态") == "已评分"
            and earned is not None
            and maximum is not None
            and maximum > 0
            and 0 <= earned <= maximum
            and maximum == item_maximum
        )
        if not record_id or record_counts[record_id] != 1 or not valid_refs:
            dispositions[index] = "excluded"
        elif row.get("评分状态") == "待评分":
            dispositions[index] = "pending"
        elif row.get("评分状态") == "未作答":
            dispositions[index] = "unanswered"
        elif valid_score:
            dispositions[index] = "scored"
            scored.append((row, earned, maximum))
        else:
            dispositions[index] = "excluded"

    disposition_counts = Counter(
        dispositions.get(index, "excluded") for index in range(len(records))
    )
    student_totals: dict[str, dict[str, int]] = defaultdict(
        lambda: {"score": 0, "maximum": 0, "records": 0}
    )
    for row, score, maximum in scored:
        total = student_totals[row["学生编号"]]
        total["score"] += score
        total["maximum"] += maximum
        total["records"] += 1
    return {
        "source_dir_label": source_dir.name,
        "file_sha256": file_hashes,
        "table_rows": {name: len(rows) for name, rows in tables.items()},
        "student_count": len(students),
        "class_count": len({row.get("模拟班级编号") for row in students.values()}),
        "node_count": len(nodes),
        "indicator_count": len(indicators),
        "item_count": len(items),
        "record_count": len(records),
        "event_count": len(events),
        "disposition_counts": dict(sorted(disposition_counts.items())),
        "scored_record_count": len(scored),
        "scored_points": sum(score for _, score, _ in scored),
        "scored_maximum": sum(maximum for _, _, maximum in scored),
        "student_totals": dict(sorted(student_totals.items())),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument(
        "--expected", type=Path, help="optional JSON object with fields to compare"
    )
    args = parser.parse_args()
    try:
        report = recalculate(args.source_dir)
        mismatches = {}
        if args.expected:
            expected = json.loads(args.expected.read_text(encoding="utf-8"))
            for key, value in expected.items():
                if report.get(key) != value:
                    mismatches[key] = {"expected": value, "actual": report.get(key)}
        report["expected_mismatches"] = mismatches
        report["status"] = "pass" if not mismatches else "fail"
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        print(
            json.dumps(
                {
                    key: report[key]
                    for key in (
                        "record_count",
                        "disposition_counts",
                        "scored_points",
                        "scored_maximum",
                        "status",
                    )
                },
                ensure_ascii=False,
            )
        )
        return 1 if mismatches else 0
    except (OSError, json.JSONDecodeError, SourceDataError) as exc:
        print(f"source check error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
