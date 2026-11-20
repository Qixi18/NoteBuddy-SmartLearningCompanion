"""Routes for direct, evidence-linked AI analysis results."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from ...application.use_cases.workbench import WorkbenchUseCases
from ...schemas.http import (
    AIAnalysisLookupResponse,
    AIAnalysisRequest,
    AIAnalysisResponse,
)
from ..dependencies import get_use_cases

router = APIRouter()
UseCases = Annotated[WorkbenchUseCases, Depends(get_use_cases)]


@router.post(
    "/api/ai-analysis",
    response_model=AIAnalysisResponse,
    tags=["ai-analysis"],
)
def generate_ai_analysis(payload: AIAnalysisRequest, use_cases: UseCases) -> dict:
    return use_cases.ai_analysis.execute(
        task=payload.task,
        run_id=payload.run_id,
        node_id=payload.node_id,
        student_id=payload.student_id,
        indicator_id=payload.indicator_id,
        action=payload.action,
        request_id=payload.request_id,
        analysis_id=payload.analysis_id,
    )


@router.get(
    "/api/ai-analysis",
    response_model=AIAnalysisLookupResponse,
    tags=["ai-analysis"],
)
def latest_ai_analysis(
    use_cases: UseCases,
    task: Annotated[str, Query(pattern="^task0[123]$")],
    run_id: str | None = Query(default=None, min_length=1),
    node_id: str | None = Query(default=None, min_length=1),
    student_id: str | None = Query(default=None, min_length=1),
    indicator_id: str | None = Query(default=None, min_length=1),
) -> dict:
    return use_cases.ai_analysis.preview(
        task, run_id, node_id, student_id, indicator_id
    )
