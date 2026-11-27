"""本地文本优先：SourceService 文本提取与来源映射选页的回归测试。

对应《课程来源自动核验开发规划》4.1 / 4.2：

- 文字版 PDF 不该被标成 ``unparsed``、也不该被推去外部 OCR；
- 课标映射必须读到 CSV 登记的第 62/63 页，而不是文件最前面 20 个有文本页。
"""

from pathlib import Path

import pytest
from app.services.task01 import mapping_generation_service as mgs
from app.services.task01.source_service import SourceService

CURRICULUM = "课程标准_2022.pdf"
SLICE = "B05_相关资料切片.pdf"


def _run():
    return {
        "run_id": "run-1",
        "objectives": [
            {
                "指标编号": "T01I1",
                "观察指标": "识别同类项、去括号并化简",
                "课标文件页／正文页": "62／55",
            }
        ],
        "items": [
            {
                "材料编号": "Q001",
                "指标编号": "T01I1",
                "来源或资料文件": f"5_课程标准及相关教学资源/{SLICE}",
            }
        ],
        "source_index": [
            {
                "indicator_id": "T01I1",
                "source_check": {
                    "textbook_slices": [SLICE],
                    "curriculum_file_page": 62,
                    "curriculum_body_page": 55,
                },
            }
        ],
        "nodes": [],
    }


def _service(tmp_path) -> SourceService:
    source_dir = tmp_path / "sources"
    source_dir.mkdir()
    (source_dir / CURRICULUM).write_bytes(b"%PDF-1.4 curriculum")
    (source_dir / SLICE).write_bytes(b"%PDF-1.4 slice")
    return SourceService(
        tmp_path / "resources", source_files_dir=source_dir
    )


def test_text_pdf_is_readable_without_ocr(tmp_path, monkeypatch):
    service = _service(tmp_path)
    monkeypatch.setattr(
        SourceService, "extract_local_pages", lambda self, run, name: [
            {"page": 1, "text": "第三章 代数式 同类项与去括号"},
            {"page": 12, "text": "合并同类项时把系数相加。"},
        ]
    )
    monkeypatch.setattr(SourceService, "ocr_pages", lambda self, run, name: None)
    inspection = service.inspect_pdf(_run(), SLICE)

    assert inspection["available"] is True
    # 关键回归：有原生文本时不再因为"没有 OCR 缓存"而标成 unparsed。
    assert inspection["status"] == "readable"
    assert inspection["parse_status"] == "partial"
    assert inspection["text_status"] == "partial"
    assert inspection["text_source"] == "local"
    assert inspection["text_pages"] == [1, 12]
    assert inspection["local_text_page_count"] == 2


def test_scanned_pdf_reports_unavailable_text_until_ocr(tmp_path, monkeypatch):
    service = _service(tmp_path)
    monkeypatch.setattr(SourceService, "extract_local_pages", lambda self, run, name: [])
    monkeypatch.setattr(SourceService, "ocr_pages", lambda self, run, name: None)

    inspection = service.inspect_pdf(_run(), CURRICULUM)

    assert inspection["available"] is True
    assert inspection["parse_status"] == "unparsed"
    assert inspection["text_status"] == "unavailable"
    assert inspection["text_pages"] == []


def test_ocr_pages_are_merged_with_local_text(tmp_path, monkeypatch):
    service = _service(tmp_path)
    monkeypatch.setattr(
        SourceService,
        "extract_local_pages",
        lambda self, run, name: [{"page": 1, "text": "第一章 有理数"}],
    )
    monkeypatch.setattr(
        SourceService,
        "ocr_pages",
        lambda self, run, name: [
            {"index": 61, "text": "课程标准第62页正文：理解同类项与去括号"}
        ],
    )
    text = service.get_text_pages(_run(), CURRICULUM)

    assert text["text_page_count"] == 2
    assert text["local_text_page_count"] == 1
    assert text["ocr_text_page_count"] == 1
    assert text["source"] == "mixed"
    page_62 = service.page_text(_run(), CURRICULUM, 62)
    assert page_62 is not None and page_62["source"] == "ocr"


def test_extract_pages_returns_local_text_without_ocr(tmp_path, monkeypatch):
    """映射此前必须等 OCR 才能取原文；现在文字版 PDF 直接可读。"""
    service = _service(tmp_path)
    monkeypatch.setattr(
        SourceService,
        "extract_local_pages",
        lambda self, run, name: [{"page": 12, "text": "合并同类项与去括号的化简"}],
    )
    monkeypatch.setattr(SourceService, "ocr_pages", lambda self, run, name: None)

    pages = service.extract_pages(_run(), SLICE, [12])

    assert pages == [
        {"name": SLICE, "page": 12, "text": "合并同类项与去括号的化简", "text_source": "local"}
    ]


def test_preview_requests_ocr_for_every_pdf_with_missing_pages(tmp_path, monkeypatch):
    """部分可读教材仍需补齐缺失页，因此与扫描课标一起请求 OCR。"""
    service = _service(tmp_path)
    monkeypatch.setattr(
        SourceService,
        "extract_local_pages",
        lambda self, run, name: (
            [] if name == CURRICULUM else [{"page": 3, "text": "第三章 代数式 同类项"}]
        ),
    )
    monkeypatch.setattr(SourceService, "ocr_pages", lambda self, run, name: None)

    preview = service.preview_registered_pdfs(_run(), client=object())

    assert preview["will_send_count"] == 2
    assert preview["files"][CURRICULUM]["will_send"] is True
    assert preview["files"][CURRICULUM]["missing_pages"] == [62]
    assert preview["files"][SLICE]["will_send"] is True
    assert preview["files"][SLICE]["status"] == "ready"
    assert preview["run_id"] == "run-1"


def test_ocr_preview_fingerprint_changes_with_run(tmp_path, monkeypatch):
    """预览指纹绑定 run_id：换运行后旧确认必须失效。"""
    service = _service(tmp_path)
    monkeypatch.setattr(SourceService, "extract_local_pages", lambda self, run, name: [])
    monkeypatch.setattr(SourceService, "ocr_pages", lambda self, run, name: None)
    run = _run()
    first = service.preview_registered_pdfs(run, client=object())
    other = {**run, "run_id": "run-2"}
    second = service.preview_registered_pdfs(other, client=object())

    assert first["fingerprint"] != second["fingerprint"]


def test_curriculum_target_pages_use_registered_locator():
    objective = {"课标文件页／正文页": "62／55"}
    assert mgs._curriculum_target_pages(objective, {"curriculum_file_page": 62}) == [
        61,
        62,
        63,
    ]


class MappingSources:
    """模拟"课标只有第 62 页有文本"的来源服务。"""

    def __init__(self, pages: dict[str, list[int]]):
        self.pages = pages

    def inspect_pdf(self, run, name):
        numbers = self.pages.get(name, [])
        return {
            "available": bool(numbers),
            "page_count": 189 if name == CURRICULUM else 40,
            "text_pages": numbers,
            "text_page_count": len(numbers),
        }

    def extract_pages(self, run, name, page_numbers):
        available = set(self.pages.get(name, []))
        return [
            {"name": name, "page": page, "text": f"{name} 第 {page} 页原文"}
            for page in page_numbers
            if page in available
        ]


def test_mapping_references_read_curriculum_page_62_not_first_20_pages():
    """v1 只读 `text_pages[:20]`，第 62 页永远进不了模型输入。"""
    sources = MappingSources({CURRICULUM: [1, 2, 3, 4, 5, 61, 62, 63], SLICE: [12, 13]})
    refs, _fingerprint = mgs._references(_run(), sources, "T01I1")

    curriculum_pages = [
        ref["page"] for ref in refs if ref["source"] == CURRICULUM
    ]
    assert 62 in curriculum_pages
    assert curriculum_pages == [61, 62, 63]


def test_mapping_slice_pages_rank_by_indicator_keywords():
    """教材页按关键词相关度挑选，命中多的页优先进入模型输入。"""
    sources = MappingSources({CURRICULUM: [62], SLICE: [1, 2, 12, 30]})
    keywords = ["同类项", "去括号", "化简"]

    class RankedSources(MappingSources):
        def extract_pages(self, run, name, page_numbers):
            texts = {
                1: "第一章 有理数",
                2: "第二章 整式的加减",
                12: "合并同类项与去括号的化简",
                30: "小结",
            }
            return [
                {"name": name, "page": page, "text": texts.get(page, "")}
                for page in page_numbers
            ]

    ranked = RankedSources({CURRICULUM: [62], SLICE: [1, 2, 12, 30]})
    pages = mgs._slice_pages(ranked, _run(), SLICE, keywords)
    assert pages == [12]
