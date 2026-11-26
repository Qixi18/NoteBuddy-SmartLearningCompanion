"""校验演示数据：字段、引用完整性、质量口径与 manifest 一致。

运行：python scripts/demo/verify-demo-data.py
退出码 0 表示通过；任何不一致都会打印并以 1 退出。
"""

from __future__ import annotations

import csv
import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEMO = ROOT / "demo-data"

REQUIRED = {
    "课程要求": ["主题编号", "指标编号", "观察指标"],
    "题目与材料": ["材料编号", "主题编号", "指标编号", "满分"],
    "模拟学生": ["学生编号", "模拟班级编号"],
    "测验节点": ["节点编号", "可用题目编号"],
    "作答记录": [
        "记录编号", "学生编号", "材料编号", "节点编号", "主题编号",
        "作答事件编号", "修订版本", "评分状态", "得分", "满分",
    ],
    "字段说明": ["数据表", "字段名"],
}


def read_table(name: str) -> list[dict]:
    path = DEMO / "csv" / f"{name}.csv"
    if not path.is_file():
        raise SystemExit(f"缺少文件：{path}")
    with path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        missing = set(REQUIRED[name]) - set(reader.fieldnames or [])
        if missing:
            raise SystemExit(f"{path.name} 缺少字段：{sorted(missing)}")
        return list(reader)


def check_references(tables: dict[str, list[dict]]) -> list[str]:
    problems: list[str] = []
    students = {row["学生编号"]: row["模拟班级编号"] for row in tables["模拟学生"]}
    items = {row["材料编号"]: row for row in tables["题目与材料"]}
    nodes = {row["节点编号"]: row for row in tables["测验节点"]}
    indicators = {row["指标编号"] for row in tables["课程要求"]}
    for row in tables["作答记录"]:
        if row["学生编号"] not in students:
            problems.append(f"未知学生：{row['记录编号']}")
        if row["材料编号"] not in items:
            problems.append(f"未知材料：{row['记录编号']}")
        if row["节点编号"] not in nodes:
            problems.append(f"未知节点：{row['记录编号']}")
        if row["材料编号"] in items and items[row["材料编号"]]["指标编号"] not in indicators:
            problems.append(f"题目指标未在课程要求中：{row['材料编号']}")
    for node_id, node in nodes.items():
        for item_id in [part.strip() for part in node["可用题目编号"].split(",") if part.strip()]:
            if item_id not in items:
                problems.append(f"节点 {node_id} 引用了未知题目 {item_id}")
    return problems


def main() -> int:
    manifest = json.loads((DEMO / "manifest.json").read_text(encoding="utf-8"))
    expected = manifest["expected"]
    tables = {name: read_table(name) for name in REQUIRED}
    problems = check_references(tables)
    if problems:
        print("引用完整性问题：")
        for problem in problems:
            print(" -", problem)
        return 1

    sys.path.insert(0, str(ROOT / "apps" / "backend"))
    from app.repositories.store import Store

    with tempfile.TemporaryDirectory() as folder:
        store = Store(Path(folder))
        store.database.create_schema_for_tests()
        try:
            result = store.import_folder(DEMO / "csv")
            quality = result["quality"]
            findings = quality.get("finding_counts", {})
            actual = {
                "student_count": len(result["students"]),
                "class_count": len({row["模拟班级编号"] for row in result["students"]}),
                "node_count": len(result["nodes"]),
                "item_count": len(result["items"]),
                "indicator_count": len(result["objectives"]),
                "raw_rows": quality["raw_rows"],
                "pending_rows": findings.get("pending", 0),
                "unanswered_rows": findings.get("unanswered", 0),
                "over_maximum_rows": findings.get("invalid_score", 0),
                "revised_events": findings.get("multiple_revisions", 0),
            }
        finally:
            store.database.dispose()

    mismatches = {
        key: (expected.get(key), value)
        for key, value in actual.items()
        if expected.get(key) != value
    }
    print(json.dumps({"actual": actual, "expected": expected}, ensure_ascii=False, indent=2))
    if mismatches:
        print("与 manifest 不一致：")
        for key, (want, got) in mismatches.items():
            print(f" - {key}: manifest={want} actual={got}")
        return 1
    print("演示数据校验通过：字段、引用与质量口径均与 manifest 一致。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
