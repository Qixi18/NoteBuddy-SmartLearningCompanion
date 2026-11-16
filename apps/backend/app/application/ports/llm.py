from typing import Protocol


class LLMClient(Protocol):
    def complete(self, body: dict) -> dict: ...
