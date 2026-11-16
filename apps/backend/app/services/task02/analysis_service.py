"""Orchestrate TASK 02 version selection, quality, metrics and observations."""

from __future__ import annotations

import hashlib
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from ...config import settings
from ...services.task01.source_index_service import build_source_index
from .metrics_service import build_metrics, build_observations
from .quality_service import validate_records
from .revision_service import select_revisions

RULE_VERSION = "2"


def analyze(tables: dict, files: dict, resources_dir: Path | None = None) -> dict:
    objectives = tables["课程要求"]
    items = {row["材料编号"]: row for row in tables["题目与材料"]}
    students = {row["学生编号"]: row for row in tables["模拟学生"]}
    nodes = {row["节点编号"]: row for row in tables["测验节点"]}
    indicator_ids = {row["指标编号"] for row in objectives}
    findings: list[dict] = []

    events, selected, excluded = select_revisions(tables["作答记录"], findings)
    eligible = validate_records(
        selected,
        tables["作答记录"],
        students,
        items,
        nodes,
        indicator_ids,
        findings,
        excluded,
    )
    metrics = build_metrics(eligible, items, students)
    observations = build_observations(selected, eligible, students, items, objectives)
    source_index, source_checks = build_source_index(
        objectives, resources_dir or settings.resources_dir
    )

    quality = {
        "raw_rows": len(tables["作答记录"]),
        "events": len(events),
        "selected_revisions": len(selected),
        "eligible_scored": len(eligible),
        "excluded_record_ids": sorted(set(excluded)),
        "finding_counts": dict(Counter(finding["code"] for finding in findings)),
        "findings": findings,
    }
    digest = hashlib.sha256(
        json.dumps(
            {
                "files": files,
                "rule_version": RULE_VERSION,
                "source_checks": source_checks,
            },
            sort_keys=True,
            ensure_ascii=False,
        ).encode()
    ).hexdigest()[:16]
    return {
        "run_id": digest,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "rule_version": RULE_VERSION,
        "files": files,
        "quality": quality,
        "objectives": objectives,
        "items": list(items.values()),
        "students": list(students.values()),
        "nodes": list(nodes.values()),
        "field_dictionary": tables["字段说明"],
        "source_index": source_index,
        "raw_responses": tables["作答记录"],
        "responses": selected,
        "metrics": metrics,
        "observations": observations,
    }
