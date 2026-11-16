from fastapi import APIRouter, Depends

from ..dependencies import get_use_cases
from ...application.use_cases.workbench import WorkbenchUseCases
from ...schemas.http import DraftRequest, DraftResponse

router = APIRouter()


@router.post("/api/deepseek", response_model=DraftResponse, tags=["recommendations"])
def model_draft(
    payload: DraftRequest,
    use_cases: WorkbenchUseCases = Depends(get_use_cases),
) -> dict:
    return use_cases.deepseek_draft.execute(
        payload.student_id, payload.indicator_id, payload.node_id
    )
