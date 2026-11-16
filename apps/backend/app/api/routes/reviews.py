from fastapi import APIRouter, Depends

from ..dependencies import get_use_cases
from ...application.use_cases.workbench import WorkbenchUseCases
from ...schemas.http import ReviewRecordResponse, ReviewRequest

router = APIRouter()


@router.get(
    "/api/reviews",
    response_model=dict[str, list[ReviewRecordResponse]],
    tags=["reviews"],
)
def reviews(use_cases: WorkbenchUseCases = Depends(get_use_cases)) -> dict:
    return use_cases.list_reviews.execute()


@router.post("/api/review", response_model=ReviewRecordResponse, tags=["reviews"])
def save_review(
    payload: ReviewRequest,
    use_cases: WorkbenchUseCases = Depends(get_use_cases),
) -> dict:
    run = use_cases.current_run.execute()
    return use_cases.save_review.execute(
        run["run_id"],
        payload.student_id,
        payload.indicator_id,
        payload.model_dump(exclude={"student_id", "indicator_id"}),
    )
