"""Release preflight and formal competition package export."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response

from ...application.use_cases.workbench import WorkbenchUseCases
from ...schemas.http import SubmissionExportRequest
from ..dependencies import get_use_cases

router = APIRouter()
UseCases = Annotated[WorkbenchUseCases, Depends(get_use_cases)]


@router.get("/api/release-checks", tags=["release"])
def release_checks(
    case_ids: Annotated[list[str], Query(min_length=1)],
    node: str,
    use_cases: UseCases,
    reviewer: str = "",
    content_reviewed: bool = False,
) -> dict:
    result = use_cases.prepare_submission.execute(
        case_ids, node, reviewer, content_reviewed
    )
    return {key: value for key, value in result.items() if not key.startswith("_")}


@router.post("/api/export-submission", tags=["release"])
def export_submission(
    payload: SubmissionExportRequest, use_cases: UseCases
) -> Response:
    archive = use_cases.export_submission.execute(payload.model_dump())
    return Response(
        archive,
        media_type="application/zip",
        headers={
            "Content-Disposition": 'attachment; filename="smart-learning-submission.zip"'
        },
    )
