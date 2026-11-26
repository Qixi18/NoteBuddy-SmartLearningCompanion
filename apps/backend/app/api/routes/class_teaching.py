"""班级教学方案路由：查询、生成草稿、保存教师审核。"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from ...application.use_cases.workbench import WorkbenchUseCases
from ...schemas.http import (
    ClassTeachingAdjustmentCreateRequest,
    ClassTeachingAdjustmentUpdateRequest,
    ClassTeachingPlanDraftRequest,
    ClassTeachingPlanReviewRequest,
)
from ..dependencies import get_use_cases

router = APIRouter()
UseCases = Annotated[WorkbenchUseCases, Depends(get_use_cases)]


@router.get("/api/class-teaching-plans", tags=["class-teaching"])
def list_class_teaching_plans(
    node: str,
    use_cases: UseCases,
    class_id: str = Query(alias="class", min_length=1, max_length=128),
) -> dict:
    return use_cases.class_teaching_plans.list(class_id, node)


@router.post("/api/class-teaching-plans/draft", tags=["class-teaching"])
def draft_class_teaching_plan(
    payload: ClassTeachingPlanDraftRequest, use_cases: UseCases
) -> dict:
    return use_cases.class_teaching_plans.draft(
        payload.class_id, payload.node_id, payload.reviewer
    )


@router.post("/api/class-teaching-plans/{plan_id}/review", tags=["class-teaching"])
def review_class_teaching_plan(
    plan_id: str, payload: ClassTeachingPlanReviewRequest, use_cases: UseCases
) -> dict:
    return use_cases.class_teaching_plans.review(plan_id, payload.model_dump())


@router.get("/api/class-teaching-adjustments", tags=["class-teaching"])
def list_class_adjustments(
    node: str,
    use_cases: UseCases,
    class_id: str = Query(alias="class", min_length=1, max_length=128),
) -> list[dict]:
    return use_cases.class_teaching_adjustments.list(class_id, node)


@router.get("/api/class-evidence", tags=["class-teaching"])
def class_evidence(
    node: str,
    use_cases: UseCases,
    class_id: str = Query(alias="class", min_length=1, max_length=128),
) -> dict:
    return use_cases.class_teaching_adjustments.evidence(class_id, node)


@router.post("/api/class-teaching-adjustments", tags=["class-teaching"])
def create_class_adjustment(
    payload: ClassTeachingAdjustmentCreateRequest, use_cases: UseCases
) -> dict:
    return use_cases.class_teaching_adjustments.create(payload.model_dump())


@router.patch(
    "/api/class-teaching-adjustments/{adjustment_id}", tags=["class-teaching"]
)
def update_class_adjustment(
    adjustment_id: str,
    payload: ClassTeachingAdjustmentUpdateRequest,
    use_cases: UseCases,
) -> dict:
    return use_cases.class_teaching_adjustments.update(
        adjustment_id, payload.model_dump()
    )
