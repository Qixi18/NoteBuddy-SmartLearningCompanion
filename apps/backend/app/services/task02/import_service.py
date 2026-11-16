"""Coordinate CSV import, deterministic analysis and immutable run persistence."""

import hashlib
import json
from pathlib import Path

from ...infrastructure.ingestion.csv_reader import read_bundle
from ...repositories.analysis_run_repository import AnalysisRunRepository
from ..analysis import analyze
from ..task01.source_service import SourceService


class ImportService:
    def __init__(
        self,
        runs: AnalysisRunRepository,
        sources: SourceService,
    ):
        self.runs = runs
        self.sources = sources

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
        self.runs.save(result)
        return result
