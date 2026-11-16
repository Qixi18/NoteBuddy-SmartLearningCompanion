import io
import csv
import json
import zipfile
from dataclasses import replace
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError, OperationalError

from app.api.app import create_app
from app.config import settings
from app.repositories.store import Store
from app.services.analysis import analyze
from app.services.analysis import TABLES
from test_core import sample_tables


def client_for(tmp_path, config=None):
    run = analyze(sample_tables(), {})
    store = Store(tmp_path)
    store.database.create_schema_for_tests()
    with store.uow_factory() as uow:
        uow.runs.save(run)
    return TestClient(create_app(store, config or settings))


def test_http_review_to_export(tmp_path):
    client = client_for(tmp_path)
    response = client.get("/api/draft", params={"student": "D01", "indicator": "T01I1"})
    assert response.status_code == 200
    assert response.json()["evidence_record_ids"] == ["R2"]
    body = {
        "student_id": "D01",
        "indicator_id": "T01I1",
        "status": "edited",
        "diagnosis": "复核诊断",
        "recommendation": "先做一道练习",
        "adjustment_condition": "再次观察",
        "reason": "根据步骤",
        "evidence_record_ids": ["R2"],
    }
    saved = client.post("/api/review", json=body)
    assert saved.status_code == 200
    assert saved.json()["version"] == 1
    response = client.get("/api/export", params={"cases": "D01,D02,D03"})
    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        recommendations = json.loads(archive.read("recommendations.json"))
        assert recommendations[0]["recommendation"] == "先做一道练习"
        assert len(json.loads(archive.read("student_cases.json"))) == 3


def test_health_and_validation_error_contract(tmp_path):
    client = client_for(tmp_path)
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    invalid = client.post("/api/import", json={"folder": ""})
    assert invalid.status_code == 422
    assert invalid.json()["code"] == "VALIDATION_ERROR"
    assert invalid.json()["request_id"]
    assert invalid.headers["X-Request-ID"] == invalid.json()["request_id"]
    relative = client.post("/api/import", json={"folder": "relative-folder"})
    assert relative.status_code == 422
    assert relative.json()["code"] == "VALIDATION_ERROR"


def test_api_error_does_not_expose_traceback(tmp_path):
    client = client_for(tmp_path)
    response = client.get(
        "/api/draft", params={"student": "missing", "indicator": "T01I1"}
    )
    assert response.status_code == 400
    assert response.json()["code"] == "INVALID_REQUEST"
    assert "Traceback" not in response.text


def test_api_not_found_uses_common_error_contract(tmp_path):
    response = client_for(tmp_path).get("/api/does-not-exist")
    assert response.status_code == 404
    assert response.json()["code"] == "NOT_FOUND"
    assert response.json()["request_id"]


def test_application_lifespan_disposes_engine_on_shutdown(tmp_path, monkeypatch):
    store = Store(tmp_path)
    store.database.create_schema_for_tests()
    disposed = []
    monkeypatch.setattr(store.database, "dispose", lambda: disposed.append(True))
    with TestClient(create_app(store)) as client:
        assert client.get("/api/health").status_code == 200
    assert disposed == [True]


def test_http_import_through_review_and_export(tmp_path: Path):
    source = tmp_path / "bundle"
    source.mkdir()
    for name, required in TABLES.items():
        rows = sample_tables().get(name, [])
        headers = list(
            dict.fromkeys(
                required
                + [key for row in rows for key in row if not key.startswith("_")]
            )
        )
        with (source / f"{name}.csv").open("w", encoding="utf-8", newline="") as file:
            writer = csv.DictWriter(file, fieldnames=headers, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(rows)

    store = Store(tmp_path / "state")
    store.database.create_schema_for_tests()
    client = TestClient(create_app(store))
    imported = client.post("/api/import", json={"folder": str(source)})
    assert imported.status_code == 200
    run = client.get("/api/run").json()
    assert run["run_id"] == imported.json()["run_id"]
    assert run["quality"]["eligible_scored"] == 1

    body = {
        "student_id": "D01",
        "indicator_id": "T01I1",
        "status": "edited",
        "diagnosis": "根据步骤复核",
        "recommendation": "先做一道基础练习",
        "adjustment_condition": "再次观察同类题",
        "reason": "端到端集成验证",
        "evidence_record_ids": ["R2"],
    }
    saved = client.post("/api/review", json=body)
    assert saved.status_code == 200
    assert saved.json()["version"] == 1

    archive_response = client.get("/api/export", params={"cases": "D01,D02,D03"})
    assert archive_response.status_code == 200
    with zipfile.ZipFile(io.BytesIO(archive_response.content)) as archive:
        quality = json.loads(archive.read("data_quality.json"))
        reviewed = json.loads(archive.read("recommendations.json"))
        evidence = json.loads(archive.read("evidence_index.json"))
    assert quality["eligible_scored"] == 1
    assert reviewed[0]["recommendation"] == "先做一道基础练习"
    assert any(row["record_id"] == "R2" and row["source_line"] == 3 for row in evidence)


def test_failed_import_keeps_current_run(tmp_path: Path):
    client = client_for(tmp_path)
    before = client.get("/api/run").json()["run_id"]
    source = tmp_path / "incomplete-bundle"
    source.mkdir()
    for name, required in TABLES.items():
        rows = sample_tables().get(name, [])
        headers = list(
            dict.fromkeys(
                required
                + [key for row in rows for key in row if not key.startswith("_")]
            )
        )
        if name == "作答记录":
            headers.remove("得分")
        with (source / f"{name}.csv").open("w", encoding="utf-8", newline="") as file:
            writer = csv.DictWriter(file, fieldnames=headers, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(rows)

    failed = client.post("/api/import", json={"folder": str(source)})
    assert failed.status_code == 400
    assert "作答记录.csv 缺少字段：得分" in failed.json()["error"]
    assert client.get("/api/run").json()["run_id"] == before


def test_deepseek_timeout_returns_safe_error_and_rule_draft_remains_available(
    tmp_path: Path, monkeypatch
):
    config = replace(settings, deepseek_api_key="test-only-key")
    client = client_for(tmp_path, config)

    def timeout(*args, **kwargs):
        raise TimeoutError("provider timeout")

    monkeypatch.setattr(
        "app.infrastructure.llm.deepseek_client.urllib.request.urlopen", timeout
    )
    failed = client.post(
        "/api/deepseek", json={"student_id": "D01", "indicator_id": "T01I1"}
    )
    assert failed.status_code == 502
    assert failed.json()["code"] == "MODEL_SERVICE_ERROR"
    assert "provider timeout" not in failed.text
    assert (
        client.get(
            "/api/draft", params={"student": "D01", "indicator": "T01I1"}
        ).status_code
        == 200
    )


def test_malformed_deepseek_response_uses_model_error_contract(
    tmp_path: Path, monkeypatch
):
    config = replace(settings, deepseek_api_key="test-only-key")
    client = client_for(tmp_path, config)

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *_):
            return None

        def read(self, *_):
            return json.dumps({"provider": "returned no choices"}).encode()

    monkeypatch.setattr(
        "app.infrastructure.llm.deepseek_client.urllib.request.urlopen",
        lambda *args, **kwargs: FakeResponse(),
    )
    failed = client.post(
        "/api/deepseek", json={"student_id": "D01", "indicator_id": "T01I1"}
    )
    assert failed.status_code == 502
    assert failed.json()["code"] == "MODEL_SERVICE_ERROR"


def test_review_rejects_unhashable_original_draft_evidence(tmp_path: Path):
    client = client_for(tmp_path)
    response = client.post(
        "/api/review",
        json={
            "student_id": "D01",
            "indicator_id": "T01I1",
            "status": "accepted",
            "evidence_record_ids": ["R2"],
            "original_draft": {"evidence_record_ids": [[]]},
        },
    )
    assert response.status_code == 400
    assert response.json()["error"] == "原草稿证据引用无效"


def test_database_review_conflict_and_busy_errors_are_safe(tmp_path: Path):
    from app.api.dependencies import get_use_cases

    store = Store(tmp_path)
    store.database.create_schema_for_tests()
    with store.uow_factory() as uow:
        uow.runs.save(analyze(sample_tables(), {}))
    app = create_app(store)

    class Failure:
        error = IntegrityError(
            "insert",
            {},
            RuntimeError("UNIQUE constraint failed: teacher_reviews.version"),
        )

        def execute(self, *_args):
            raise self.error

    original_use_cases = app.state.use_cases

    class UseCases:
        current_run = original_use_cases.current_run
        save_review = Failure()

    app.dependency_overrides[get_use_cases] = lambda: UseCases()
    client = TestClient(app)
    body = {"student_id": "D01", "indicator_id": "T01I1", "status": "accepted"}
    conflict = client.post("/api/review", json=body)
    assert conflict.status_code == 409
    assert conflict.json()["code"] == "REVIEW_VERSION_CONFLICT"
    assert "private database detail" not in conflict.text

    UseCases.save_review = type(
        "Busy",
        (),
        {
            "execute": lambda self, *_args: (_ for _ in ()).throw(
                OperationalError("write", {}, RuntimeError("database is locked"))
            )
        },
    )()
    busy = client.post("/api/review", json=body)
    assert busy.status_code == 503
    assert busy.json()["code"] == "DATABASE_BUSY"


def test_source_route_enforces_allowlist_and_reports_missing_files(tmp_path: Path):
    resources = tmp_path / "resources"
    resources.mkdir()
    (resources / "allowed.pdf").write_bytes(b"%PDF-1.4 test")
    run = analyze(sample_tables(), {})
    run["source_index"][0]["source_check"]["textbook_slices"] = [
        "allowed.pdf",
        "missing.pdf",
    ]
    state = tmp_path / "state"
    store = Store(state, resources)
    store.database.create_schema_for_tests()
    with store.uow_factory() as uow:
        uow.runs.save(run)
    client = TestClient(create_app(store))

    allowed = client.get("/api/source", params={"file": "allowed.pdf"})
    assert allowed.status_code == 200
    assert allowed.content.startswith(b"%PDF")
    rejected = client.get("/api/source", params={"file": "private.pdf"})
    assert rejected.status_code == 400
    missing = client.get("/api/source", params={"file": "missing.pdf"})
    assert missing.status_code == 400
    assert missing.json()["code"] == "RESOURCE_NOT_FOUND"


def test_static_asset_errors_use_common_error_contract(tmp_path: Path):
    config = replace(settings, web_dist_dir=tmp_path / "empty-dist")
    store = Store(tmp_path / "state")
    store.database.create_schema_for_tests()
    client = TestClient(create_app(store, config))
    response = client.get("/")
    assert response.status_code == 503
    assert response.json()["code"] == "WEB_ASSETS_UNAVAILABLE"
    assert response.json()["request_id"] == response.headers["X-Request-ID"]
