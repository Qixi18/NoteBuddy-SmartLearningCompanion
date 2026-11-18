"""Explicit human source and case decisions."""

from typing import Annotated

from fastapi import APIRouter, Depends

from ...application.use_cases.workbench import WorkbenchUseCases
from ...schemas.http import (
    SourceVerificationRequest,
    SourceVerificationResponse,
    TeacherCaseRequest,
    TeacherCaseResponse,
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
    return use_cases.stage2.verify_source(payload.model_dump())


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
