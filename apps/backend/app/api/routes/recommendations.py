from fastapi import APIRouter, Depends

from ..dependencies import get_settings, get_store
from ...config import Settings
from ...repositories.store import Store
from ...schemas.http import DraftRequest, DraftResponse
from ...services.recommendations import deepseek_draft

router = APIRouter()


@router.post("/api/deepseek", response_model=DraftResponse, tags=["recommendations"])
def model_draft(
    payload: DraftRequest,
    store: Store = Depends(get_store),
    config: Settings = Depends(get_settings),
) -> dict:
    return deepseek_draft(
        store.current(),
        payload.student_id,
        payload.indicator_id,
        config.deepseek_api_key,
        config.deepseek_model,
    )
