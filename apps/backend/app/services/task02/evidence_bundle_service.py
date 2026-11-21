"""Build deterministic, server-owned evidence bundles for one analysis scope."""

import hashlib
import json
import re

from ...domain.assessment.evidence_bundle import AnalysisScope

_RUBRIC_LINE = re.compile(r"^([A-Z]+\d+P\d+)\s+(.+?)\s+(\d+)\s*分$")


def _canonical_hash(value: object) -> str:
    payload = json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _rubric_definitions(item: dict) -> list[dict]:
    definitions = []
    for line in re.split(r"[\r\n]+", str(item.get("评分点", ""))):
        match = _RUBRIC_LINE.fullmatch(line.strip())
        if match:
            point_id, description, maximum = match.groups()
            definitions.append(
                {
                    "point_id": point_id,
                    "item_id": item["材料编号"],
                    "description": description.strip(),
                    "maximum": int(maximum),
                }
            )
    return definitions


def build_evidence_bundle(
    run: dict, scope: AnalysisScope, sources: dict[str, list[dict]]
) -> dict:
    if run.get("run_id") != scope.run_id:
        raise ValueError("证据范围与当前运行不匹配")
    if scope.student_id not in {row.get("学生编号") for row in run.get("students", [])}:
        raise ValueError("学生编号不存在")
    if scope.indicator_id not in {
        row.get("指标编号") for row in run.get("objectives", [])
    }:
        raise ValueError("指标编号不存在")
    node = next(
        (row for row in run.get("nodes", []) if row.get("节点编号") == scope.node_id),
        None,
    )
    if node is None:
        raise ValueError("测验节点不存在")

    available_ids = {
        value.strip()
        for value in re.split(r"[，,、;；\s]+", str(node.get("可用题目编号", "")))
        if value.strip()
    }
    scoped_items = [
        item
        for item in run.get("items", [])
        if item.get("材料编号") in available_ids
        and item.get("指标编号") == scope.indicator_id
    ]
    item_ids = {item["材料编号"] for item in scoped_items}
    items = [
        {
            "material_id": item["材料编号"],
            "prompt": item.get("题干或内容", ""),
            "maximum": item.get("满分", ""),
            "rubric": item.get("评分点", ""),
        }
        for item in scoped_items
    ]
    dispositions = {
        (entry.get("record_id"), entry.get("source_line")): entry.get(
            "disposition", "unknown"
        )
        for entry in run.get("quality", {}).get("record_dispositions", [])
    }
    observations = {
        entry.get("record_id"): entry for entry in run.get("rubric_observations", [])
    }
    scoped_rows = [
        row
        for row in run.get("raw_responses", [])
        if row.get("学生编号") == scope.student_id
        and row.get("节点编号") == scope.node_id
        and row.get("材料编号") in item_ids
    ]
    responses = []
    for row in scoped_rows:
        disposition = dispositions.get(
            (row.get("记录编号"), row.get("_source_line")), "unknown"
        )
        responses.append(
            {
                "kind": "response",
                "evidence_id": f"response:{_canonical_hash({'scope': scope.__dict__, 'record_id': row.get('记录编号'), 'source_line': row.get('_source_line')})}",
                "record_id": row.get("记录编号"),
                "event_id": row.get("作答事件编号"),
                "source_line": row.get("_source_line"),
                "student_id": row.get("学生编号"),
                # Raw contest response files do not carry indicator IDs; the
                # scoped item catalog above is the authoritative relationship.
                "indicator_id": scope.indicator_id,
                "node_id": row.get("节点编号"),
                "material_id": row.get("材料编号"),
                "state": row.get("评分状态", "unknown"),
                "score": row.get("得分") or None if disposition == "scored" else None,
                "maximum": row.get("满分") or None,
                "raw_response": row.get("学生最终作答", row.get("原始作答", "")),
                "solution_steps": row.get("解答过程", ""),
                "disposition": disposition,
                "rubric_observation": observations.get(row.get("记录编号")),
            }
        )
    expected_material_ids = sorted(item_ids)
    observed_material_ids = sorted({row["material_id"] for row in responses})
    unobserved_material_ids = sorted(
        set(expected_material_ids) - set(observed_material_ids)
    )
    source_history = sources.get(scope.indicator_id, [])
    latest_source = source_history[-1] if source_history else None
    objective = next(
        (
            row
            for row in run.get("objectives", [])
            if row.get("指标编号") == scope.indicator_id
        ),
        {},
    )
    source_versions = (
        {scope.indicator_id: latest_source.get("version", 0)} if latest_source else {}
    )
    source_context = {
        "status": latest_source.get("status", "pending")
        if latest_source
        else "pending",
        "stale": bool(latest_source.get("stale")) if latest_source else False,
        "topic_id": objective.get("主题编号", ""),
        "material_ids": latest_source.get("material_ids", [])
        if latest_source
        and latest_source.get("status") == "verified"
        and not latest_source.get("stale")
        else [],
        "resource_links": latest_source.get("resource_links", [])
        if latest_source
        and latest_source.get("status") == "verified"
        and not latest_source.get("stale")
        else [],
        "rubric_mappings": latest_source.get("rubric_mappings", [])
        if latest_source
        and latest_source.get("status") == "verified"
        and not latest_source.get("stale")
        else [],
    }
    coverage_basis = {
        "scope": scope.__dict__,
        "expected_material_ids": expected_material_ids,
        "observed_material_ids": observed_material_ids,
        "record_count": len(responses),
        "scored_record_count": sum(
            row.get("disposition") == "scored" for row in responses
        ),
        "record_disposition_counts": {
            state: sum(row.get("disposition") == state for row in responses)
            for state in sorted(
                {row.get("disposition", "unknown") for row in responses}
            )
        },
    }
    coverage = {
        **coverage_basis,
        "unobserved_material_ids": unobserved_material_ids,
        "unknown_reason": "no_response_records_in_scope" if not responses else None,
        "evidence_id": f"coverage:{_canonical_hash(coverage_basis)}",
    }
    rubric_definitions = [
        definition for item in scoped_items for definition in _rubric_definitions(item)
    ]
    issues = [
        {
            "code": finding.get("code"),
            "record_id": finding.get("record_id"),
            "source_line": finding.get("source_line"),
            "severity": finding.get("severity"),
            "detail": finding.get("detail"),
        }
        for finding in run.get("quality", {}).get("findings", [])
        if any(
            finding.get("record_id") == response.get("record_id")
            and finding.get("source_line") == response.get("source_line")
            for response in responses
        )
    ]
    fingerprint_basis = {
        "scope": scope.__dict__,
        "responses": responses,
        "items": items,
        "rubric_definitions": rubric_definitions,
        "coverage": coverage,
        "source_versions": source_versions,
        "source_context": source_context,
        "issues": issues,
    }
    return {
        **fingerprint_basis,
        "fingerprint": _canonical_hash(fingerprint_basis),
    }
