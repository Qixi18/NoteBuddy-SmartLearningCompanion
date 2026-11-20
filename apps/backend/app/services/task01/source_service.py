"""Resolve allowlisted curriculum and textbook PDF sources."""

from io import BytesIO
from pathlib import Path

from pypdf import PdfReader
from pypdf.errors import PdfReadError, PdfStreamError

from ...application.ports.file_storage import FileStorage
from ...infrastructure.files.local_file_storage import LocalFileStorage


class SourceService:
    def __init__(
        self,
        resources_dir: Path,
        storage: FileStorage | None = None,
        source_files_dir: Path | None = None,
    ):
        self.resources_dir = Path(resources_dir)
        self.source_files_dir = Path(source_files_dir) if source_files_dir else None
        self.storage = storage or LocalFileStorage()

    def allowed_names(self, run: dict) -> set[str]:
        names = {"课程标准_2022.pdf"}
        for entry in run["source_index"]:
            names.update(entry["source_check"].get("textbook_slices", []))
        return names

    def resolve(self, run: dict, name: str) -> Path | None:
        if name not in self.allowed_names(run) or Path(name).name != name:
            raise ValueError("来源文件不在允许范围")
        roots = [
            self.source_files_dir,
            self.resources_dir,
            Path(run.get("source_root", "")) / "5_课程标准及相关教学资源",
        ]
        for root in roots:
            if root is None:
                continue
            base = root.resolve()
            path = (root / name).resolve()
            if path.is_relative_to(base) and path.is_file():
                return path
        return None

    def read_pdf(self, run: dict, name: str) -> bytes:
        path = self.resolve(run, name)
        if path is None:
            raise FileNotFoundError("本机来源文件不存在")
        return self.storage.read_bytes(path)

    def inspect_pdf(self, run: dict, name: str) -> dict:
        """Return page and text-layer facts for an allowlisted PDF."""
        path = self.resolve(run, name)
        if path is None:
            return {"available": False, "name": name}
        content = self.storage.read_bytes(path)
        result = {
            "available": True,
            "name": name,
            "sha256": self.storage.sha256(path),
            "bytes": len(content),
        }
        try:
            reader = PdfReader(BytesIO(content), strict=False)
            text_pages = [
                bool((page.extract_text() or "").strip()) for page in reader.pages
            ]
        except (OSError, ValueError, PdfReadError, PdfStreamError):
            return {**result, "status": "unreadable", "page_count": None}
        return {
            **result,
            "status": "readable",
            "page_count": len(text_pages),
            "text_page_count": sum(text_pages),
            "text_pages": [
                index + 1 for index, has_text in enumerate(text_pages) if has_text
            ],
        }

    def extract_pages(
        self, run: dict, name: str, page_numbers: list[int]
    ) -> list[dict]:
        """Extract text only from explicitly verified, allowlisted PDF pages."""
        if not page_numbers or len(page_numbers) > 20:
            raise ValueError("PDF文本提取页数必须为1至20页")
        content = self.read_pdf(run, name)
        try:
            reader = PdfReader(BytesIO(content), strict=False)
        except (OSError, ValueError, PdfReadError, PdfStreamError):
            return []
        pages = []
        for number in sorted(set(page_numbers)):
            if number < 1 or number > len(reader.pages):
                continue
            text = (reader.pages[number - 1].extract_text() or "").strip()
            if text:
                pages.append({"name": name, "page": number, "text": text[:12000]})
        return pages

    def fingerprints(self, run: dict) -> dict:
        results = {}
        for name in sorted(self.allowed_names(run)):
            path = self.resolve(run, name)
            if path is None:
                continue
            results[name] = {
                "sha256": self.storage.sha256(path),
                "bytes": path.stat().st_size,
            }
        return results
