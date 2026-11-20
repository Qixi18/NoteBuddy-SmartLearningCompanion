from __future__ import annotations

import csv
import hashlib
import importlib.util
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SPEC = importlib.util.spec_from_file_location(
    "competition_benchmark", ROOT / "scripts" / "benchmark_competition.py"
)
assert SPEC and SPEC.loader
benchmark = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(benchmark)


def write_small_bundle(folder: Path) -> None:
    folder.mkdir(parents=True)
    tables = {
        "课程要求": (["指标编号"], [{"指标编号": "T01I1"}]),
        "题目与材料": (
            ["材料编号", "主题编号", "指标编号", "满分"],
            [{"材料编号": "Q001", "主题编号": "T01", "指标编号": "T01I1", "满分": "3"}],
        ),
        "模拟学生": (
            ["学生编号", "模拟班级编号"],
            [{"学生编号": "D01", "模拟班级编号": "DC01"}],
        ),
        "测验节点": (
            ["节点编号", "可用题目编号"],
            [{"节点编号": "N01", "可用题目编号": "Q001"}],
        ),
        "作答记录": (
            [
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
            [
                {
                    "记录编号": "R01",
                    "学生编号": "D01",
                    "材料编号": "Q001",
                    "节点编号": "N01",
                    "主题编号": "T01",
                    "作答事件编号": "EV01",
                    "修订版本": "1",
                    "评分状态": "已评分",
                    "得分": "1",
                    "满分": "3",
                },
                {
                    "记录编号": "R02",
                    "学生编号": "D01",
                    "材料编号": "Q001",
                    "节点编号": "N01",
                    "主题编号": "T01",
                    "作答事件编号": "EV01",
                    "修订版本": "2",
                    "评分状态": "已评分",
                    "得分": "2",
                    "满分": "3",
                },
                {
                    "记录编号": "R03",
                    "学生编号": "D01",
                    "材料编号": "Q001",
                    "节点编号": "N01",
                    "主题编号": "T01",
                    "作答事件编号": "EV02",
                    "修订版本": "1",
                    "评分状态": "已评分",
                    "得分": "3",
                    "满分": "3",
                },
                {
                    "记录编号": "R04",
                    "学生编号": "D01",
                    "材料编号": "Q001",
                    "节点编号": "N01",
                    "主题编号": "T01",
                    "作答事件编号": "EV03",
                    "修订版本": "1",
                    "评分状态": "未作答",
                    "得分": "",
                    "满分": "",
                },
                {
                    "记录编号": "R05",
                    "学生编号": "D01",
                    "材料编号": "Q001",
                    "节点编号": "N01",
                    "主题编号": "T01",
                    "作答事件编号": "EV04",
                    "修订版本": "1",
                    "评分状态": "待评分",
                    "得分": "",
                    "满分": "",
                },
            ],
        ),
        "字段说明": (
            ["数据表", "字段名"],
            [{"数据表": "作答记录", "字段名": "记录编号"}],
        ),
    }
    for name, (headers, rows) in tables.items():
        with (folder / f"{name}.csv").open(
            "w", encoding="utf-8-sig", newline=""
        ) as stream:
            writer = csv.DictWriter(stream, fieldnames=headers)
            writer.writeheader()
            writer.writerows(rows)


def test_resized_bundle_has_exact_rows_unique_ids_and_complete_revision_groups(
    tmp_path: Path,
) -> None:
    source, output = tmp_path / "source", tmp_path / "synthetic-8"
    write_small_bundle(source)
    original_hash = hashlib.sha256((source / "作答记录.csv").read_bytes()).hexdigest()

    result = benchmark.write_resized_bundle(source, output, target_rows=8)

    with (output / "作答记录.csv").open(encoding="utf-8-sig", newline="") as stream:
        rows = list(csv.DictReader(stream))
    assert len(rows) == 8
    assert result["rows"] == 8
    assert len({row["记录编号"] for row in rows}) == 8
    # Eight rows consist of two two-revision events and four single-row events.
    assert len({row["作答事件编号"] for row in rows}) == 6
    groups = defaultdict(list)
    for row in rows:
        groups[row["作答事件编号"]].append(row["修订版本"])
    assert sum(sorted(versions) == ["1", "2"] for versions in groups.values()) == 2
    assert (
        hashlib.sha256((source / "作答记录.csv").read_bytes()).hexdigest()
        == original_hash
    )
    assert (source / "题目与材料.csv").read_bytes() == (
        output / "题目与材料.csv"
    ).read_bytes()


def test_resized_bundle_rejects_nonpositive_row_targets(tmp_path: Path) -> None:
    source, output = tmp_path / "source", tmp_path / "synthetic-empty"
    write_small_bundle(source)
    try:
        benchmark.write_resized_bundle(source, output, target_rows=0)
    except ValueError as exc:
        assert "positive" in str(exc)
    else:
        raise AssertionError("zero-row benchmark bundles must be rejected")


def test_duration_summary_reports_median_and_worst_observed_sample() -> None:
    summary = benchmark.summarize_durations([1.0, 2.0, 3.0, 10.0])

    assert summary == {"samples": 4, "median_ms": 2.5, "max_ms": 10.0, "min_ms": 1.0}


def test_output_path_must_not_be_inside_source_bundle(tmp_path: Path) -> None:
    source = tmp_path / "official-source"
    source.mkdir()

    try:
        benchmark.validate_output_path(source, source / "benchmark.json")
    except ValueError as exc:
        assert "outside" in str(exc)
    else:
        raise AssertionError("benchmark output must not be written into source data")
