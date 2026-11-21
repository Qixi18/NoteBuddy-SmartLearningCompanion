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
        self.ocr_client = None

    def import_folder(
        self, folder: Path, *, imported_source_dir: Path | None = None
    ) -> dict:
        folder = Path(folder)
        tables, files = read_bundle(folder)
        result = analyze(tables, files, resources_dir=self.sources.resources_dir)
        result["source_root"] = str(folder.resolve().parents[1])
        if imported_source_dir is not None:
            result["imported_source_dir"] = str(imported_source_dir.resolve())
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
        # Importing assessment data is local-only. OCR is an explicit operation.
        result["source_parsing"] = {
            "provider": "deepseek",
            "purpose": "rich_layout_recognition",
            "status": "not_requested",
            "file_count": 0,
            "parsed_file_count": 0,
            "files": {},
        }
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
