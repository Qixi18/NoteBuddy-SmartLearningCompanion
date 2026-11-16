"""Coordinate CSV import, deterministic analysis and immutable run persistence."""

import hashlib
import json
from pathlib import Path

from ...infrastructure.ingestion.csv_reader import read_bundle
from ...application.ports.repositories import AnalysisRuns
from ..analysis import analyze
from ..task01.source_service import SourceService


class ImportService:
    def __init__(
        self,
        runs: AnalysisRuns,
        sources: SourceService,
        uow_factory=None,
    ):
        self.runs = runs
        self.sources = sources
        self.uow_factory = uow_factory

    def import_folder(self, folder: Path) -> dict:
        folder = Path(folder)
        tables, files = read_bundle(folder)
        result = analyze(tables, files, resources_dir=self.sources.resources_dir)
        result["source_root"] = str(folder.resolve().parents[1])
        result["source_files"] = self.sources.fingerprints(result)
        result["run_id"] = hashlib.sha256(
            json.dumps(
                {
                    "csv_run_id": result["run_id"],
                    "source_files": result["source_files"],
                },
                sort_keys=True,
            ).encode()
        ).hexdigest()[:16]
        runs = self.runs
        if self.uow_factory is not None:
            with self.uow_factory(immediate=False) as uow:
                existing_run_ids = set(uow.runs.list_run_ids())
        else:
            existing_run_ids = set(self.runs.list_run_ids())
        if result["run_id"] in existing_run_ids:
            result["run_id"] = hashlib.sha256(
                f"{result['run_id']}:{result['created_at']}".encode()
            ).hexdigest()[:16]
        if self.uow_factory is not None:
            with self.uow_factory() as uow:
                uow.runs.save(result)
        else:
            runs.save(result)
        return result
