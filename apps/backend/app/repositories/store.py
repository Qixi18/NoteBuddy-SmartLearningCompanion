"""Compatibility composition facade for the local workbench services."""

from pathlib import Path

from ..config import settings
from ..services.task01.source_service import SourceService
from ..services.task02.import_service import ImportService
from ..services.task03.review_service import ReviewService
from .analysis_run_repository import AnalysisRunRepository
from .review_repository import ReviewRepository


class Store:
    """Wire repositories and use cases while retaining the existing call surface."""

    def __init__(self, root: Path, resources_dir: Path | None = None):
        self.root = Path(root)
        self.run_repository = AnalysisRunRepository(self.root)
        self.review_repository = ReviewRepository(self.root)
        self.sources = SourceService(resources_dir or settings.resources_dir)
        self.imports = ImportService(self.run_repository, self.sources)
        self.review_service = ReviewService(self.run_repository, self.review_repository)

    def import_folder(self, folder: Path) -> dict:
        return self.imports.import_folder(folder)

    def current(self) -> dict:
        return self.run_repository.current()

    def load(self, run_id: str) -> dict:
        return self.run_repository.load(run_id)

    def reviews(self, run_id: str) -> dict:
        return self.review_repository.list(run_id)

    def save_review(
        self, run_id: str, student_id: str, indicator_id: str, payload: dict
    ) -> dict:
        return self.review_service.save(run_id, student_id, indicator_id, payload)

    def source_file(self, run: dict, name: str) -> Path | None:
        return self.sources.resolve(run, name)

    def read_source(self, run: dict, name: str) -> bytes:
        return self.sources.read_pdf(run, name)
