import json
from pathlib import Path

import pytest
from app.schemas.http import (
    AnalysisRunResponse,
    ErrorResponse,
    EvidenceBundleResponse,
    HealthResponse,
    ImportFilesRequest,
    ReviewRecordResponse,
    ReviewRequest,
    SourceVerificationRequest,
    SourceVerificationResponse,
    TeacherCaseRequest,
    TeacherCaseResponse,
)
from pydantic import ValidationError


def test_shared_frontend_backend_contract_fixtures():
    root = Path(__file__).resolve().parents[3]
    health = json.loads(
        (root / "contracts/api/health.json").read_text(encoding="utf-8")
    )
    error = json.loads((root / "contracts/api/error.json").read_text(encoding="utf-8"))
    review_request = json.loads(
        (root / "contracts/api/review-request.json").read_text(encoding="utf-8")
    )
    review_success = json.loads(
        (root / "contracts/api/review-success.json").read_text(encoding="utf-8")
    )
    analysis_run = json.loads(
        (root / "contracts/api/analysis-run.json").read_text(encoding="utf-8")
    )
    source_verification = json.loads(
        (root / "contracts/api/source-verification.json").read_text(encoding="utf-8")
    )
    source_mapping_v2 = json.loads(
        (root / "contracts/source-mapping-v2.json").read_text(encoding="utf-8")
    )
    evidence_bundle = json.loads(
        (root / "contracts/api/evidence-bundle.json").read_text(encoding="utf-8")
    )
    teacher_case = json.loads(
        (root / "contracts/api/teacher-case.json").read_text(encoding="utf-8")
    )
    assert HealthResponse.model_validate(health).model_dump() == health
    assert ErrorResponse.model_validate(error).model_dump() == error
    assert ReviewRequest.model_validate(review_request).model_dump() == review_request
    assert (
        ReviewRecordResponse.model_validate(review_success).model_dump()
        == review_success
    )
    assert AnalysisRunResponse.model_validate(analysis_run).model_dump() == analysis_run
    assert (
        EvidenceBundleResponse.model_validate(evidence_bundle).model_dump()
        == evidence_bundle
    )
    assert (
        SourceVerificationRequest.model_validate(source_verification).model_dump()
        == source_verification
    )
    assert (
        SourceVerificationRequest.model_validate(
            {
                **source_verification,
                **source_mapping_v2,
            }
        )
        .resource_links[0]
        .material_id
        == "TB01"
    )
    assert source_verification["rubric_mappings"][0]["status"] == "verified"
    assert TeacherCaseRequest.model_validate(teacher_case).model_dump() == teacher_case
    assert (
        SourceVerificationResponse.model_validate(
            {
                **source_verification,
                "run_id": "0123456789abcdef",
                "version": 1,
                "reviewed_at": "2026-11-19T00:00:00Z",
            }
        ).version
        == 1
    )
    assert (
        TeacherCaseResponse.model_validate(
            {
                **teacher_case,
                "run_id": "0123456789abcdef",
                "version": 1,
                "reviewed_at": "2026-11-19T00:00:00Z",
            }
        ).version
        == 1
    )


def test_legacy_quality_contract_remains_valid_without_disposition_fields():
    from app.schemas.http import QualityReportResponse

    legacy = {
        "raw_rows": 0,
        "events": 0,
        "selected_revisions": 0,
        "eligible_scored": 0,
        "excluded_record_ids": [],
        "finding_counts": {},
        "findings": [],
    }
    parsed = QualityReportResponse.model_validate(legacy)
    assert parsed.record_dispositions == []


def test_import_files_rejects_csv_content_over_16_mib():
    with pytest.raises(ValidationError, match="16 MiB"):
        ImportFilesRequest(files={"作答记录.csv": "x" * (16 * 1024 * 1024 + 1)})
