"""Compatibility exports for the composed deterministic analysis service."""

from ..infrastructure.ingestion.csv_reader import TABLES, read_bundle
from .task02.analysis_service import RULE_VERSION, analyze

__all__ = ["TABLES", "read_bundle", "RULE_VERSION", "analyze"]
