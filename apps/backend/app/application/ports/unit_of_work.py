from typing import Protocol

from .repositories import AnalysisRuns, Responses, ReviewHistories, Students, Subjects


class UnitOfWork(Protocol):
    runs: AnalysisRuns
    reviews: ReviewHistories
    students: Students
    subjects: Subjects
    responses: Responses

    def __enter__(self) -> "UnitOfWork": ...
    def __exit__(self, exc_type, exc, traceback) -> None: ...
    def commit(self) -> None: ...
    def rollback(self) -> None: ...
    def flush(self) -> None: ...
