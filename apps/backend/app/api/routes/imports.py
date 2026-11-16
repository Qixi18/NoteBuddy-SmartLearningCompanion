from pathlib import Path

from fastapi import APIRouter, Depends

from ..dependencies import get_store
from ...repositories.store import Store
from ...schemas.http import ImportRequest, ImportResponse

router = APIRouter()


@router.post("/api/import", response_model=ImportResponse, tags=["imports"])
def import_folder(
    payload: ImportRequest, store: Store = Depends(get_store)
) -> ImportResponse:
    result = store.import_folder(Path(payload.folder.strip()))
    return ImportResponse(run_id=result["run_id"], quality=result["quality"])
