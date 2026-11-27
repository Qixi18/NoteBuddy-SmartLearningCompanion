"""Resolve allowlisted curriculum and textbook PDF sources.

本模块是自动核验的数据基础：它同时负责"文件是否在"和"文件里有没有可读文本"。
文本读取统一走 `get_text_pages()`，按以下优先级取页文本：

1. 当前分析运行 SQLite 快照中已保存的页文本；
2. 文件 SHA-256 对应的本地文本缓存（`source_text_cache/`）；
3. pypdf 提取的 PDF 原生文本；
4. 该页在 OCR 缓存中的文本。

调用方不能再自行用 pypdf 读原文，否则会出现两套文本口径。
"""

import hashlib
import io
import json
from datetime import UTC, datetime
from pathlib import Path
from pypdf import PdfReader

from ...application.ports.file_storage import FileStorage
from ...infrastructure.files.local_file_storage import LocalFileStorage
from ...infrastructure.llm.deepseek_ocr_client import (
    DeepSeekOCRError,
    DeepSeekOCRAdapter,
)

MAX_OCR_FILE_BYTES = 100 * 1024 * 1024
MAX_OCR_PAGES = 1000

# 文本缓存版本：解析算法变化时递增，旧缓存自动失效。
TEXT_CACHE_VERSION = "pdf-text-v1"
# 一页文本少于该字数视为"无有效文本"（扫描页、空白页）。
# 只用于过滤 OCR/抽取产生的 1-2 字噪声，短标题页仍算有文本。
MIN_PAGE_TEXT_CHARS = 4


def _page_has_text(text: str) -> bool:
    return len((text or "").strip()) >= MIN_PAGE_TEXT_CHARS


class SourceService:
    def __init__(
        self,
        resources_dir: Path,
        storage: FileStorage | None = None,
        source_files_dir: Path | None = None,
        ocr_cache_dir: Path | None = None,
        text_cache_dir: Path | None = None,
    ):
        self.resources_dir = Path(resources_dir)
        self.source_files_dir = Path(source_files_dir) if source_files_dir else None
        self.storage = storage or LocalFileStorage()
        self.ocr_cache_dir = Path(ocr_cache_dir) if ocr_cache_dir else None
        self.text_cache_dir = (
            Path(text_cache_dir)
            if text_cache_dir
            else (self.ocr_cache_dir.parent / "source_text_cache")
            if self.ocr_cache_dir
            else None
        )

    def allowed_names(self, run: dict) -> set[str]:
        names = {"课程标准_2022.pdf"}
        for entry in run["source_index"]:
            names.update(entry["source_check"].get("textbook_slices", []))
        return names

    def ocr_pages(self, run: dict, name: str) -> list[dict] | None:
        """Return OCR pages [{index, text}] for an allowlisted file, or None.

        数据来自 OCR 缓存（按文件指纹）；未触发 OCR 解析或解析失败时返回 None。
        """
        path = self.resolve(run, name)
        if path is None:
            return None
        try:
            fingerprint = hashlib.sha256(self.storage.read_bytes(path)).hexdigest()
        except (OSError, ValueError):
            return None
        parsed = self._read_ocr_cache(fingerprint)
        if not isinstance(parsed, dict):
            return None
        pages = parsed.get("pages")
        if not isinstance(pages, list) or not pages:
            return None
        return pages

    def extract_local_pages(self, run: dict, name: str) -> list[dict]:
        """提取 PDF 原生文本页 `[{page, text}]`，按文件指纹缓存。

        扫描件返回空列表（不报错）——调用方据此区分"文件缺失"和"文本不足"。
        """
        path = self.resolve(run, name)
        if path is None:
            return []
        try:
            content = self.storage.read_bytes(path)
        except (OSError, ValueError):
            return []
        fingerprint = hashlib.sha256(content).hexdigest()
        cached = self._read_text_cache(fingerprint)
        if cached is not None:
            return cached
        pages = self._extract_pdf_text(content)
        self._write_text_cache(
            fingerprint,
            {
                "sha256": fingerprint,
                "parser_version": TEXT_CACHE_VERSION,
                "bytes": len(content),
                "page_count": self._pdf_page_count(content),
                "pages": pages,
                "created_at": datetime.now(UTC).isoformat(),
            },
        )
        return pages

    def get_text_pages(self, run: dict, name: str) -> dict:
        """统一返回一份来源文件的有效页文本及每页文本来源。

        同一页同时存在本地文本与 OCR 文本时优先用 OCR（扫描件 OCR 是唯一来源，
        文字版 PDF 通常没有 OCR 文本），并在 `source` 上如实标注来源。
        """
        path = self.resolve(run, name)
        if path is None:
            return {
                "name": name,
                "available": False,
                "text_status": "missing",
                "source": None,
                "pages": [],
                "page_count": None,
                "text_page_count": 0,
                "local_text_page_count": 0,
                "ocr_text_page_count": 0,
                "sha256": None,
                "bytes": None,
            }
        try:
            content = self.storage.read_bytes(path)
        except (OSError, ValueError):
            return {
                "name": name,
                "available": False,
                "text_status": "unreadable",
                "source": None,
                "pages": [],
                "page_count": None,
                "text_page_count": 0,
                "local_text_page_count": 0,
                "ocr_text_page_count": 0,
                "sha256": None,
                "bytes": None,
            }
        fingerprint = hashlib.sha256(content).hexdigest()
        stored = (run.get("course_sources") or {}).get(name)
        if isinstance(stored, dict) and stored.get("sha256") == fingerprint:
            stored_pages = stored.get("pages")
            if isinstance(stored_pages, list):
                return {
                    "name": name,
                    "available": True,
                    "text_status": stored.get("text_status", "available"),
                    "source": stored.get("source"),
                    "pages": stored_pages,
                    "page_count": stored.get("page_count"),
                    "text_page_count": len(stored_pages),
                    "local_text_page_count": stored.get("local_text_page_count", 0),
                    "ocr_text_page_count": stored.get("ocr_text_page_count", 0),
                    "sha256": fingerprint,
                    "bytes": len(content),
                }
        page_count = self._pdf_page_count(content)
        local_pages = self.extract_local_pages(run, name)
        ocr_pages = self.ocr_pages(run, name) or []
        ocr_by_page = {
            int(page["index"]) + 1: str(page.get("text", ""))
            for page in ocr_pages
            if isinstance(page, dict) and isinstance(page.get("index"), int)
        }
        local_by_page = {
            int(page["page"]): str(page.get("text", ""))
            for page in local_pages
            if isinstance(page, dict) and isinstance(page.get("page"), int)
        }
        pages: list[dict] = []
        for number in sorted(set(local_by_page) | set(ocr_by_page)):
            ocr_text = ocr_by_page.get(number, "")
            local_text = local_by_page.get(number, "")
            if _page_has_text(ocr_text):
                pages.append({"page": number, "text": ocr_text, "source": "ocr"})
            elif _page_has_text(local_text):
                pages.append({"page": number, "text": local_text, "source": "local"})
        local_count = sum(1 for page in pages if page["source"] == "local")
        ocr_count = sum(1 for page in pages if page["source"] == "ocr")
        if not pages:
            text_status = "unavailable"
        elif page_count is not None and len(pages) >= page_count:
            text_status = "available"
        else:
            text_status = "partial"
        sources_present = {
            source for source in ("local", "ocr") if source in {page["source"] for page in pages}
        }
        return {
            "name": name,
            "available": True,
            "text_status": text_status,
            "source": sources_present.pop() if len(sources_present) == 1 else ("mixed" if sources_present else None),
            "pages": pages,
            "page_count": page_count,
            "text_page_count": len(pages),
            "local_text_page_count": local_count,
            "ocr_text_page_count": ocr_count,
            "sha256": fingerprint,
            "bytes": len(content),
        }

    def page_text(self, run: dict, name: str, page_number: int) -> dict | None:
        """取单页文本；该页无有效文本时返回 None（调用方据此给出 TEXT_UNAVAILABLE）。"""
        for page in self.get_text_pages(run, name)["pages"]:
            if page["page"] == page_number:
                return page
        return None

    def _extract_pdf_text(self, content: bytes) -> list[dict]:
        try:
            reader = PdfReader(io.BytesIO(content))
        except Exception:  # noqa: BLE001 - 损坏文件返回空文本，由上层判定 unreadable
            return []
        pages: list[dict] = []
        for index, page in enumerate(reader.pages, 1):
            try:
                text = page.extract_text() or ""
            except Exception:  # noqa: BLE001 - 单页解析失败不影响其他页
                continue
            if _page_has_text(text):
                pages.append({"page": index, "text": text})
        return pages

    def _pdf_page_count(self, content: bytes) -> int | None:
        try:
            return len(PdfReader(io.BytesIO(content)).pages)
        except Exception:  # noqa: BLE001 - 损坏 PDF 页数未知
            return None

    def _read_text_cache(self, fingerprint: str) -> list[dict] | None:
        if self.text_cache_dir is None:
            return None
        path = self.text_cache_dir / f"{fingerprint}.json"
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None
        if (
            not isinstance(value, dict)
            or value.get("sha256") != fingerprint
            or value.get("parser_version") != TEXT_CACHE_VERSION
            or not isinstance(value.get("pages"), list)
        ):
            return None
        return [page for page in value["pages"] if isinstance(page, dict)]

    def _write_text_cache(self, fingerprint: str, value: dict) -> None:
        if self.text_cache_dir is None:
            return
        self.text_cache_dir.mkdir(parents=True, exist_ok=True)
        target = self.text_cache_dir / f"{fingerprint}.json"
        temporary = target.with_suffix(".tmp")
        temporary.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")
        temporary.replace(target)

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
            if not self.needs_ocr(run, name):
                # 文字版 PDF 已有可用文本，不再发送外部 OCR（省费用、省等待）。
                files[name] = {
                    "status": "text_available",
                    "sha256": fingerprint,
                    "bytes": len(content),
                    "text_source": "local",
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
                seen_indexes = set()
                for page in result["pages"]:
                    if not isinstance(page, dict) or not isinstance(
                        page.get("index"), int
                    ):
                        continue
                    if page["index"] in seen_indexes or page["index"] < 0:
                        raise ValueError("invalid_ocr_page_indexes")
                    seen_indexes.add(page["index"])
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
                if seen_indexes != set(range(page_count)):
                    raise ValueError("incomplete_ocr_page_indexes")
                try:
                    local_page_count = len(PdfReader(io.BytesIO(content)).pages)
                except Exception:  # noqa: BLE001 - OCR can still report the parse error
                    local_page_count = None
                if local_page_count is not None and local_page_count != page_count:
                    raise ValueError("ocr_page_count_mismatch")
                parsed = {
                    "sha256": fingerprint,
                    "bytes": len(content),
                    "page_count": page_count,
                    "text_page_count": sum(
                        bool(page["text"].strip()) for page in pages
                    ),
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
            status in {"complete", "cached", "text_available"}
            and files[name].get("parse_status", "complete") == "complete"
            for name, status in zip(files, outcomes, strict=True)
        ):
            status = "complete"
        elif any(
            status in {"complete", "cached", "partial", "text_available"}
            for status in outcomes
        ):
            status = "partial"
        else:
            status = "failed" if names else "no_sources"
        return {
            "provider": "deepseek",
            "purpose": "rich_layout_recognition",
            "status": status,
            "file_count": len(files),
            "parsed_file_count": sum(
                entry.get("status") in {"complete", "cached", "partial", "text_available"}
                for entry in files.values()
            ),
            "files": files,
        }

    def required_page_numbers(self, run: dict) -> dict[str, set[int]]:
        """返回"必须能读到文本"的页码（课标定位页）。

        这些页缺失文本时，自动核验只能给出 TEXT_UNAVAILABLE，不能靠教材侧单独通过。
        """
        required: dict[str, set[int]] = {}
        for entry in run.get("source_index", []) or []:
            source_check = entry.get("source_check") or {}
            page = source_check.get("curriculum_file_page")
            if isinstance(page, int):
                required.setdefault("课程标准_2022.pdf", set()).add(page)
        return required

    def needs_ocr(self, run: dict, name: str) -> bool:
        """存在缺少原生文本的页面时，自动 OCR 补齐。"""
        text = self.get_text_pages(run, name)
        if not text["available"]:
            return False
        if text["sha256"] and self._read_ocr_cache(text["sha256"]) is not None:
            return False
        return text.get("text_status") != "available"

    def preview_registered_pdfs(
        self, run: dict, client: DeepSeekOCRAdapter | None
    ) -> dict:
        """Describe exactly which allowlisted PDFs would be sent to OCR.

        只有真正缺文本的页所在文件才会列为待发送：文字版教材切片不再被推给外部服务。
        """
        files = {}
        for name in sorted(self.allowed_names(run)):
            path = self.resolve(run, name)
            if path is None:
                files[name] = {
                    "status": "missing",
                    "will_send": False,
                    "reason": "source_missing",
                }
                continue
            content = self.storage.read_bytes(path)
            fingerprint = hashlib.sha256(content).hexdigest()
            cached = self._read_ocr_cache(fingerprint)
            text = self.get_text_pages(run, name)
            text_pages = {page["page"] for page in text["pages"]}
            required = sorted(self.required_page_numbers(run).get(name, set()))
            missing_pages = [page for page in required if page not in text_pages]
            if cached is not None:
                status, will_send = "cached", False
            elif not self.needs_ocr(run, name):
                status, will_send = "text_available", False
            elif client is None:
                status, will_send = "api_key_missing", False
            else:
                status, will_send = "ready", True
            files[name] = {
                "status": status,
                "will_send": will_send,
                "bytes": len(content),
                "sha256": fingerprint,
                "page_count": text["page_count"],
                "text_page_count": text["text_page_count"],
                "text_status": text["text_status"],
                "required_pages": required,
                "missing_pages": missing_pages,
                "reason": (
                    "api_key_missing"
                    if status == "api_key_missing"
                    else "text_unavailable"
                    if will_send
                    else None
                ),
            }
        send_count = sum(item["will_send"] for item in files.values())
        cached_count = sum(item["status"] == "cached" for item in files.values())
        text_count = sum(item["status"] == "text_available" for item in files.values())
        purpose = "rich_layout_recognition"
        fingerprint = hashlib.sha256(
            json.dumps(
                {
                    "provider": "deepseek",
                    "purpose": purpose,
                    "run_id": run.get("run_id", ""),
                    "files": files,
                },
                ensure_ascii=False,
                sort_keys=True,
                separators=(",", ":"),
            ).encode("utf-8")
        ).hexdigest()
        return {
            "provider": "deepseek",
            "purpose": purpose,
            "billing_unit": "successful_page",
            "run_id": run.get("run_id", ""),
            "fingerprint": fingerprint,
            "status": (
                "ready"
                if send_count and client
                else "api_key_missing"
                if send_count
                else "cached"
                if cached_count
                else "text_available"
                if text_count
                else "no_sources"
            ),
            "will_send_count": send_count,
            "cached_count": cached_count,
            "text_available_count": text_count,
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
        return (
            value
            if isinstance(value, dict) and value.get("sha256") == fingerprint
            else None
        )

    def _write_ocr_cache(self, fingerprint: str, value: dict) -> None:
        if self.ocr_cache_dir is None:
            return
        self.ocr_cache_dir.mkdir(parents=True, exist_ok=True)
        target = self.ocr_cache_dir / f"{fingerprint}.json"
        temporary = target.with_suffix(".tmp")
        temporary.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")
        temporary.replace(target)

    def inspect_pdf(self, run: dict, name: str) -> dict:
        """返回来源文件的读取状态与文本解析状态（两者相互独立）。

        - `available`/`status` 描述文件本身能否读取；
        - `text_status`/`parse_status` 描述能否取到内容文本。

        旧实现把"没有 OCR 缓存"直接判定为 `unparsed`，即使 PDF 本身带可提取文本，
        导致文字版教材也被要求走外部 OCR。现在只有真正没有文本的页才算 `unparsed`。
        """
        text = self.get_text_pages(run, name)
        if not text["available"]:
            missing = text["text_status"] == "missing"
            return {
                "available": False,
                "name": name,
                "status": "missing" if missing else "unreadable",
                "parse_status": text["text_status"],
                "text_status": text["text_status"],
                "text_source": None,
                "page_count": None,
                "text_page_count": 0,
                "text_pages": [],
                "local_text_page_count": 0,
                "ocr_text_page_count": 0,
            }
        page_count = text["page_count"]
        pages = text["pages"]
        text_pages = [page["page"] for page in pages]
        if page_count and len(text_pages) >= page_count:
            parse_status = "complete"
        elif text_pages:
            parse_status = "partial"
        else:
            parse_status = "unparsed"
        return {
            "available": True,
            "name": name,
            "sha256": text["sha256"],
            "bytes": text["bytes"],
            "status": "readable",
            "parse_status": parse_status,
            "text_status": text["text_status"],
            "text_source": text["source"],
            "page_count": page_count,
            "text_page_count": len(text_pages),
            "text_pages": text_pages,
            "local_text_page_count": text["local_text_page_count"],
            "ocr_text_page_count": text["ocr_text_page_count"],
        }

    def extract_pages(
        self, run: dict, name: str, page_numbers: list[int]
    ) -> list[dict]:
        """Return page text for explicitly selected, allowlisted PDF pages.

        文本来源已统一到 `get_text_pages()`：文字版 PDF 不需要先跑 OCR 就能取到原文。
        """
        if not page_numbers or len(page_numbers) > 20:
            raise ValueError("PDF文本提取页数必须为1至20页")
        pages_by_number = {
            page["page"]: page for page in self.get_text_pages(run, name)["pages"]
        }
        pages = []
        for number in sorted(set(page_numbers)):
            page = pages_by_number.get(number)
            if page is None:
                continue
            text = str(page.get("text", "")).strip()
            if text:
                pages.append(
                    {
                        "name": name,
                        "page": number,
                        "text": text[:12000],
                        "text_source": page.get("source"),
                    }
                )
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
