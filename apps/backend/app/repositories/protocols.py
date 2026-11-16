"""Compatibility exports; Repository Protocols now belong to Application Ports."""

from ..application.ports.repositories import (
    AnalysisRuns,
    DomainReviews,
    Responses,
    ReviewHistories,
    Students,
    Subjects,
)
from ..application.ports.unit_of_work import UnitOfWork

__all__ = [
    "AnalysisRuns",
    "DomainReviews",
    "Responses",
    "ReviewHistories",
    "Students",
    "Subjects",
    "UnitOfWork",
]
