from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response

from ..dependencies import get_use_cases
from ...application.use_cases.workbench import WorkbenchUseCases
from ...schemas.http import (
    AnalysisRunResponse,
    CaseSuggestionResponse,
    DraftResponse,
)

router = APIRouter()


@router.get("/api/run", response_model=AnalysisRunResponse, tags=["analysis"])
def current_run(use_cases: WorkbenchUseCases = Depends(get_use_cases)) -> dict:
    return use_cases.current_run.execute()


@router.get(
    "/api/cases", response_model=list[CaseSuggestionResponse], tags=["analysis"]
)
def cases(use_cases: WorkbenchUseCases = Depends(get_use_cases)) -> list[dict]:
    return use_cases.list_cases.execute()


@router.get("/api/draft", response_model=DraftResponse, tags=["recommendations"])
def rule_draft(
    student: str = Query(min_length=1),
    indicator: str = Query(min_length=1),
    use_cases: WorkbenchUseCases = Depends(get_use_cases),
) -> dict:
    return use_cases.rule_draft.execute(student, indicator)


@router.get("/api/source", tags=["sources"])
def source(
    file: str = Query(min_length=1),
    use_cases: WorkbenchUseCases = Depends(get_use_cases),
) -> Response:
    return Response(
        use_cases.read_source_pdf.execute(file), media_type="application/pdf"
    )
