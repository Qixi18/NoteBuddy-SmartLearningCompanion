from unittest.mock import Mock
from pathlib import Path

from app.services.task02 import import_service as import_service_module
from app.services.task02.import_service import ImportService
from app.repositories.store import Store


def test_csv_import_parses_sources_and_persists_page_text_in_the_sqlite_snapshot(
    tmp_path, monkeypatch
):
    run = {
        "run_id": "csv-run",
        "created_at": "2026-11-27T00:00:00+00:00",
        "rule_version": "4",
        "source_index": [],
        "files": {},
    }
    runs = Mock()
    runs.list_run_ids.return_value = []
    sources = Mock()
    sources.resources_dir = tmp_path / "resources"
    sources.fingerprints.return_value = {
        "课程标准_2022.pdf": {"sha256": "pdf-hash", "bytes": 1234}
    }
    sources.allowed_names.return_value = {"课程标准_2022.pdf"}
    sources.parse_registered_pdfs.return_value = {
        "provider": "deepseek",
        "purpose": "rich_layout_recognition",
        "status": "complete",
        "file_count": 1,
        "parsed_file_count": 1,
        "files": {
            "课程标准_2022.pdf": {
                "status": "complete",
                "sha256": "pdf-hash",
                "page_count": 1,
            }
        },
    }
    sources.get_text_pages.return_value = {
        "available": True,
        "sha256": "pdf-hash",
        "text_status": "available",
        "source": "ocr",
        "pages": [{"page": 1, "text": "课程标准识别结果", "source": "ocr"}],
        "page_count": 1,
        "text_page_count": 1,
        "local_text_page_count": 0,
        "ocr_text_page_count": 1,
        "bytes": 1234,
    }
    monkeypatch.setattr(import_service_module, "read_bundle", lambda folder: ({}, {}))
    monkeypatch.setattr(import_service_module, "analyze", lambda *args, **kwargs: run)
    service = ImportService(runs, sources)
    service.ocr_client = object()

    result = service.import_folder(Path(tmp_path))

    sources.parse_registered_pdfs.assert_called_once()
    sources.get_text_pages.assert_called_once()
    saved = runs.save.call_args.args[0]
    assert saved["source_parsing"]["status"] == "complete"
    assert saved["course_sources"]["课程标准_2022.pdf"]["pages"][0]["text"] == "课程标准识别结果"
    assert result["course_sources"] == saved["course_sources"]


def test_course_page_text_round_trips_through_sqlite_snapshot(tmp_path):
    store = Store(tmp_path)
    store.database.create_schema_for_tests()
    run = {
        "run_id": "abc123abc123abcd",
        "created_at": "2026-11-27T00:00:00+00:00",
        "rule_version": "4",
        "source_index": [],
        "course_sources": {
            "课程标准_2022.pdf": {
                "available": True,
                "sha256": "same-pdf-fingerprint",
                "text_status": "available",
                "source": "ocr",
                "page_count": 1,
                "pages": [{"page": 1, "text": "保存到 SQLite 的 OCR 文字", "source": "ocr"}],
            }
        },
    }
    with store.uow_factory() as uow:
        uow.runs.save(run)

    restored = store.run_repository.current()
    assert restored["course_sources"]["课程标准_2022.pdf"]["pages"][0]["text"] == "保存到 SQLite 的 OCR 文字"
