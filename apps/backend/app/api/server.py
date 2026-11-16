"""Local FastAPI server entry point."""

import logging
from pathlib import Path

import uvicorn

from .app import create_app
from ..repositories.store import Store

logger = logging.getLogger("smart_learning.server")


def serve(
    data_dir: Path,
    port: int = 8765,
    host: str = "127.0.0.1",
    database_url: str | None = None,
) -> None:
    application = create_app(store=Store(data_dir, database_url=database_url))
    logger.info("service starting at http://localhost:%s", port)
    uvicorn.run(application, host=host, port=port, log_config=None)
