from typing import Protocol

from ..domain.assessment.models import Response
from ..domain.student.models import Student
from ..domain.subject.models import LearningObjective
from ..domain.teaching.models import TeacherReview


class AnalysisRuns(Protocol):
    def current(self) -> dict: ...
    def load(self, run_id: str) -> dict: ...
    def save(self, run: dict) -> None: ...


class ReviewHistories(Protocol):
    def list(self, run_id: str) -> dict: ...
    def append(self, run_id: str, key: str, payload: dict) -> dict: ...


class Students(Protocol):
    def get_by_id(self, run_id: str, student_id: str) -> Student | None: ...
    def list_by_class(self, run_id: str, class_id: str) -> list[Student]: ...


class Subjects(Protocol):
    def get_objective(
        self, run_id: str, indicator_id: str
    ) -> LearningObjective | None: ...


class Responses(Protocol):
    def get_by_id(self, run_id: str, record_id: str) -> Response | None: ...
    def list_by_student(
        self, run_id: str, student_id: str, *, selected_only: bool = False
    ) -> list[Response]: ...


class DomainReviews(Protocol):
    def list_domain(
        self, run_id: str, student_id: str, indicator_id: str
    ) -> list[TeacherReview]: ...
