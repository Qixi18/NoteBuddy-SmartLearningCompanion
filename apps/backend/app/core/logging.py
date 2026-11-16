"""Consistent, content-safe application logging."""

import logging


class RequestContextFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        request_id = getattr(record, "request_id", "-")
        return f"{self.formatTime(record)} | {record.levelname} | {record.name} | {request_id} | {record.getMessage()}"


def configure_logging() -> None:
    root = logging.getLogger()
    if any(getattr(handler, "_smart_learning", False) for handler in root.handlers):
        return
    handler = logging.StreamHandler()
    handler.setFormatter(RequestContextFormatter())
    handler._smart_learning = True  # type: ignore[attr-defined]
    root.addHandler(handler)
    root.setLevel(logging.INFO)
