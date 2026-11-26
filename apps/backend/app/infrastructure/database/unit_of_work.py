"""SQLAlchemy UnitOfWork adapter binding every repository to one Session."""

from sqlalchemy.orm import Session

from ...application.ports.unit_of_work import UnitOfWork
from ...repositories.ai_analysis_repository import AIAnalysisRepository
from ...repositories.analysis_run_repository import AnalysisRunRepository
from ...repositories.class_teaching_plan_repository import ClassTeachingPlanRepository
from ...repositories.response_repository import ResponseRepository
from ...repositories.review_repository import ReviewRepository
from ...repositories.stage2_repository import Stage2Repository
from ...repositories.student_repository import StudentRepository
from ...repositories.subject_repository import SubjectRepository
from ...repositories.teaching_adjustment_repository import TeachingAdjustmentRepository
from .session import SessionFactory


class SqlAlchemyUnitOfWork(UnitOfWork):
    def __init__(self, sessions: SessionFactory, *, root=None, immediate: bool = True):
        self.sessions = sessions
        self.root = root
        self.immediate = immediate
        self._session: Session | None = None

    def __enter__(self):
        session = self.sessions()
        self._session = session
        try:
            if session.bind and session.bind.dialect.name == "sqlite":
                if self.immediate:
                    session.connection().exec_driver_sql("BEGIN IMMEDIATE")
                else:
                    session.begin()
            else:
                session.begin()
            self.runs = AnalysisRunRepository(
                self.root, database=self.sessions, session=session
            )
            self.ai_analyses = AIAnalysisRepository(self.sessions, session=session)
            self.reviews = ReviewRepository(
                self.root, database=self.sessions, session=session
            )
            self.stage2 = Stage2Repository(self.sessions, session=session)
            self.teaching_adjustments = TeachingAdjustmentRepository(
                self.sessions, session=session
            )
            self.class_teaching_plans = ClassTeachingPlanRepository(
                self.sessions, session=session
            )
            self.students = StudentRepository(self.sessions, session=session)
            self.subjects = SubjectRepository(self.sessions, session=session)
            self.responses = ResponseRepository(self.sessions, session=session)
            return self
        except BaseException:
            try:
                session.rollback()
            finally:
                session.close()
                self._session = None
            raise

    def __exit__(self, exc_type, exc, traceback):
        session, self._session = self._session, None
        if session is None:
            return False
        try:
            if exc_type is None:
                try:
                    session.commit()
                except BaseException:
                    session.rollback()
                    raise
            else:
                session.rollback()
        finally:
            session.close()
        return False

    def commit(self):
        if self._session is not None:
            self._session.commit()

    def rollback(self):
        if self._session is not None:
            self._session.rollback()

    def flush(self):
        if self._session is not None:
            self._session.flush()
