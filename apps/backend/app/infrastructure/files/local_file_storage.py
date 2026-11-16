import hashlib
from pathlib import Path

from ...application.ports.file_storage import FileStorage


class LocalFileStorage(FileStorage):
    def read_bytes(self, path: Path) -> bytes:
        return Path(path).read_bytes()

    def sha256(self, path: Path) -> str:
        digest = hashlib.sha256()
        with Path(path).open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()
