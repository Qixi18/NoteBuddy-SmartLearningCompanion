"""Explicit human source and case decisions."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from ...application.use_cases.workbench import WorkbenchUseCases
from ...repositories.stage2_repository import SourceVerificationVersionConflict
from ...schemas.http import (
    SourceVerificationRequest,
    SourceVerificationResponse,
    TeacherCaseRequest,
    TeacherCaseResponse,
    TeachingAdjustmentCreateRequest,
    TeachingAdjustmentUpdateRequest,
)
from ..dependencies import get_use_cases

router = APIRouter()
UseCases = Annotated[WorkbenchUseCases, Depends(get_use_cases)]


@router.get(
    "/api/source-verifications",
    response_model=dict[str, list[SourceVerificationResponse]],
    tags=["stage2"],
)
def source_verifications(use_cases: UseCases) -> dict:
    return use_cases.stage2.sources()


@router.post(
    "/api/source-verification",
    response_model=SourceVerificationResponse,
    tags=["stage2"],
)
def verify_source(payload: SourceVerificationRequest, use_cases: UseCases) -> dict:
    try:
        return use_cases.stage2.verify_source(payload.model_dump())
    except SourceVerificationVersionConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get(
    "/api/teacher-cases",
    response_model=dict[str, list[TeacherCaseResponse]],
    tags=["stage2"],
)
def teacher_cases(use_cases: UseCases) -> dict:
    return use_cases.stage2.cases()


@router.post("/api/teacher-case", response_model=TeacherCaseResponse, tags=["stage2"])
def save_teacher_case(payload: TeacherCaseRequest, use_cases: UseCases) -> dict:
    return use_cases.stage2.save_case(payload.model_dump())


@router.get("/api/teaching-adjustments", tags=["teaching adjustments"])
def teaching_adjustments(use_cases: UseCases) -> list[dict]:
    return use_cases.teaching_adjustments.list()


@router.post("/api/teaching-adjustments", tags=["teaching adjustments"])
def create_teaching_adjustment(
    payload: TeachingAdjustmentCreateRequest, use_cases: UseCases
) -> dict:
    return use_cases.teaching_adjustments.create(payload.model_dump())


@router.patch(
    "/api/teaching-adjustments/{adjustment_id}", tags=["teaching adjustments"]
)
def update_teaching_adjustment(
    adjustment_id: str,
    payload: TeachingAdjustmentUpdateRequest,
    use_cases: UseCases,
) -> dict:
    return use_cases.teaching_adjustments.update(adjustment_id, payload.model_dump())
