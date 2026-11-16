from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response

from ..dependencies import get_store
from ...repositories.store import Store
from ...services.exports import package

router = APIRouter()


@router.get("/api/export", tags=["exports"])
def export(
    cases: str = Query(default=""), store: Store = Depends(get_store)
) -> Response:
    run = store.current()
    payload = package(
        run, store.reviews(run["run_id"]), cases.split(",") if cases else []
    )
    return Response(payload, media_type="application/zip")
