"""Resolve allowlisted curriculum and textbook PDF sources."""

import hashlib
import json
from pathlib import Path

from ...application.ports.file_storage import FileStorage
from ...infrastructure.files.local_file_storage import LocalFileStorage
from ...infrastructure.llm.deepseek_ocr_client import (
    DeepSeekOCRError,
    DeepSeekOCRAdapter,
)

MAX_OCR_FILE_BYTES = 100 * 1024 * 1024
MAX_OCR_PAGES = 1000


class SourceService:
    def __init__(
        self,
        resources_dir: Path,
        storage: FileStorage | None = None,
        source_files_dir: Path | None = None,
        ocr_cache_dir: Path | None = None,
    ):
        self.resources_dir = Path(resources_dir)
        self.source_files_dir = Path(source_files_dir) if source_files_dir else None
        self.storage = storage or LocalFileStorage()
        self.ocr_cache_dir = Path(ocr_cache_dir) if ocr_cache_dir else None

    def allowed_names(self, run: dict) -> set[str]:
        names = {"课程标准_2022.pdf"}
        for entry in run["source_index"]:
            names.update(entry["source_check"].get("textbook_slices", []))
        return names

    def resolve(self, run: dict, name: str) -> Path | None:
        if name not in self.allowed_names(run) or Path(name).name != name:
            raise ValueError("来源文件不在允许范围")
        roots = [self.source_files_dir, self.resources_dir]
        imported_source_dir = run.get("imported_source_dir")
        source_root = run.get("source_root")
        if imported_source_dir:
            roots.append(Path(imported_source_dir))
        if source_root:
            roots.append(Path(source_root) / "5_课程标准及相关教学资源")
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

    def parse_registered_pdfs(
        self, run: dict, client: DeepSeekOCRAdapter | None
    ) -> dict:
        """OCR all registered curriculum and textbook PDFs and persist page results."""
        files = {}
        names = sorted(self.allowed_names(run))
        for name in names:
            path = self.resolve(run, name)
            if path is None:
                files[name] = {"status": "missing"}
                continue
            if path.stat().st_size > MAX_OCR_FILE_BYTES:
                files[name] = {
                    "status": "failed",
                    "reason": "file_too_large",
                    "bytes": path.stat().st_size,
                }
                continue
            content = self.storage.read_bytes(path)
            fingerprint = hashlib.sha256(content).hexdigest()
            if len(content) > MAX_OCR_FILE_BYTES:
                files[name] = {
                    "status": "failed",
                    "reason": "file_too_large",
                    "sha256": fingerprint,
                    "bytes": len(content),
                }
                continue
            cached = self._read_ocr_cache(fingerprint)
            if cached is not None:
                files[name] = {
                    **cached,
                    "parse_status": cached.get("status", "complete"),
                    "status": "cached",
                }
                continue
            if client is None:
                files[name] = {
                    "status": "failed",
                    "reason": "deepseek_api_key_missing",
                    "sha256": fingerprint,
                    "bytes": len(content),
                }
                continue
            try:
                result = client.recognize(name, content)
                page_count = int(result.get("page_count", len(result["pages"])))
                if page_count > MAX_OCR_PAGES or len(result["pages"]) > MAX_OCR_PAGES:
                    raise ValueError("page_limit_exceeded")
                pages = []
                for page in result["pages"]:
                    if not isinstance(page, dict) or not isinstance(page.get("index"), int):
                        continue
                    text = page.get("text", "")
                    if not isinstance(text, str):
                        continue
                    pages.append(
                        {
                            "index": page["index"],
                            "text": text,
                            "finish_reason": page.get("finish_reason", "stop"),
                        }
                    )
                if not pages:
                    raise ValueError("empty_ocr_result")
                parsed = {
                    "sha256": fingerprint,
                    "bytes": len(content),
                    "page_count": page_count,
                    "text_page_count": sum(bool(page["text"].strip()) for page in pages),
                    "pages": pages,
                    "usage": result.get("usage", {}),
                    "ocr_id": result.get("id"),
                    "status": "partial"
                    if any(page["finish_reason"] == "length" for page in pages)
                    else "complete",
                }
                self._write_ocr_cache(fingerprint, parsed)
                files[name] = parsed
            except Exception as exc:  # noqa: BLE001 - report per-file failure and continue importing
                reason = (
                    str(exc)
                    if isinstance(exc, (ValueError, DeepSeekOCRError))
                    else type(exc).__name__
                )
                files[name] = {
                    "status": "failed",
                    "reason": reason,
                    "sha256": fingerprint,
                    "bytes": len(content),
                }
        outcomes = [entry.get("status") for entry in files.values()]
        if outcomes and all(
            status in {"complete", "cached"}
            and files[name].get("parse_status", "complete") == "complete"
            for name, status in zip(files, outcomes, strict=True)
        ):
            status = "complete"
        elif any(status in {"complete", "cached", "partial"} for status in outcomes):
            status = "partial"
        else:
            status = "failed" if names else "no_sources"
        return {
            "provider": "deepseek",
            "purpose": "rich_layout_recognition",
            "status": status,
            "file_count": len(files),
            "parsed_file_count": sum(
                entry.get("status") in {"complete", "cached", "partial"}
                for entry in files.values()
            ),
            "files": files,
        }

    def _read_ocr_cache(self, fingerprint: str) -> dict | None:
        if self.ocr_cache_dir is None:
            return None
        path = self.ocr_cache_dir / f"{fingerprint}.json"
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None
        return value if isinstance(value, dict) and value.get("sha256") == fingerprint else None

    def _write_ocr_cache(self, fingerprint: str, value: dict) -> None:
        if self.ocr_cache_dir is None:
            return
        self.ocr_cache_dir.mkdir(parents=True, exist_ok=True)
        target = self.ocr_cache_dir / f"{fingerprint}.json"
        temporary = target.with_suffix(".tmp")
        temporary.write_text(
            json.dumps(value, ensure_ascii=False), encoding="utf-8"
        )
        temporary.replace(target)

    def inspect_pdf(self, run: dict, name: str) -> dict:
        """Return OCR facts for an allowlisted PDF."""
        path = self.resolve(run, name)
        if path is None:
            return {"available": False, "name": name}
        content = self.storage.read_bytes(path)
        fingerprint = hashlib.sha256(content).hexdigest()
        parsed = self._read_ocr_cache(fingerprint)
        if parsed is None:
            parsed = next(
                (
                    value
                    for key, value in run.get("source_parsing", {}).get("files", {}).items()
                    if key == name and value.get("sha256") == fingerprint
                ),
                None,
            )
        if parsed is None:
            return {
                "available": True,
                "name": name,
                "sha256": fingerprint,
                "bytes": len(content),
                "status": "unparsed",
                "page_count": None,
                "text_page_count": 0,
                "text_pages": [],
            }
        pages = parsed.get("pages", [])
        return {
            "available": True,
            "name": name,
            "sha256": fingerprint,
            "bytes": len(content),
            "status": "readable"
            if parsed.get("status") in {"complete", "cached", "partial"}
            else parsed.get("status"),
            "parse_status": parsed.get("parse_status", parsed.get("status")),
            "page_count": parsed.get("page_count"),
            "text_page_count": parsed.get("text_page_count", 0),
            "text_pages": [page["index"] + 1 for page in pages if page.get("text", "").strip()],
        }

    def extract_pages(
        self, run: dict, name: str, page_numbers: list[int]
    ) -> list[dict]:
        """Return OCR text only from explicitly selected, allowlisted PDF pages."""
        if not page_numbers or len(page_numbers) > 20:
            raise ValueError("PDF文本提取页数必须为1至20页")
        path = self.resolve(run, name)
        if path is None:
            return []
        fingerprint = hashlib.sha256(self.storage.read_bytes(path)).hexdigest()
        parsed = self._read_ocr_cache(fingerprint)
        if parsed is None:
            parsed = run.get("source_parsing", {}).get("files", {}).get(name)
        if not isinstance(parsed, dict) or parsed.get("sha256") != fingerprint:
            return []
        pages_by_index = {
            page.get("index"): page
            for page in parsed.get("pages", [])
            if isinstance(page, dict)
        }
        pages = []
        for number in sorted(set(page_numbers)):
            page = pages_by_index.get(number - 1)
            if page is None or page.get("finish_reason") == "length":
                continue
            text = str(page.get("text", "")).strip()
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
