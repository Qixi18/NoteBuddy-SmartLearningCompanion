"""前端 HTTP 接口的共享请求与响应契约。"""

from __future__ import annotations

from typing import TypedDict


class ImportRequest(TypedDict):
    folder: str


class ImportResponse(TypedDict):
    run_id: str
    quality: dict


class DraftRequest(TypedDict):
    student_id: str
    indicator_id: str


class ErrorResponse(TypedDict):
    error: str


def validate_draft_request(payload: dict) -> DraftRequest:
    values = {}
    for key in ("student_id", "indicator_id"):
        value = payload.get(key)
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"{key} 必须是非空字符串")
        values[key] = value
    return values  # type: ignore[return-value]
