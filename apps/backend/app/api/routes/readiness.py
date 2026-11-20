from fastapi import APIRouter, Request

from ...schemas.http import ReadinessResponse
from ...services.shared.readiness_service import inspect_readiness

router = APIRouter()


@router.get("/api/readiness", response_model=ReadinessResponse, tags=["health"])
def readiness(request: Request) -> dict:
    """Read deployment prerequisites without changing the database or signoffs."""
    return inspect_readiness(request.app.state.settings)
