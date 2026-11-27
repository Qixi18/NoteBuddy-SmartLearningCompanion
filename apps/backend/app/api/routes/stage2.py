"""Explicit human source and case decisions."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from ...application.use_cases.workbench import WorkbenchUseCases
from ...repositories.stage2_repository import SourceVerificationVersionConflict
from ...schemas.http import (
    IndicatorMappingRequest,
    MachineVerificationRequest,
    MachineVerificationResponse,
    MaterialCatalogResponse,
    SourceVerificationRequest,
    SourceVerificationResponse,
    SpotCheckRequest,
    TeacherCaseRequest,
    TeacherCaseResponse,
    TeachingAdjustmentCreateRequest,
    TeachingAdjustmentUpdateRequest,
)
from ..dependencies import get_use_cases

router = APIRouter()
UseCases = Annotated[WorkbenchUseCases, Depends(get_use_cases)]


@router.get("/api/ai-source-mappings", tags=["sources"])
def ai_source_mappings(use_cases: UseCases) -> dict:
    return use_cases.indicator_mappings.list()


@router.get("/api/ai-source-mappings/preview", tags=["sources"])
def preview_ai_source_mappings(
    use_cases: UseCases,
    indicator_id: str | None = Query(default=None, min_length=1),
) -> dict:
    return use_cases.indicator_mappings.preview(indicator_id)


@router.post("/api/ai-source-mappings", tags=["sources"])
def generate_ai_source_mappings(
    payload: IndicatorMappingRequest, use_cases: UseCases
) -> dict:
    return use_cases.indicator_mappings.generate(
        payload.indicator_id, payload.preview_fingerprint
    )


@router.get(
    "/api/material-catalog",
    response_model=MaterialCatalogResponse,
    tags=["sources"],
)
def material_catalog(use_cases: UseCases) -> dict:
    return use_cases.material_catalog.execute()


@router.get(
    "/api/source-verifications",
    response_model=dict[str, list[SourceVerificationResponse]],
    tags=["stage2"],
)
def source_verifications(use_cases: UseCases) -> dict:
    return use_cases.stage2.sources()


@router.get(
    "/api/knowledge-link-candidates",
    response_model=dict,
    tags=["stage2"],
)
def knowledge_link_candidates(
    use_cases: UseCases, indicator_id: str
) -> dict:
    """教师判断层：学习顺序候选（可解释，不自动写入）。"""
    try:
        return use_cases.stage2.knowledge_link_candidates(indicator_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


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


@router.post(
    "/api/source-machine-verification",
    response_model=MachineVerificationResponse,
    tags=["sources"],
)
def run_machine_verification(
    payload: MachineVerificationRequest, use_cases: UseCases
) -> dict:
    """机器核验层：多维证据（来源、课标页、教材页、题目关联）全部成立才自动通过。"""
    try:
        return use_cases.stage2.apply_machine_verification(
            payload.indicator_id, run_id=payload.run_id, force=payload.force
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post(
    "/api/source-spot-check",
    response_model=SourceVerificationResponse,
    tags=["sources"],
)
def record_spot_check(payload: SpotCheckRequest, use_cases: UseCases) -> dict:
    """抽查机制：教师抽样人工复核机器核验记录，留痕于该版本。"""
    try:
        return use_cases.stage2.record_spot_check(payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


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
