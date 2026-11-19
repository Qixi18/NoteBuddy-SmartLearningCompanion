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
from .quality_service import build_rubric_observations, validate_records
from .revision_service import select_revisions

# Version covers the changed revision, disposition, node-observation and metric rules.
RULE_VERSION = "3"


def _unique_index(rows: list[dict], id_field: str, table_name: str) -> dict[str, dict]:
    index: dict[str, dict] = {}
    for row in rows:
        entity_id = str(row.get(id_field, "")).strip()
        if not entity_id:
            raise ValueError(f"{table_name} 的 {id_field} 不能为空")
        if entity_id in index:
            raise ValueError(f"{table_name} 的 {id_field} 重复：{entity_id}")
        index[entity_id] = row
    return index


def analyze(tables: dict, files: dict, resources_dir: Path | None = None) -> dict:
    objectives = tables["课程要求"]
    items = _unique_index(tables["题目与材料"], "材料编号", "题目与材料")
    students = _unique_index(tables["模拟学生"], "学生编号", "模拟学生")
    nodes = _unique_index(tables["测验节点"], "节点编号", "测验节点")
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
    rubric_observations = build_rubric_observations(selected, items)
    for observation in rubric_observations:
        if observation["state"] == "conflict":
            source_row = next(
                (
                    row
                    for row in selected
                    if row.get("记录编号") == observation["record_id"]
                ),
                {},
            )
            findings.append(
                {
                    "code": "rubric_conflict",
                    "record_id": observation["record_id"],
                    "event_id": observation["event_id"],
                    "source_file": "作答记录.csv",
                    "source_line": source_row.get("_source_line"),
                    "severity": "WARN",
                    "disposition": "scored",
                    "detail": ", ".join(observation["conflicts"]),
                }
            )
    metrics = build_metrics(eligible, items, students)
    observations = build_observations(
        selected,
        eligible,
        students,
        items,
        objectives,
        nodes,
        findings,
        tables["作答记录"],
    )
    source_index, source_checks = build_source_index(
        objectives, resources_dir or settings.resources_dir, list(items.values())
    )

    eligible_keys = {(row.get("记录编号"), row.get("_source_line")) for row in eligible}
    selected_keys = {(row.get("记录编号"), row.get("_source_line")) for row in selected}
    error_keys = {
        (finding.get("record_id"), finding.get("source_line"))
        for finding in findings
        if finding.get("severity") == "ERROR"
        or finding.get("code")
        in {
            "invalid_revision",
            "revision_conflict",
            "event_identity_conflict",
            "missing_event_id",
        }
    }
    selected_by_event = {row.get("作答事件编号") for row in selected}
    dispositions = []
    for row in tables["作答记录"]:
        key = (row.get("记录编号"), row.get("_source_line"))
        if key in eligible_keys:
            disposition = "scored"
        elif key in selected_keys:
            status_disposition = {
                "待评分": "pending",
                "未作答": "unanswered",
            }.get(row.get("评分状态"), "excluded")
            disposition = "excluded" if key in error_keys else status_disposition
        elif row.get("作答事件编号") in selected_by_event:
            disposition = "superseded"
        else:
            disposition = "excluded"
        dispositions.append(
            {
                "record_id": row.get("记录编号") or None,
                "event_id": row.get("作答事件编号") or None,
                "source_file": "作答记录.csv",
                "source_line": row.get("_source_line"),
                "disposition": disposition,
            }
        )
    rows_by_key = {
        (row.get("记录编号"), row.get("_source_line")): row
        for row in tables["作答记录"]
    }
    disposition_by_key = {
        (row["record_id"], row["source_line"]): row["disposition"]
        for row in dispositions
    }
    severity_by_code = {
        "pending": "INFO",
        "unanswered": "INFO",
        "multiple_revisions": "INFO",
        "invalid_revision": "ERROR",
        "revision_conflict": "ERROR",
        "event_identity_conflict": "ERROR",
        "missing_event_id": "ERROR",
    }
    for finding in findings:
        source_key = (finding.get("record_id"), finding.get("source_line"))
        row = rows_by_key.get(source_key, {})
        finding.setdefault("source_file", "作答记录.csv")
        finding.setdefault("event_id", row.get("作答事件编号") or None)
        finding.setdefault("severity", severity_by_code.get(finding["code"], "ERROR"))
        finding.setdefault(
            "disposition", disposition_by_key.get(source_key, "excluded")
        )

    disposition_by_event = {
        row.get("event_id"): row.get("disposition")
        for row in dispositions
        if row.get("event_id") and row.get("disposition") != "superseded"
    }
    event_dispositions = []
    for event_id in events:
        event_dispositions.append(disposition_by_event.get(event_id, "excluded"))

    quality = {
        "raw_rows": len(tables["作答记录"]),
        "events": len(events),
        "selected_revisions": len(selected),
        "eligible_scored": len(eligible),
        "excluded_record_ids": sorted(set(excluded)),
        "record_dispositions": dispositions,
        "disposition_counts": dict(
            Counter(item["disposition"] for item in dispositions)
        ),
        "raw_status_counts": dict(
            Counter(row.get("评分状态", "") for row in tables["作答记录"])
        ),
        "event_disposition_counts": dict(Counter(event_dispositions)),
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
        "rubric_observations": rubric_observations,
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
