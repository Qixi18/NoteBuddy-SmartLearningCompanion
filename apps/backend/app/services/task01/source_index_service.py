"""Build source-index entries for imported learning objectives."""

import json
import re
from pathlib import Path
from typing import Any


_LOCATOR_FIELDS = ("curriculum_locator", "textbook_locator")


def _indicator_check(
    value: Any,
    expected_topic_id: str,
    known_material_ids: set[str] | None = None,
    known_rubric_point_ids: set[str] | None = None,
) -> tuple[dict, str, list[str]]:
    """Validate optional human-reviewed indicator data without inventing it."""
    if value is None or value == {}:
        return {}, "pending", []
    if not isinstance(value, dict):
        return {}, "pending", ["indicator_check_must_be_object"]

    check = value.copy()
    issues: list[str] = []
    status = check.get("status", "pending")
    if not isinstance(status, str) or status not in {"pending", "verified"}:
        issues.append("unsupported_verification_status")
    if check.get("topic_id") != expected_topic_id:
        issues.append("topic_id_missing_or_mismatched")

    for field in ("material_ids", "learning_card_ids", "resource_ids"):
        if field not in check:
            continue
        references = check[field]
        if not isinstance(references, list) or any(
            not isinstance(reference, str) or not reference.strip()
            for reference in references
        ):
            issues.append(f"{field}_must_be_string_list")
            continue
        if len(references) != len(set(references)):
            issues.append(f"duplicate_{field}")
        if known_material_ids is not None and any(
            reference not in known_material_ids for reference in references
        ):
            issues.append(f"unknown_{field}_reference")

    if "rubric_mappings" in check:
        mappings = check["rubric_mappings"]
        if not isinstance(mappings, list):
            issues.append("rubric_mappings_must_be_list")
        else:
            issue_ids = []
            for mapping in mappings:
                if not isinstance(mapping, dict):
                    issues.append("rubric_mapping_must_be_object")
                    continue
                issue_id = mapping.get("issue_id")
                point_ids = mapping.get("rubric_point_ids")
                if not isinstance(issue_id, str) or not issue_id.strip():
                    issues.append("rubric_mapping_issue_id_missing")
                else:
                    issue_ids.append(issue_id)
                if not isinstance(point_ids, list) or any(
                    not isinstance(point_id, str) or not point_id.strip()
                    for point_id in point_ids
                ):
                    issues.append("rubric_mapping_point_ids_invalid")
                    continue
                if len(point_ids) != len(set(point_ids)):
                    issues.append("duplicate_rubric_mapping_point_id")
                if known_rubric_point_ids is not None and any(
                    point_id not in known_rubric_point_ids for point_id in point_ids
                ):
                    issues.append("unknown_rubric_point_reference")
            if len(issue_ids) != len(set(issue_ids)):
                issues.append("duplicate_rubric_mapping_issue_id")

    locator_count = 0
    for field in _LOCATOR_FIELDS:
        if field not in check or check[field] is None:
            continue
        locator = check[field]
        if not isinstance(locator, str) or not locator.strip():
            issues.append(f"{field}_invalid")
        else:
            locator_count += 1

    if status == "verified":
        if locator_count == 0:
            issues.append("verified_mapping_requires_locator")
        if not isinstance(check.get("reviewer"), str) or not check["reviewer"].strip():
            issues.append("verified_mapping_requires_reviewer")
        if (
            not isinstance(check.get("checked_at"), str)
            or not check["checked_at"].strip()
        ):
            issues.append("verified_mapping_requires_checked_at")

    verification = "invalid" if issues else status
    return check, verification, issues


def build_source_index(
    objectives: list[dict], resources_dir: Path, items: list[dict] | None = None
) -> tuple[list[dict], dict]:
    """Combine official objective references with reviewed optional locators.

    Topic notes remain visible for context, but they never promote an unknown
    indicator mapping to verified. Invalid relationships are returned as data
    so callers can surface them without breaking legacy imports.
    """
    checks_path = Path(resources_dir) / "source_checks.json"
    checks = (
        json.loads(checks_path.read_text(encoding="utf-8"))
        if checks_path.exists()
        else {}
    )
    if not isinstance(checks, dict):
        checks = {}
    indicator_checks = checks.get("indicator_checks", {})
    if not isinstance(indicator_checks, dict):
        indicator_checks = {}

    item_rows = items or []
    known_material_ids = {
        row.get("材料编号")
        for row in item_rows
        if isinstance(row.get("材料编号"), str) and row.get("材料编号")
    }
    known_rubric_point_ids = {
        point_id
        for row in item_rows
        for point_id in re.findall(r"[A-Z]+\d+P\d+", str(row.get("评分点", "")))
    }

    objective_counts: dict[str, int] = {}
    for objective in objectives:
        indicator_id = objective.get("指标编号")
        if isinstance(indicator_id, str) and indicator_id:
            objective_counts[indicator_id] = objective_counts.get(indicator_id, 0) + 1

    index = []
    for objective in objectives:
        topic_id = objective.get("主题编号")
        indicator_id = objective.get("指标编号")
        topic_id = topic_id if isinstance(topic_id, str) else ""
        indicator_id = indicator_id if isinstance(indicator_id, str) else ""
        indicator_check, verification, issues = _indicator_check(
            indicator_checks.get(indicator_id, {}),
            topic_id,
            known_material_ids if items is not None else None,
            known_rubric_point_ids if items is not None else None,
        )
        if not topic_id or topic_id not in checks:
            issues.append("topic_source_check_missing")
            verification = "invalid" if verification == "verified" else "pending"
        if objective_counts.get(indicator_id, 0) > 1:
            issues.append("duplicate_indicator_id")
            verification = "invalid"

        index.append(
            {
                "indicator_id": indicator_id,
                "topic_id": topic_id,
                "curriculum_reference": objective.get("课标文件页／正文页"),
                "textbook_reference": objective.get("教材正文页"),
                "source_check": checks.get(topic_id, {})
                if isinstance(checks.get(topic_id, {}), dict)
                else {},
                "indicator_check": indicator_check,
                "verification": verification,
                "integrity_issues": sorted(set(issues)),
            }
        )
    return index, checks
