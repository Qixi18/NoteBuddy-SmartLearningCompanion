"""FastAPI dependency wiring for application services and repositories."""

from collections.abc import Callable

from fastapi import Request

from ..config import Settings
from ..repositories.store import Store


def get_store(request: Request) -> Store:
    return request.app.state.store


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


StoreDependency = Callable[[Request], Store]
