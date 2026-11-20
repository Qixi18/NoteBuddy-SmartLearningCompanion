#!/usr/bin/env python3
"""Offline, manifest-bound evaluator for frozen competition cases.

The evaluator checks scope, evidence references, permitted materials and
case-level required/prohibited claims. It deliberately does not score prose
quality or replace subject-matter review.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any

EVALUATOR_VERSION = "1.0.0"


class EvaluationError(ValueError):
    pass


def canonical_json(value: Any) -> bytes:
    return json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def load_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise EvaluationError(f"cannot read JSON file {path}: {exc}") from exc


def evaluate_case(
    case: dict[str, Any], candidate: dict[str, Any] | None
) -> dict[str, Any]:
    failures: list[str] = []
    if candidate is None:
        return {
            "case_id": case["case_id"],
            "status": "missing",
            "failures": ["candidate case missing"],
        }

    expected = case["expected"]
    expected_scope = case["scope"]
    actual_scope = candidate.get("scope")
    if actual_scope != expected_scope:
        failures.append("scope does not match frozen case")

    allowed_evidence = set(expected["allowed_evidence_ids"])
    actual_evidence = set(candidate.get("evidence_ids", []))
    if not actual_evidence.issubset(allowed_evidence):
        failures.append("candidate references evidence outside the frozen scope")
    missing_evidence = set(expected.get("required_evidence_ids", [])) - actual_evidence
    if missing_evidence:
        failures.append(
            "required evidence missing: " + ", ".join(sorted(missing_evidence))
        )

    allowed_materials = set(expected["allowed_material_ids"])
    actual_materials = set(candidate.get("material_ids", []))
    if not actual_materials.issubset(allowed_materials):
        failures.append("candidate selects a material outside the approved set")
    missing_materials = (
        set(expected.get("required_material_ids", [])) - actual_materials
    )
    if missing_materials:
        failures.append(
            "required material missing: " + ", ".join(sorted(missing_materials))
        )

    claim_ids = set(candidate.get("claim_ids", []))
    missing_claims = set(expected.get("required_claim_ids", [])) - claim_ids
    if missing_claims:
        failures.append("required claim missing: " + ", ".join(sorted(missing_claims)))
    forbidden_claims = set(expected.get("forbidden_claim_ids", [])) & claim_ids
    if forbidden_claims:
        failures.append(
            "prohibited claim present: " + ", ".join(sorted(forbidden_claims))
        )

    return {
        "case_id": case["case_id"],
        "status": "pass" if not failures else "fail",
        "failures": failures,
    }


def validate_manifest(manifest: Any) -> list[dict[str, Any]]:
    if not isinstance(manifest, dict) or manifest.get("schema_version") != "1.0":
        raise EvaluationError("manifest schema_version must be 1.0")
    if manifest.get("dataset_kind") not in {
        "synthetic",
        "public",
        "official",
        "private",
    }:
        raise EvaluationError(
            "dataset_kind must be synthetic, public, official or private"
        )
    cases = manifest.get("cases")
    if not isinstance(cases, list) or not cases:
        raise EvaluationError("manifest cases must be a non-empty list")
    if manifest.get("cases_sha256") != sha256_bytes(canonical_json(cases)):
        raise EvaluationError("cases_sha256 mismatch; frozen manifest was changed")
    ids = [case.get("case_id") for case in cases if isinstance(case, dict)]
    if (
        len(ids) != len(cases)
        or len(set(ids)) != len(ids)
        or any(not item for item in ids)
    ):
        raise EvaluationError("every case must have a unique non-empty case_id")
    for case in cases:
        if not all(key in case for key in ("scope", "expected")):
            raise EvaluationError(
                f"case {case['case_id']} must define scope and expected"
            )
        expected = case["expected"]
        for key in ("allowed_evidence_ids", "allowed_material_ids"):
            if not isinstance(expected.get(key), list):
                raise EvaluationError(
                    f"case {case['case_id']} expected.{key} must be a list"
                )
    return cases


def run_evaluation(
    manifest: dict[str, Any], candidate: dict[str, Any]
) -> dict[str, Any]:
    cases = validate_manifest(manifest)
    if not isinstance(candidate, dict) or not isinstance(candidate.get("cases"), dict):
        raise EvaluationError("candidate must contain a cases object keyed by case_id")
    known_ids = {case["case_id"] for case in cases}
    candidate_cases = candidate["cases"]
    unknown = set(candidate_cases) - known_ids
    results = [
        evaluate_case(case, candidate_cases.get(case["case_id"])) for case in cases
    ]
    failures = [result for result in results if result["status"] != "pass"]
    if unknown:
        failures.append(
            {
                "case_id": None,
                "status": "fail",
                "failures": [
                    "candidate contains unknown case ids: " + ", ".join(sorted(unknown))
                ],
            }
        )
    return {
        "schema_version": "1.0",
        "evaluator_version": EVALUATOR_VERSION,
        "dataset_id": manifest.get("dataset_id"),
        "dataset_kind": manifest["dataset_kind"],
        "candidate_id": candidate.get("candidate_id", "unnamed"),
        "candidate_version": candidate.get("version"),
        "cases_sha256": manifest["cases_sha256"],
        "candidate_sha256": sha256_bytes(canonical_json(candidate)),
        "summary": {
            "total": len(cases),
            "passed": sum(result["status"] == "pass" for result in results),
            "failed": sum(result["status"] == "fail" for result in results)
            + bool(unknown),
            "missing": sum(result["status"] == "missing" for result in results),
            "unknown_candidate_cases": len(unknown),
            "subject_matter_review": "required",
        },
        "results": results + ([failures[-1]] if unknown else []),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--candidate", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    try:
        manifest = load_json(args.manifest)
        candidate = load_json(args.candidate)
        report = run_evaluation(manifest, candidate)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        print(json.dumps(report["summary"], ensure_ascii=False))
        return (
            0
            if report["summary"]["failed"] == 0 and report["summary"]["missing"] == 0
            else 1
        )
    except EvaluationError as exc:
        print(f"evaluation error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
