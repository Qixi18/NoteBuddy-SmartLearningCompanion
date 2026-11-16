from pathlib import Path
from typing import Protocol


class FileStorage(Protocol):
    def read_bytes(self, path: Path) -> bytes: ...
    def sha256(self, path: Path) -> str: ...
