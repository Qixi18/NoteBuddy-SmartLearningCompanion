from typing import Protocol


class LLMError(RuntimeError):
    """Provider-neutral, safe-to-handle failure from an LLM port operation."""


class LLMClient(Protocol):
    def complete(self, body: dict) -> dict: ...
