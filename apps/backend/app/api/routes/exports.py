from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response

from ..dependencies import get_use_cases
from ...application.use_cases.workbench import WorkbenchUseCases

router = APIRouter()


@router.get("/api/export", tags=["exports"])
def export(
    cases: str = Query(default=""),
    use_cases: WorkbenchUseCases = Depends(get_use_cases),
) -> Response:
    payload = use_cases.export_package.execute(cases.split(",") if cases else [])
    return Response(payload, media_type="application/zip")
