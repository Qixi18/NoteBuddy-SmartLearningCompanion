from typing import Protocol

from .ai_analysis_repository import AIAnalyses
from .repositories import (
    AnalysisRuns,
    Responses,
    ReviewHistories,
    Stage2Records,
    Students,
    Subjects,
    TeachingAdjustments,
)


class UnitOfWork(Protocol):
    ai_analyses: AIAnalyses
    runs: AnalysisRuns
    reviews: ReviewHistories
    stage2: Stage2Records
    teaching_adjustments: TeachingAdjustments
    students: Students
    subjects: Subjects
    responses: Responses

    def __enter__(self) -> "UnitOfWork": ...
    def __exit__(self, exc_type, exc, traceback) -> None: ...
    def commit(self) -> None: ...
    def rollback(self) -> None: ...
    def flush(self) -> None: ...
