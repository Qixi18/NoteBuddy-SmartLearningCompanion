"""Read and validate the six source CSV files without changing their fields."""

from __future__ import annotations

import csv
import hashlib
import io
from pathlib import Path

from ...application.ports.file_storage import FileStorage
from ..files.local_file_storage import LocalFileStorage

TABLES = {
    "课程要求": ["主题编号", "指标编号", "观察指标"],
    "题目与材料": ["材料编号", "主题编号", "指标编号", "满分"],
    "模拟学生": ["学生编号", "模拟班级编号"],
    "测验节点": ["节点编号", "可用题目编号"],
    "作答记录": [
        "记录编号",
        "学生编号",
        "材料编号",
        "节点编号",
        "主题编号",
        "作答事件编号",
        "修订版本",
        "评分状态",
        "得分",
        "满分",
    ],
    "字段说明": ["数据表", "字段名"],
}


def read_bundle(folder: Path, storage: FileStorage | None = None) -> tuple[dict, dict]:
    folder = Path(folder)
    storage = storage or LocalFileStorage()
    tables, files = {}, {}
    for name, required in TABLES.items():
        path = folder / f"{name}.csv"
        if not path.is_file():
            raise ValueError(f"缺少文件：{path}")
        raw = storage.read_bytes(path)
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
        files[name] = {
            "name": path.name,
            "sha256": hashlib.sha256(raw).hexdigest(),
            "rows": len(rows),
        }
    return tables, files
