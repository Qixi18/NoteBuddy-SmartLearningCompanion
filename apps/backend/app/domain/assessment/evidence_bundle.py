"""Types shared by scoped assessment evidence workflows."""

from dataclasses import dataclass


@dataclass(frozen=True)
class AnalysisScope:
    run_id: str
    student_id: str
    indicator_id: str
    node_id: str
