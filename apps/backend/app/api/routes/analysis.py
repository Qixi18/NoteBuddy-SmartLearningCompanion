from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response

from ..dependencies import get_store
from ...repositories.store import Store
from ...schemas.http import (
    AnalysisRunResponse,
    CaseSuggestionResponse,
    DraftResponse,
)
from ...services.cases import suggest_cases
from ...services.recommendations import draft

router = APIRouter()


@router.get("/api/run", response_model=AnalysisRunResponse, tags=["analysis"])
def current_run(store: Store = Depends(get_store)) -> dict:
    return store.current()


@router.get(
    "/api/cases", response_model=list[CaseSuggestionResponse], tags=["analysis"]
)
def cases(store: Store = Depends(get_store)) -> list[dict]:
    return suggest_cases(store.current())


@router.get("/api/draft", response_model=DraftResponse, tags=["recommendations"])
def rule_draft(
    student: str = Query(min_length=1),
    indicator: str = Query(min_length=1),
    store: Store = Depends(get_store),
) -> dict:
    return draft(store.current(), student, indicator)


@router.get("/api/source", tags=["sources"])
def source(
    file: str = Query(min_length=1), store: Store = Depends(get_store)
) -> Response:
    return Response(
        store.read_source(store.current(), file), media_type="application/pdf"
    )
