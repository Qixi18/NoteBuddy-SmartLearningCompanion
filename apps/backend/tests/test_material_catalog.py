from pathlib import Path

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


def test_catalog_reports_hash_page_bounds_and_scanned_page_review(tmp_path):
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
    assert textbook_entry["status"] == "needs_manual_review"
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
