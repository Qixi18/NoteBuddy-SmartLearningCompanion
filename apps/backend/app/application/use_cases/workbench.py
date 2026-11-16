"""Thin use cases for the existing HTTP and CLI workbench operations."""

from pathlib import Path

from ...services.cases import suggest_cases
from ...services.exports import package
from ...services.recommendations import draft, deepseek_draft
from ..ports.llm import LLMClient


class CurrentRun:
    def __init__(self, uow_factory):
        self.uow_factory = uow_factory

    def execute(self) -> dict:
        with self.uow_factory(immediate=False) as uow:
            return uow.runs.current()


class ImportFolder:
    def __init__(self, import_service):
        self.import_service = import_service

    def execute(self, folder: Path) -> dict:
        return self.import_service.import_folder(folder)


class ListReviews:
    def __init__(self, uow_factory):
        self.uow_factory = uow_factory

    def execute(self, run_id: str | None = None) -> dict:
        with self.uow_factory(immediate=False) as uow:
            if run_id is None:
                run_id = uow.runs.current()["run_id"]
            return uow.reviews.list(run_id)


class ListCases:
    def __init__(self, current_run: CurrentRun):
        self.current_run = current_run

    def execute(self) -> list[dict]:
        return suggest_cases(self.current_run.execute())


class RuleDraft:
    def __init__(self, current_run: CurrentRun):
        self.current_run = current_run

    def execute(
        self, student_id: str, indicator_id: str, node_id: str | None = None
    ) -> dict:
        return draft(self.current_run.execute(), student_id, indicator_id, node_id)


class DeepSeekDraft:
    def __init__(self, current_run: CurrentRun, config, client: LLMClient | None):
        self.current_run = current_run
        self.config = config
        self.client = client

    def execute(
        self, student_id: str, indicator_id: str, node_id: str | None = None
    ) -> dict:
        return deepseek_draft(
            self.current_run.execute(),
            student_id,
            indicator_id,
            self.config.deepseek_api_key,
            self.config.deepseek_model,
            client=self.client,
            node_id=node_id,
        )


class ReadSourcePdf:
    def __init__(self, current_run: CurrentRun, source_service):
        self.current_run = current_run
        self.source_service = source_service

    def execute(self, name: str) -> bytes:
        return self.source_service.read_pdf(self.current_run.execute(), name)


class ExportPackage:
    def __init__(self, uow_factory, current_run: CurrentRun):
        self.uow_factory = uow_factory
        self.current_run = current_run

    def execute(self, case_ids: list[str]) -> bytes:
        with self.uow_factory(immediate=False) as uow:
            run = uow.runs.current()
            reviews = uow.reviews.list(run["run_id"])
        return package(run, reviews, case_ids)


class WorkbenchUseCases:
    """Composition object holding only the real workbench use cases."""

    def __init__(
        self,
        uow_factory,
        import_service,
        source_service,
        config,
        save_review,
        llm_client,
    ):
        self.current_run = CurrentRun(uow_factory)
        self.import_folder = ImportFolder(import_service)
        self.list_reviews = ListReviews(uow_factory)
        self.save_review = save_review
        self.list_cases = ListCases(self.current_run)
        self.rule_draft = RuleDraft(self.current_run)
        self.deepseek_draft = DeepSeekDraft(self.current_run, config, llm_client)
        self.read_source_pdf = ReadSourcePdf(self.current_run, source_service)
        self.export_package = ExportPackage(uow_factory, self.current_run)
