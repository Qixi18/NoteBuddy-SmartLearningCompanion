from typing import Annotated

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response

from ...application.use_cases.workbench import WorkbenchUseCases
from ...schemas.http import (
    AnalysisRunResponse,
    CaseSuggestionResponse,
    ClassInsightsResponse,
    DraftResponse,
    EvidenceBundleResponse,
    ResourceSelectionResponse,
    StudentInsightsResponse,
)
from ..dependencies import get_use_cases

router = APIRouter()
UseCases = Annotated[WorkbenchUseCases, Depends(get_use_cases)]


@router.get(
    "/api/class-insights",
    response_model=ClassInsightsResponse,
    tags=["analysis"],
)
def class_insights(
    use_cases: UseCases,
    node: str = Query(min_length=1),
) -> dict:
    return use_cases.class_insights.execute(node)


@router.get(
    "/api/evidence-bundle",
    response_model=EvidenceBundleResponse,
    tags=["analysis"],
)
def evidence_bundle(
    use_cases: UseCases,
    student: str = Query(min_length=1),
    indicator: str = Query(min_length=1),
    node: str = Query(min_length=1),
) -> dict:
    return use_cases.evidence_bundle.execute(student, indicator, node)


@router.get(
    "/api/student-insights",
    response_model=StudentInsightsResponse,
    tags=["analysis"],
)
def student_insights(
    use_cases: UseCases,
    student: str = Query(min_length=1),
    indicator: str = Query(min_length=1),
    node: str = Query(min_length=1),
) -> dict:
    return use_cases.student_insights.execute(student, indicator, node)


@router.get("/api/run", response_model=AnalysisRunResponse, tags=["analysis"])
def current_run(use_cases: UseCases) -> dict:
    return use_cases.current_run.execute()


@router.get(
    "/api/cases", response_model=list[CaseSuggestionResponse], tags=["analysis"]
)
def cases(
    use_cases: UseCases, node: str | None = Query(default=None, min_length=1)
) -> list[dict]:
    return use_cases.list_cases.execute(node_id=node)


@router.get("/api/draft", response_model=DraftResponse, tags=["recommendations"])
def rule_draft(
    use_cases: UseCases,
    student: str = Query(min_length=1),
    indicator: str = Query(min_length=1),
    node: str | None = Query(default=None, min_length=1),
) -> dict:
    result = use_cases.rule_draft.execute(student, indicator, node)
    if result.get("resource_selection"):
        result["resource_selection"] = ResourceSelectionResponse.model_validate(
            result["resource_selection"]
        ).model_dump()
    if result.get("teaching_plan_preview"):
        from ...schemas.http import TeachingPlanV2Payload

        result["teaching_plan_preview"] = TeachingPlanV2Payload.model_validate(
            result["teaching_plan_preview"]
        ).model_dump()
    return result


@router.get("/api/source", tags=["sources"])
def source(
    use_cases: UseCases,
    file: str = Query(min_length=1),
) -> Response:
    return Response(
        use_cases.read_source_pdf.execute(file), media_type="application/pdf"
    )
