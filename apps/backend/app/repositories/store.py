"""Compatibility composition facade for the local workbench services."""

from pathlib import Path

from ..application.use_cases.save_review import SaveReview
from ..application.use_cases.workbench import WorkbenchUseCases
from ..config import settings
from ..infrastructure.database.engine import make_engine
from ..infrastructure.database.session import Database
from ..infrastructure.database.unit_of_work import SqlAlchemyUnitOfWork
from ..infrastructure.llm.deepseek_client import DeepSeekAdapter
from ..services.task01.source_service import SourceService
from ..services.task02.import_service import ImportService
from .analysis_run_repository import AnalysisRunRepository
from .response_repository import ResponseRepository
from .review_repository import ReviewRepository
from .student_repository import StudentRepository
from .subject_repository import SubjectRepository


class Store:
    """Wire repositories and use cases while retaining the existing call surface."""

    def __init__(
        self,
        root: Path,
        resources_dir: Path | None = None,
        database_url: str | None = None,
        config=None,
    ):
        self.root = Path(root)
        self.database_url = (
            database_url
            or f"sqlite:///{(self.root / 'smart_learning.db').resolve().as_posix()}"
        )
        self.database = Database(make_engine(self.database_url))
        self.run_repository = AnalysisRunRepository(self.root, database=self.database)
        self.review_repository = ReviewRepository(self.root, database=self.database)
        self.uow_factory = self.make_uow
        self.student_repository = StudentRepository(self.database)
        self.subject_repository = SubjectRepository(self.database)
        self.response_repository = ResponseRepository(self.database)
        self.config = config or settings
        self._resources_dir = Path(resources_dir or self.config.resources_dir)
        self.sources = SourceService(
            self._resources_dir,
            source_files_dir=self.config.source_files_dir,
        )
        self.imports = ImportService(
            self.run_repository, self.sources, self.uow_factory
        )
        self.review_service = SaveReview(self.uow_factory, self.sources)
        self.bind_config(self.config)

    def bind_config(self, config):
        self.config = config
        self.sources = SourceService(
            self._resources_dir,
            source_files_dir=config.source_files_dir,
        )
        self.review_service.source_service = self.sources
        self.imports.sources = self.sources
        llm_client = (
            DeepSeekAdapter(
                config.model_api_key or config.deepseek_api_key,
                timeout=config.deepseek_timeout_seconds,
                api_url=config.model_api_url,
            )
            if config.model_api_key or config.deepseek_api_key
            else None
        )
        self.use_cases = WorkbenchUseCases(
            self.uow_factory,
            self.imports,
            self.sources,
            config,
            self.review_service,
            llm_client,
        )

    def make_uow(self, *, immediate: bool = True):
        return SqlAlchemyUnitOfWork(self.database, root=self.root, immediate=immediate)

    def import_folder(self, folder: Path) -> dict:
        return self.use_cases.import_folder.execute(folder)

    def current(self) -> dict:
        return self.use_cases.current_run.execute()

    def load(self, run_id: str) -> dict:
        return self.run_repository.load(run_id)

    def reviews(self, run_id: str) -> dict:
        return self.use_cases.list_reviews.execute(run_id)

    def teaching_adjustments(self, student_id: str | None = None) -> list[dict]:
        with self.uow_factory(immediate=False) as uow:
            return uow.teaching_adjustments.list(student_id)

    def save_review(
        self, run_id: str, student_id: str, indicator_id: str, payload: dict
    ) -> dict:
        return self.use_cases.save_review.execute(
            run_id, student_id, indicator_id, payload
        )

    def source_file(self, run: dict, name: str) -> Path | None:
        return self.sources.resolve(run, name)

    def read_source(self, run: dict, name: str) -> bytes:
        return self.use_cases.read_source_pdf.execute(name)
