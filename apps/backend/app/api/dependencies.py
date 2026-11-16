"""FastAPI wiring for Application use cases."""

from fastapi import Request

from ..application.use_cases.workbench import WorkbenchUseCases


def get_use_cases(request: Request) -> WorkbenchUseCases:
    return request.app.state.use_cases
