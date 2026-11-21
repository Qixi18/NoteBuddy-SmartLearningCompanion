from unittest.mock import Mock

import pytest
from app.application.use_cases.workbench import ImportFolder


def _use_case(fingerprint="fresh-preview"):
    service = Mock()
    service.runs.current.return_value = {"run_id": "run-1"}
    service.ocr_client = object()
    service.sources.preview_registered_pdfs.return_value = {
        "status": "ready",
        "will_send_count": 1,
        "fingerprint": fingerprint,
    }
    service.sources.parse_registered_pdfs.return_value = {"status": "complete"}
    return ImportFolder(service), service


def test_ocr_refuses_a_preview_that_changed_after_user_confirmation():
    use_case, service = _use_case()

    with pytest.raises(ValueError, match="预览已变化"):
        use_case.execute_ocr(True, "old-preview")

    service.sources.parse_registered_pdfs.assert_not_called()


def test_ocr_runs_only_when_the_confirmed_preview_still_matches():
    use_case, service = _use_case()

    result = use_case.execute_ocr(True, "fresh-preview")

    assert result == {"status": "complete"}
    service.sources.parse_registered_pdfs.assert_called_once()
