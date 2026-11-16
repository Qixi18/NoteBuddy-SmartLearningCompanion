from pathlib import Path

from fastapi import APIRouter, Depends

from ..dependencies import get_use_cases
from ...application.use_cases.workbench import WorkbenchUseCases
from ...schemas.http import ImportRequest, ImportResponse

router = APIRouter()


@router.post("/api/import", response_model=ImportResponse, tags=["imports"])
def import_folder(
    payload: ImportRequest, use_cases: WorkbenchUseCases = Depends(get_use_cases)
) -> ImportResponse:
    result = use_cases.import_folder.execute(Path(payload.folder.strip()))
    return ImportResponse(run_id=result["run_id"], quality=result["quality"])
