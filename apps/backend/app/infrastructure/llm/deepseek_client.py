"""Minimal DeepSeek HTTP adapter; callers own prompt construction and validation."""

import json
import urllib.request

from ...application.ports.llm import LLMClient, LLMError


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
        raise LLMError(type(exc).__name__) from exc
    if not isinstance(result, dict):
        raise LLMError("invalid response")
    return result


class DeepSeekAdapter(LLMClient):
    """Configured implementation of the single structured completion port."""

    def __init__(self, api_key: str, timeout: int = 30):
        self.api_key = api_key
        self.timeout = timeout

    def complete(self, body: dict) -> dict:
        return complete(body, self.api_key, timeout=self.timeout)
