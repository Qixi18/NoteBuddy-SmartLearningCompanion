from typing import Annotated

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response

from ...application.use_cases.workbench import WorkbenchUseCases
from ...schemas.http import (
    AnalysisRunResponse,
    CaseSuggestionResponse,
    DraftResponse,
    EvidenceBundleResponse,
)
from ..dependencies import get_use_cases

router = APIRouter()
UseCases = Annotated[WorkbenchUseCases, Depends(get_use_cases)]


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


@router.get("/api/run", response_model=AnalysisRunResponse, tags=["analysis"])
def current_run(use_cases: UseCases) -> dict:
    return use_cases.current_run.execute()


@router.get(
    "/api/cases", response_model=list[CaseSuggestionResponse], tags=["analysis"]
)
def cases(use_cases: UseCases) -> list[dict]:
    return use_cases.list_cases.execute()


@router.get("/api/draft", response_model=DraftResponse, tags=["recommendations"])
def rule_draft(
    use_cases: UseCases,
    student: str = Query(min_length=1),
    indicator: str = Query(min_length=1),
    node: str | None = Query(default=None, min_length=1),
) -> dict:
    return use_cases.rule_draft.execute(student, indicator, node)


@router.get("/api/source", tags=["sources"])
def source(
    use_cases: UseCases,
    file: str = Query(min_length=1),
) -> Response:
    return Response(
        use_cases.read_source_pdf.execute(file), media_type="application/pdf"
    )
