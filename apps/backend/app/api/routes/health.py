from fastapi import APIRouter

from ...schemas.http import HealthResponse

router = APIRouter()


@router.get("/api/health", response_model=HealthResponse, tags=["health"])
def health() -> HealthResponse:
    return HealthResponse(status="ok")
