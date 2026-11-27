from pathlib import Path
from unittest.mock import Mock

import pytest
from app.services.task01.material_catalog_service import build_material_catalog
from app.services.task01.source_service import SourceService
from pypdf import PdfWriter
from test_server import client_for


def _blank_pdf(path: Path, pages: int = 1) -> None:
    writer = PdfWriter()
    for _ in range(pages):
        writer.add_blank_page(width=612, height=792)
    with path.open("wb") as stream:
        writer.write(stream)


def test_catalog_reports_hash_page_bounds_and_scanned_page_ocr_state(tmp_path):
    source_dir = tmp_path / "sources"
    source_dir.mkdir()
    curriculum = source_dir / "课程标准_2022.pdf"
    textbook = source_dir / "B05_相关资料切片.pdf"
    _blank_pdf(curriculum, pages=1)
    _blank_pdf(textbook, pages=1)
    run = {
        "run_id": "run-1",
        "source_index": [
            {
                "indicator_id": "T01I1",
                "topic_id": "T01",
                "source_check": {
                    "curriculum_file_page": 2,
                    "curriculum_body_page": 1,
                    "textbook_slices": [textbook.name],
                },
                "indicator_check": {},
                "verification": "pending",
            }
        ],
        "items": [
            {
                "材料编号": "Q001",
                "主题编号": "T01",
                "指标编号": "T01I1",
                "材料类型": "题目",
                "题干或内容": "计算整式",
            },
            {
                "材料编号": "TB01",
                "主题编号": "T01",
                "指标编号": "",
                "材料类型": "教材",
                "题干或内容": "教材例题",
            },
        ],
    }
    sources = SourceService(tmp_path / "resources", source_files_dir=source_dir)

    first = build_material_catalog(run, sources, {})["indicators"][0]

    curriculum_entry = next(
        row for row in first["documents"] if row["name"] == curriculum.name
    )
    textbook_entry = next(
        row for row in first["documents"] if row["name"] == textbook.name
    )
    assert curriculum_entry["status"] == "page_out_of_range"
    assert curriculum_entry["page_count"] == 1
    assert curriculum_entry["expected_file_page"] == 2
    assert len(curriculum_entry["sha256"]) == 64
    assert textbook_entry["status"] == "ocr_pending"
    assert textbook_entry["page_count"] == 1
    assert {item["material_id"] for item in first["materials"]} == {"Q001"}

    old_hash = textbook_entry["sha256"]
    _blank_pdf(textbook, pages=2)
    second = build_material_catalog(run, sources, {})["indicators"][0]
    changed_entry = next(
        row for row in second["documents"] if row["name"] == textbook.name
    )
    assert changed_entry["sha256"] != old_hash
    assert changed_entry["page_count"] == 2

    run["source_index"][0]["source_check"]["curriculum_file_page"] = 0
    invalid_locator = build_material_catalog(run, sources, {})["indicators"][0]
    curriculum_entry = next(
        row for row in invalid_locator["documents"] if row["name"] == curriculum.name
    )
    assert curriculum_entry["status"] == "page_out_of_range"


def test_source_text_extraction_is_allowlisted_bounded_and_skips_scans(tmp_path):
    source_dir = tmp_path / "sources"
    source_dir.mkdir()
    curriculum = source_dir / "课程标准_2022.pdf"
    _blank_pdf(curriculum, pages=1)
    sources = SourceService(tmp_path / "resources", source_files_dir=source_dir)
    run = {"source_index": []}

    assert sources.extract_pages(run, curriculum.name, [1, 2]) == []
    with pytest.raises(ValueError, match="不在允许范围"):
        sources.extract_pages(run, "outside.pdf", [1])
    with pytest.raises(ValueError, match="1至20页"):
        sources.extract_pages(run, curriculum.name, list(range(1, 22)))

    curriculum.write_bytes(b"not a PDF")
    assert sources.extract_pages(run, curriculum.name, [1]) == []


def test_ocr_preview_only_marks_uncached_sources_for_explicit_send(tmp_path):
    source_dir = tmp_path / "sources"
    source_dir.mkdir()
    curriculum = source_dir / "课程标准_2022.pdf"
    _blank_pdf(curriculum, pages=2)
    cache = tmp_path / "cache"
    sources = SourceService(
        tmp_path / "resources", source_files_dir=source_dir, ocr_cache_dir=cache
    )
    run = {"source_index": []}
    client = Mock()

    preview = sources.preview_registered_pdfs(run, client)

    assert preview["will_send_count"] == 1
    assert preview["files"][curriculum.name]["will_send"] is True
    assert len(preview["fingerprint"]) == 64
    fingerprint = preview["files"][curriculum.name]["sha256"]
    sources._write_ocr_cache(
        fingerprint,
        {"sha256": fingerprint, "status": "complete", "page_count": 2, "pages": []},
    )
    cached = sources.preview_registered_pdfs(run, client)
    assert cached["will_send_count"] == 0
    assert cached["cached_count"] == 1
    assert cached["fingerprint"] != preview["fingerprint"]
    curriculum.write_bytes(curriculum.read_bytes() + b"changed")
    changed = sources.preview_registered_pdfs(run, client)
    assert changed["fingerprint"] != cached["fingerprint"]


def test_partial_native_text_requires_ocr_for_the_missing_pages(tmp_path):
    source_dir = tmp_path / "sources"
    source_dir.mkdir()
    textbook = source_dir / "B02_相关资料切片.pdf"
    _blank_pdf(textbook, pages=2)
    sources = SourceService(
        tmp_path / "resources",
        source_files_dir=source_dir,
        ocr_cache_dir=tmp_path / "cache",
    )
    sources.get_text_pages = Mock(
        return_value={
            "available": True,
            "sha256": "abc123",
            "text_status": "partial",
            "text_page_count": 1,
            "pages": [{"page": 1, "text": "可读的一页"}],
        }
    )

    assert sources.needs_ocr({"source_index": []}, textbook.name) is True


def test_ocr_result_rejects_missing_or_duplicate_page_indexes(tmp_path):
    source_dir = tmp_path / "sources"
    source_dir.mkdir()
    curriculum = source_dir / "课程标准_2022.pdf"
    _blank_pdf(curriculum, pages=2)
    cache = tmp_path / "cache"
    sources = SourceService(
        tmp_path / "resources", source_files_dir=source_dir, ocr_cache_dir=cache
    )
    run = {"source_index": []}
    client = Mock()
    client.recognize.return_value = {
        "page_count": 2,
        "pages": [{"index": 0, "text": "only first page", "finish_reason": "stop"}],
    }

    result = sources.parse_registered_pdfs(run, client)

    assert result["status"] == "failed"
    assert result["files"][curriculum.name]["reason"] == "incomplete_ocr_page_indexes"


def test_catalog_includes_unscoped_material_only_after_verified_mapping(tmp_path):
    source_dir = tmp_path / "sources"
    source_dir.mkdir()
    run = {
        "run_id": "run-2",
        "source_index": [
            {
                "indicator_id": "T01I1",
                "topic_id": "T01",
                "source_check": {},
                "indicator_check": {},
                "verification": "pending",
            }
        ],
        "items": [
            {
                "材料编号": "TB01",
                "主题编号": "T01",
                "指标编号": "",
                "材料类型": "教材",
                "题干或内容": "教材例题",
            }
        ],
    }
    sources = SourceService(tmp_path / "resources", source_files_dir=source_dir)
    pending = {"T01I1": [{"status": "pending", "resource_links": []}]}
    verified = {
        "T01I1": [
            {
                "status": "verified",
                "resource_links": [
                    {
                        "material_id": "TB01",
                        "status": "verified",
                        "source_locator": "教材第 68 页",
                    }
                ],
            }
        ]
    }

    assert (
        build_material_catalog(run, sources, pending)["indicators"][0]["materials"]
        == []
    )
    visible = build_material_catalog(run, sources, verified)["indicators"][0][
        "materials"
    ]
    assert visible[0]["material_id"] == "TB01"
    assert visible[0]["source_locator"] == "教材第 68 页"


def test_catalog_inspects_a_shared_pdf_once_per_response():
    run = {
        "run_id": "run-3",
        "source_index": [
            {
                "indicator_id": indicator,
                "topic_id": "T01",
                "source_check": {
                    "curriculum_file_page": 1,
                    "textbook_slices": ["shared.pdf"],
                },
            }
            for indicator in ("I1", "I2", "I3")
        ],
        "items": [],
    }
    sources = Mock()
    sources.inspect_pdf.return_value = {
        "available": False,
        "name": "shared.pdf",
    }

    catalog = build_material_catalog(run, sources, {})

    assert len(catalog["indicators"]) == 3
    assert sources.inspect_pdf.call_count == 2


def test_material_catalog_http_contract_is_available(tmp_path):
    client = client_for(tmp_path)

    response = client.get("/api/material-catalog")

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["run_id"]
    assert payload["indicators"]
    assert all(
        "documents" in item and "materials" in item for item in payload["indicators"]
    )
    client.close()
