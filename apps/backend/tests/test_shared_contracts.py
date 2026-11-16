import json
from pathlib import Path

from app.schemas.http import (
    ErrorResponse,
    HealthResponse,
    ReviewRecordResponse,
    ReviewRequest,
)


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
    assert HealthResponse.model_validate(health).model_dump() == health
    assert ErrorResponse.model_validate(error).model_dump() == error
    assert ReviewRequest.model_validate(review_request).model_dump() == review_request
    assert (
        ReviewRecordResponse.model_validate(review_success).model_dump()
        == review_success
    )
