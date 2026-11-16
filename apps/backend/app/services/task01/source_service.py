"""Resolve allowlisted curriculum and textbook PDF sources."""

import hashlib
from pathlib import Path


class SourceService:
    def __init__(self, resources_dir: Path):
        self.resources_dir = Path(resources_dir)

    def allowed_names(self, run: dict) -> set[str]:
        names = {"课程标准_2022.pdf"}
        for entry in run["source_index"]:
            names.update(entry["source_check"].get("textbook_slices", []))
        return names

    def resolve(self, run: dict, name: str) -> Path | None:
        if name not in self.allowed_names(run) or Path(name).name != name:
            raise ValueError("来源文件不在允许范围")
        candidates = [
            self.resources_dir / name,
            Path(run.get("source_root", "")) / "5_课程标准及相关教学资源" / name,
        ]
        return next((path for path in candidates if path.is_file()), None)

    def read_pdf(self, run: dict, name: str) -> bytes:
        path = self.resolve(run, name)
        if path is None:
            raise FileNotFoundError("本机来源文件不存在")
        return path.read_bytes()

    def fingerprints(self, run: dict) -> dict:
        results = {}
        for name in sorted(self.allowed_names(run)):
            path = self.resolve(run, name)
            if path is None:
                continue
            digest = hashlib.sha256()
            with path.open("rb") as source:
                for chunk in iter(lambda: source.read(1024 * 1024), b""):
                    digest.update(chunk)
            results[name] = {"sha256": digest.hexdigest(), "bytes": path.stat().st_size}
        return results
