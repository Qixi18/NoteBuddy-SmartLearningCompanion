"""Minimal DeepSeek HTTP adapter; callers own prompt construction and validation."""

import json
import urllib.request


class DeepSeekClientError(RuntimeError):
    """Transport or provider response failure safe to expose as a category."""


def complete(body: dict, api_key: str, timeout: int = 30) -> dict:
    request = urllib.request.Request(
        "https://api.deepseek.com/chat/completions",
        data=json.dumps(body, ensure_ascii=False).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            result = json.load(response)
    except Exception as exc:
        raise DeepSeekClientError(type(exc).__name__) from exc
    if not isinstance(result, dict):
        raise DeepSeekClientError("invalid response")
    return result
