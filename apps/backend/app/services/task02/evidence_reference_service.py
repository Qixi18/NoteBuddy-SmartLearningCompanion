"""Server-side validation for scoped, non-record coverage references."""

from __future__ import annotations

from ...domain.assessment.evidence_bundle import AnalysisScope
from .evidence_bundle_service import build_evidence_bundle


def coverage_reference(bundle: dict) -> dict:
    """Return the portable reference for one evidence bundle's coverage."""
    return {
        "kind": "coverage",
        "evidence_id": bundle.get("coverage", {}).get("evidence_id", ""),
        "scope": dict(bundle.get("scope", {})),
    }


def validate_coverage_reference(run: dict, reference: dict) -> dict:
    """Recompute and validate a no-response coverage citation for this run."""
    if not isinstance(reference, dict) or reference.get("kind") != "coverage":
        raise ValueError("覆盖证据引用类型无效")
    scope_data = reference.get("scope")
    if not isinstance(scope_data, dict):
        raise ValueError("覆盖证据范围无效")  # noqa: TRY004
    try:
        scope = AnalysisScope(**scope_data)
        bundle = build_evidence_bundle(run, scope, {})
    except (TypeError, KeyError, ValueError) as exc:
        raise ValueError("覆盖证据不属于当前运行或范围") from exc
    coverage = bundle.get("coverage", {})
    scored_count = coverage.get("scored_record_count")
    if scored_count is None:
        scored_count = coverage.get("record_count", 0)
    if scored_count != 0:
        raise ValueError("当前范围存在有效已评分证据，不能改用覆盖证据")
    if reference.get("evidence_id") != coverage.get("evidence_id"):
        raise ValueError("覆盖证据已过期或运行哈希不匹配")
    return coverage_reference(bundle)


def validate_evidence_reference(run: dict, reference: dict) -> dict:
    """Recompute one response or coverage reference against a stored run."""
    if not isinstance(reference, dict):
        raise ValueError("证据引用格式无效")  # noqa: TRY004
    if reference.get("kind") == "coverage":
        return validate_coverage_reference(run, reference)
    if reference.get("kind") != "response":
        raise ValueError("证据引用类型无效")
    scope_data = reference.get("scope")
    if not isinstance(scope_data, dict):
        raise ValueError("作答证据范围无效")  # noqa: TRY004
    try:
        scope = AnalysisScope(**scope_data)
        bundle = build_evidence_bundle(run, scope, {})
    except (TypeError, KeyError, ValueError) as exc:
        raise ValueError("作答证据不属于当前运行或范围") from exc
    match = next(
        (
            response
            for response in bundle["responses"]
            if response["evidence_id"] == reference.get("evidence_id")
        ),
        None,
    )
    if (
        not match
        or match.get("record_id") != reference.get("record_id")
        or match.get("source_line") != reference.get("source_line")
    ):
        raise ValueError("作答证据已过期或引用来源不匹配")
    return {
        "kind": "response",
        "evidence_id": match["evidence_id"],
        "record_id": match["record_id"],
        "source_line": match["source_line"],
        "scope": dict(scope_data),
    }


def validate_evidence_references(run: dict, references: list[dict]) -> list[dict]:
    if not isinstance(references, list):
        raise ValueError("证据引用列表格式无效")  # noqa: TRY004
    checked = [validate_evidence_reference(run, reference) for reference in references]
    keys = [(reference["kind"], reference["evidence_id"]) for reference in checked]
    if len(keys) != len(set(keys)):
        raise ValueError("证据引用不能重复")
    return checked
