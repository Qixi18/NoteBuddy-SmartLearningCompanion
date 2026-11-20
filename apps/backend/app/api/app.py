"""FastAPI application factory and shared HTTP error handling."""

from __future__ import annotations

import asyncio
import logging
import uuid
from collections import deque
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.exc import IntegrityError, OperationalError
from starlette.exceptions import HTTPException

from ..application.ports.llm import LLMError
from ..config import Settings, settings
from ..core.logging import configure_logging
from ..repositories.store import Store
from .routes import (
    analysis,
    exports,
    health,
    imports,
    recommendations,
    release,
    reports,
    reviews,
    stage2,
)

logger = logging.getLogger("smart_learning.api")
MAX_REQUEST_BODY_BYTES = 20 * 1024 * 1024


class RequestBodyLimitMiddleware:
    """Bound request buffering before FastAPI decodes JSON payloads."""

    def __init__(
        self,
        app,
        max_bytes: int = MAX_REQUEST_BODY_BYTES,
        max_duration_seconds: float = 60.0,
    ):
        self.app = app
        self.max_bytes = max_bytes
        self.max_duration_seconds = max_duration_seconds

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] in {"GET", "HEAD", "OPTIONS"}:
            await self.app(scope, receive, send)
            return

        request_id = uuid.uuid4().hex
        headers = dict(scope.get("headers", []))
        raw_length = headers.get(b"content-length")
        if raw_length:
            try:
                if int(raw_length) > self.max_bytes:
                    await self._reject(scope, send, request_id)
                    return
            except ValueError:
                pass

        buffered = deque()
        total = 0
        more_body = True
        try:
            async with asyncio.timeout(self.max_duration_seconds):
                while more_body:
                    message = await receive()
                    if message["type"] == "http.disconnect":
                        return
                    chunk = message.get("body", b"")
                    total += len(chunk)
                    if total > self.max_bytes:
                        await self._reject(scope, send, request_id)
                        return
                    buffered.append(message)
                    more_body = message.get("more_body", False)
        except TimeoutError:
            await self._reject(
                scope,
                send,
                request_id,
                status=408,
                message="读取请求内容超时",
                code="REQUEST_BODY_TIMEOUT",
            )
            return

        async def replay():
            if buffered:
                return buffered.popleft()
            return {"type": "http.request", "body": b"", "more_body": False}

        await self.app(scope, replay, send)

    @staticmethod
    async def _reject(
        scope,
        send,
        request_id: str,
        status: int = 413,
        message: str = "请求内容超过 20 MiB 限制",
        code: str = "REQUEST_TOO_LARGE",
    ):
        response = JSONResponse(
            status_code=status,
            content={
                "error": message,
                "code": code,
                "request_id": request_id,
            },
            headers={"X-Request-ID": request_id, "Cache-Control": "no-store"},
        )
        await response(scope, _empty_receive, send)


async def _empty_receive():
    return {"type": "http.request", "body": b"", "more_body": False}


def create_app(store: Store | None = None, config: Settings = settings) -> FastAPI:
    configure_logging()

    @asynccontextmanager
    async def lifespan(application: FastAPI):
        try:
            yield
        finally:
            application.state.store.database.dispose()

    application = FastAPI(title="智慧学伴本地 API", version="0.1.0", lifespan=lifespan)
    application.add_middleware(RequestBodyLimitMiddleware)
    application.state.store = store or Store(
        config.data_dir, config.resources_dir, config.database_url, config=config
    )
    application.state.store.bind_config(config)
    application.state.use_cases = application.state.store.use_cases
    application.state.settings = config

    @application.middleware("http")
    async def attach_request_id(request: Request, call_next):
        request_id = uuid.uuid4().hex
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        response.headers["Cache-Control"] = "no-store"
        return response

    def error(request: Request, status: int, message: str, code: str) -> JSONResponse:
        return JSONResponse(
            status_code=status,
            content={
                "error": message,
                "code": code,
                "request_id": getattr(request.state, "request_id", ""),
            },
        )

    @application.exception_handler(RequestValidationError)
    async def validation_error(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        # Avoid returning input values or implementation details in validation diagnostics.
        return error(request, 422, "请求参数无效", "VALIDATION_ERROR")

    @application.exception_handler(ValueError)
    async def invalid_request(request: Request, exc: ValueError) -> JSONResponse:
        return error(request, 400, str(exc), "INVALID_REQUEST")

    @application.exception_handler(FileNotFoundError)
    async def missing_resource(
        request: Request, exc: FileNotFoundError
    ) -> JSONResponse:
        return error(request, 400, str(exc), "RESOURCE_NOT_FOUND")

    @application.exception_handler(HTTPException)
    async def http_error(request: Request, exc: HTTPException) -> JSONResponse:
        code = "NOT_FOUND" if exc.status_code == 404 else "HTTP_ERROR"
        message = str(exc.detail) if exc.status_code < 500 else "服务器内部错误"
        return error(request, exc.status_code, message, code)

    @application.exception_handler(LLMError)
    async def model_error(request: Request, exc: LLMError) -> JSONResponse:
        logger.warning(
            "model provider request failed",
            extra={"request_id": request.state.request_id},
        )
        return error(request, 502, "模型服务调用失败", "MODEL_SERVICE_ERROR")

    @application.exception_handler(IntegrityError)
    async def integrity_error(request: Request, exc: IntegrityError) -> JSONResponse:
        # Keep database details/parameters out of the public contract and logs.
        message = str(getattr(exc, "orig", "")).lower()
        is_unique_violation = (
            "unique constraint" in message or "duplicate key" in message
        )
        if (
            request.url.path == "/api/review"
            and is_unique_violation
            and "teacher_reviews" in message
        ):
            return error(
                request,
                409,
                "复核版本发生冲突，请刷新历史后重试",
                "REVIEW_VERSION_CONFLICT",
            )
        return error(request, 409, "数据冲突", "DATA_CONFLICT")

    @application.exception_handler(OperationalError)
    async def operational_error(
        request: Request, exc: OperationalError
    ) -> JSONResponse:
        if "locked" in str(exc.orig).lower() or "busy" in str(exc.orig).lower():
            return error(request, 503, "数据库正忙，请稍后重试", "DATABASE_BUSY")
        logger.error(
            "database operation failed", extra={"request_id": request.state.request_id}
        )
        return error(request, 500, "数据库操作失败", "DATABASE_ERROR")

    @application.exception_handler(Exception)
    async def unexpected_error(request: Request, exc: Exception) -> JSONResponse:
        logger.error(
            "request failed (%s)",
            type(exc).__name__,
            extra={"request_id": getattr(request.state, "request_id", "")},
        )
        return error(request, 500, "服务器内部错误", "INTERNAL_ERROR")

    application.include_router(health.router)
    application.include_router(imports.router)
    application.include_router(analysis.router)
    application.include_router(recommendations.router)
    application.include_router(reviews.router)
    application.include_router(stage2.router)
    application.include_router(reports.router)
    application.include_router(release.router)
    application.include_router(exports.router)

    @application.get("/", include_in_schema=False)
    def index(request: Request) -> Any:
        path = config.web_dist_dir / "index.html"
        if not path.is_file():
            return error(
                request,
                503,
                "前端构建资源不存在，请在 apps/web 执行 npm run build",
                "WEB_ASSETS_UNAVAILABLE",
            )
        return FileResponse(path)

    @application.get("/assets/{asset_name}", include_in_schema=False)
    def asset(asset_name: str, request: Request) -> Any:
        if Path(asset_name).name != asset_name:
            return error(request, 400, "资源路径无效", "INVALID_RESOURCE_PATH")
        path = config.web_dist_dir / "assets" / asset_name
        if not path.is_file():
            return error(request, 404, "页面资源不存在", "NOT_FOUND")
        return FileResponse(path)

    return application
