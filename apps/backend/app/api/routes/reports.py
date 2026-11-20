"""Teacher-facing reports based on current run snapshots."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from ...application.use_cases.workbench import WorkbenchUseCases
from ..dependencies import get_use_cases

router = APIRouter()
UseCases = Annotated[WorkbenchUseCases, Depends(get_use_cases)]


@router.get("/api/reports/cases", tags=["reports"])
def case_report(
    students: Annotated[list[str], Query(min_length=1)], use_cases: UseCases
) -> dict:
    return use_cases.competition_reports.cases(students)


@router.get("/api/reports/class", tags=["reports"])
def class_report(node: str, use_cases: UseCases) -> dict:
    return use_cases.competition_reports.class_report(node)
