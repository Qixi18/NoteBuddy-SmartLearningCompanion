from fastapi import APIRouter, Depends

from ..dependencies import get_store
from ...repositories.store import Store
from ...schemas.http import ReviewRecordResponse, ReviewRequest

router = APIRouter()


@router.get(
    "/api/reviews",
    response_model=dict[str, list[ReviewRecordResponse]],
    tags=["reviews"],
)
def reviews(store: Store = Depends(get_store)) -> dict:
    run = store.current()
    return store.reviews(run["run_id"])


@router.post("/api/review", response_model=ReviewRecordResponse, tags=["reviews"])
def save_review(payload: ReviewRequest, store: Store = Depends(get_store)) -> dict:
    run = store.current()
    return store.save_review(
        run["run_id"],
        payload.student_id,
        payload.indicator_id,
        payload.model_dump(exclude={"student_id", "indicator_id"}),
    )
