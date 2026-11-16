"""Compatibility adapter forwarding review writes to the owning application use case."""

from collections.abc import Callable


class ReviewService:
    """Preserve the legacy service spelling without owning persistence or policy."""

    def __init__(self, save_review: Callable[[str, str, str, dict], dict]) -> None:
        self._save_review = save_review

    def save(
        self, run_id: str, student_id: str, indicator_id: str, payload: dict
    ) -> dict:
        return self._save_review(run_id, student_id, indicator_id, payload)
