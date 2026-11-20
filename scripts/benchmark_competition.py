#!/usr/bin/env python3
"""Reproducible, local-only benchmark for the competition workbench."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import platform
import statistics
import sys
import tempfile
import time
from collections import OrderedDict
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "apps" / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

TABLES = (
    "课程要求.csv",
    "题目与材料.csv",
    "模拟学生.csv",
    "测验节点.csv",
    "作答记录.csv",
    "字段说明.csv",
)
RESPONSE_TABLE = "作答记录.csv"


def write_resized_bundle(source: Path, output: Path, target_rows: int) -> dict:
    """Clone complete answer-event revision groups to an exact synthetic row count."""
    source, output = Path(source), Path(output)
    if target_rows <= 0:
        raise ValueError("target_rows must be positive")
    if output.exists() and any(output.iterdir()):
        raise ValueError(f"output directory must be empty: {output}")
    missing = [name for name in TABLES if not (source / name).is_file()]
    if missing:
        raise FileNotFoundError(f"source bundle is missing CSV files: {missing}")

    with (source / RESPONSE_TABLE).open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        if not reader.fieldnames or "记录编号" not in reader.fieldnames:
            raise ValueError("作答记录.csv must contain 记录编号")
        fields = reader.fieldnames
        grouped: OrderedDict[str, list[dict[str, str]]] = OrderedDict()
        for index, row in enumerate(reader):
            event_id = (row.get("作答事件编号") or "").strip()
            # Blank identifiers represent unrelated rows and must not be merged.
            key = event_id or f"__blank_event_{index}"
            grouped.setdefault(key, []).append(row)
    if not grouped:
        raise ValueError("source 作答记录.csv has no answer rows")
    largest = max(map(len, grouped.values()))
    if largest > target_rows:
        raise ValueError(
            f"target_rows {target_rows} is smaller than a complete event group ({largest})"
        )

    output.mkdir(parents=True, exist_ok=True)
    for name in TABLES:
        if name != RESPONSE_TABLE:
            (output / name).write_bytes((source / name).read_bytes())

    rows: list[dict[str, str]] = []
    group_items = list(grouped.items())
    clone = 0
    while len(rows) < target_rows:
        event_id, group = group_items[clone % len(group_items)]
        if len(rows) + len(group) <= target_rows:
            clone += 1
            for revision_index, item in enumerate(group, start=1):
                row = dict(item)
                row["记录编号"] = f"BM{clone:08d}R{revision_index:03d}"
                if "作答事件编号" in row:
                    row["作答事件编号"] = f"BM-EV-{clone:08d}" if event_id else ""
                rows.append(row)
        else:
            # Preserve exact cardinality without splitting revision chains: use
            # only source groups that fit the remaining capacity.
            fitting = next(
                (
                    pair
                    for pair in group_items
                    if len(pair[1]) <= target_rows - len(rows)
                ),
                None,
            )
            if fitting is None:
                raise ValueError(
                    "cannot reach exact target_rows without splitting an event group"
                )
            event_id, group = fitting
            clone += 1
            for revision_index, item in enumerate(group, start=1):
                row = dict(item)
                row["记录编号"] = f"BM{clone:08d}R{revision_index:03d}"
                if "作答事件编号" in row:
                    row["作答事件编号"] = f"BM-EV-{clone:08d}" if event_id else ""
                rows.append(row)

    with (output / RESPONSE_TABLE).open(
        "w", encoding="utf-8-sig", newline=""
    ) as stream:
        writer = csv.DictWriter(stream, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
    return {
        "rows": len(rows),
        "source_event_groups": len(grouped),
        "cloned_event_groups": clone,
    }


def summarize_durations(durations_ms: list[float]) -> dict:
    if not durations_ms:
        raise ValueError("at least one duration sample is required")
    return {
        "samples": len(durations_ms),
        "median_ms": round(statistics.median(durations_ms), 3),
        "max_ms": round(max(durations_ms), 3),
        "min_ms": round(min(durations_ms), 3),
    }


def validate_output_path(source: Path, output: Path) -> None:
    source, output = Path(source).resolve(), Path(output).resolve()
    if output == source or source in output.parents:
        raise ValueError("benchmark output must be outside the read-only source bundle")


def _measure(action: Callable[[], object]) -> tuple[float, object]:
    start = time.perf_counter()
    result = action()
    return (time.perf_counter() - start) * 1000, result


def _hashes(bundle: Path) -> dict[str, str]:
    return {
        name: hashlib.sha256((bundle / name).read_bytes()).hexdigest()
        for name in TABLES
    }


def _run_once(source: Path, rows: int, repeat: int, resources_dir: Path | None) -> dict:
    from alembic import command
    from alembic.config import Config
    from app.api.app import create_app
    from app.config import Settings
    from app.repositories.store import Store
    from fastapi.testclient import TestClient

    with tempfile.TemporaryDirectory(prefix="smart-learning-benchmark-") as temporary:
        root = Path(temporary)
        bundle = root / "bundle"
        write_resized_bundle(source, bundle, rows)
        db_file = root / "smart_learning.db"
        db_url = f"sqlite:///{db_file.as_posix()}"
        config = Config(str(BACKEND / "alembic.ini"))
        config.set_main_option("script_location", str(BACKEND / "alembic"))
        config.set_main_option("sqlalchemy.url", db_url)
        migration_ms, _ = _measure(lambda: command.upgrade(config, "head"))

        settings = Settings(
            project_root=ROOT,
            data_dir=root,
            resources_dir=resources_dir or ROOT / "resources",
            database_url_override=db_url,
        )
        store_ms, store = _measure(
            lambda: Store(
                root, resources_dir=resources_dir, database_url=db_url, config=settings
            )
        )
        try:
            import_ms, result = _measure(lambda: store.import_folder(bundle))
            first = next(
                csv.DictReader(
                    (bundle / RESPONSE_TABLE).open(encoding="utf-8-sig", newline="")
                )
            )
            with (bundle / "课程要求.csv").open(
                encoding="utf-8-sig", newline=""
            ) as stream:
                requirements = list(csv.DictReader(stream))
            indicator = next(
                (
                    item["指标编号"]
                    for item in requirements
                    if item.get("主题编号") == first["主题编号"]
                ),
                None,
            )
            if indicator is None:
                raise ValueError(f"no indicator found for topic {first['主题编号']!r}")
            with (bundle / "模拟学生.csv").open(
                encoding="utf-8-sig", newline=""
            ) as stream:
                students = [
                    item["学生编号"]
                    for item in csv.DictReader(stream)
                    if item.get("学生编号")
                ][:3]
            if len(students) != 3:
                raise ValueError("case report benchmark requires at least 3 students")
            with TestClient(create_app(store, settings)) as client:
                health_ms, health = _measure(lambda: client.get("/api/health"))
                evidence_ms, evidence = _measure(
                    lambda: client.get(
                        "/api/evidence-bundle",
                        params={
                            "student": first["学生编号"],
                            "indicator": indicator,
                            "node": first["节点编号"],
                        },
                    )
                )
                report_cases_ms, cases = _measure(
                    lambda: client.get(
                        "/api/reports/cases", params={"students": students}
                    )
                )
                report_class_ms, class_report = _measure(
                    lambda: client.get(
                        "/api/reports/class", params={"node": first["节点编号"]}
                    )
                )
                for name, response in (
                    ("health", health),
                    ("evidence", evidence),
                    ("case_report", cases),
                    ("class_report", class_report),
                ):
                    if response.status_code != 200:
                        raise RuntimeError(
                            f"{name} returned HTTP {response.status_code}: {response.text[:300]}"
                        )
            return {
                "repeat": repeat,
                "rows": rows,
                "timings_ms": {
                    "migration": migration_ms,
                    "store_startup": store_ms,
                    "import": import_ms,
                    "api_health": health_ms,
                    "evidence_bundle": evidence_ms,
                    "case_report": report_cases_ms,
                    "class_report": report_class_ms,
                },
                "import_summary": {
                    key: result.get(key)
                    for key in ("run_id", "students", "classes", "records", "issues")
                    if key in result
                },
            }
        finally:
            store.database.dispose()


def run_benchmark(
    source: Path,
    row_targets: list[int],
    repeats: int = 5,
    resources_dir: Path | None = None,
) -> dict:
    if repeats < 1:
        raise ValueError("repeats must be positive")
    source = Path(source).resolve()
    raw_runs = [
        _run_once(source, rows, index + 1, resources_dir)
        for rows in row_targets
        for index in range(repeats)
    ]
    grouped: dict[int, list[dict]] = {}
    for run in raw_runs:
        grouped.setdefault(run["rows"], []).append(run)
    summaries = {}
    for rows, runs in grouped.items():
        metrics = runs[0]["timings_ms"]
        summaries[str(rows)] = {
            "samples": len(runs),
            "median_max_min_ms": {
                name: summarize_durations([run["timings_ms"][name] for run in runs])
                for name in metrics
            },
        }
    source_hashes = _hashes(source)
    return {
        "schema_version": "1.0",
        "generated_at_utc": datetime.now(UTC).isoformat(),
        "dataset_kind": "synthetic_resized_from_supplied_csv",
        "source_bundle_sha256": source_hashes,
        "machine": {
            "platform": platform.platform(),
            "python": sys.version.split()[0],
            "processor": platform.processor() or "unknown",
            "cpu_count": os.cpu_count(),
        },
        "repeats": repeats,
        "runs": raw_runs,
        "summary_by_rows": summaries,
        "limitations": [
            "This measures backend workflows only; browser navigation and human usability require separate observed runs.",
            "Rows are synthetic clones of source event groups; this is a performance workload, not independent learning evidence or an official evaluation set.",
            "Each repeat uses a fresh temporary SQLite database and runs Alembic migrations before importing.",
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source-dir",
        type=Path,
        required=True,
        help="folder containing the six competition CSV files; input is read-only",
    )
    parser.add_argument("--rows", type=int, nargs="+", default=[1000, 5000])
    parser.add_argument("--repeats", type=int, default=5)
    parser.add_argument("--resources-dir", type=Path)
    parser.add_argument(
        "--output", type=Path, required=True, help="JSON output path outside source-dir"
    )
    args = parser.parse_args()
    validate_output_path(args.source_dir, args.output)
    report = run_benchmark(args.source_dir, args.rows, args.repeats, args.resources_dir)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(report["summary_by_rows"], ensure_ascii=False, indent=2))
    print(f"Wrote benchmark report to {args.output.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
