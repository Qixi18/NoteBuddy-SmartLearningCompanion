from __future__ import annotations

import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "competition_evaluator", ROOT / "scripts" / "evaluate_competition.py"
)
assert SPEC and SPEC.loader
evaluator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(evaluator)


def fixture_data() -> tuple[dict, dict]:
    folder = ROOT / "tests" / "fixtures" / "competition"
    return json.loads(
        (folder / "manifest.json").read_text(encoding="utf-8")
    ), json.loads((folder / "candidate-reference.json").read_text(encoding="utf-8"))


def test_synthetic_frozen_set_has_36_range_cases_and_edge_cases() -> None:
    manifest, candidate = fixture_data()
    cases = evaluator.validate_manifest(manifest)
    assert len([case for case in cases if case["case_id"].startswith("R")]) == 36
    assert len(cases) == 45
    report = evaluator.run_evaluation(manifest, candidate)
    assert report["summary"] == {
        "total": 45,
        "passed": 45,
        "failed": 0,
        "missing": 0,
        "unknown_candidate_cases": 0,
        "subject_matter_review": "required",
    }
    assert report["dataset_kind"] == "synthetic"


def test_frozen_case_digest_rejects_manifest_edits() -> None:
    manifest, _ = fixture_data()
    manifest["cases"][0]["expected"]["allowed_material_ids"].append("MAT-UNREVIEWED")
    try:
        evaluator.validate_manifest(manifest)
    except evaluator.EvaluationError as exc:
        assert "cases_sha256 mismatch" in str(exc)
    else:
        raise AssertionError("changed frozen cases must be rejected")


def test_scope_evidence_and_material_leaks_fail_case() -> None:
    manifest, candidate = fixture_data()
    row = candidate["cases"]["R01"]
    row["scope"] = {**row["scope"], "student_id": "SYN-OTHER"}
    row["evidence_ids"].append("EV-OTHER-STUDENT")
    row["material_ids"].append("MAT-NOT-APPROVED")
    report = evaluator.run_evaluation(manifest, candidate)
    result = next(item for item in report["results"] if item["case_id"] == "R01")
    assert result["status"] == "fail"
    assert len(result["failures"]) == 3


def test_missing_required_evidence_and_forbidden_claim_fail() -> None:
    manifest, candidate = fixture_data()
    candidate["cases"]["E04"]["evidence_ids"] = []
    candidate["cases"]["E04"]["claim_ids"].append("CLAIM-MASTERY")
    result = next(
        item
        for item in evaluator.run_evaluation(manifest, candidate)["results"]
        if item["case_id"] == "E04"
    )
    assert result["status"] == "fail"
    assert any("required evidence missing" in issue for issue in result["failures"])
    assert any("prohibited claim present" in issue for issue in result["failures"])


def test_missing_and_unknown_candidate_cases_are_reported() -> None:
    manifest, candidate = fixture_data()
    del candidate["cases"]["R02"]
    candidate["cases"]["NOT-IN-MANIFEST"] = {}
    report = evaluator.run_evaluation(manifest, candidate)
    assert report["summary"]["missing"] == 1
    assert report["summary"]["unknown_candidate_cases"] == 1
    assert report["summary"]["failed"] == 1
