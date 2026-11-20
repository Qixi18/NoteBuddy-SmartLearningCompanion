import json
from dataclasses import replace

from app.api.app import create_app
from app.config import settings
from app.repositories.store import Store
from app.services.analysis import analyze
from fastapi.testclient import TestClient
from test_core import sample_tables


class EmptyAnalysisClient:
    def __init__(self):
        self.calls = 0

    def complete(self, body):
        self.calls += 1
        return {
            "choices": [
                {
                    "finish_reason": "stop",
                    "message": {"content": json.dumps({"findings": []})},
                }
            ]
        }


def client_for(tmp_path, *, legacy_key=False):
    database_url = f"sqlite:///{(tmp_path / 'ai-test.db').as_posix()}"
    config = replace(
        settings,
        data_dir=tmp_path,
        resources_dir=tmp_path / "resources",
        database_url_override=database_url,
        model_provider="deepseek",
        model_api_url="https://api.deepseek.com/chat/completions",
        model_api_key="" if legacy_key else "test-secret",
        deepseek_api_key="legacy-test-secret" if legacy_key else "",
        model_name="mock-model",
    )
    store = Store(tmp_path, database_url=database_url, config=config)
    store.database.create_schema_for_tests()
    with store.uow_factory() as uow:
        uow.runs.save(analyze(sample_tables(), {}))
    app = create_app(store, config)
    model = EmptyAnalysisClient()
    app.state.use_cases.ai_analysis.client = model
    return TestClient(app), model


def test_ai_analysis_post_returns_and_get_restores_direct_result(tmp_path):
    client, model = client_for(tmp_path)

    response = client.post(
        "/api/ai-analysis",
        json={
            "task": "task01",
            "action": "generate",
            "request_id": "req-1",
            "transmission_confirmed": True,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "complete"
    assert payload["model"] == "mock-model"
    assert payload["task"] == "task01"
    assert payload["analysis_id"]
    loaded = client.get("/api/ai-analysis", params={"task": "task01"})
    assert loaded.status_code == 200
    assert loaded.json()["analysis"]["analysis_id"] == payload["analysis_id"]
    assert model.calls == 1


def test_ai_analysis_supports_legacy_provider_key_without_exposing_it(tmp_path):
    client, model = client_for(tmp_path, legacy_key=True)
    preview = client.get("/api/ai-analysis", params={"task": "task01"})
    assert preview.status_code == 200
    assert preview.json()["model_configured"] is True
    assert "legacy-test-secret" not in preview.text

    generated = client.post(
        "/api/ai-analysis",
        json={
            "task": "task01",
            "request_id": "legacy-key",
            "transmission_confirmed": True,
        },
    )
    assert generated.status_code == 200, generated.text
    assert model.calls == 1


def test_ai_analysis_reuses_current_result_and_refreshes_on_request(tmp_path):
    client, model = client_for(tmp_path)
    request = {
        "task": "task01",
        "action": "generate",
        "request_id": "req-1",
        "transmission_confirmed": True,
    }
    first = client.post("/api/ai-analysis", json=request).json()
    idempotent = client.post("/api/ai-analysis", json=request).json()

    repeated = client.post(
        "/api/ai-analysis",
        json={**request, "request_id": "req-2"},
    ).json()
    refreshed = client.post(
        "/api/ai-analysis",
        json={**request, "action": "refresh", "request_id": "req-3"},
    ).json()

    assert idempotent["analysis_id"] == first["analysis_id"]
    assert repeated["analysis_id"] == first["analysis_id"]
    assert refreshed["analysis_id"] != first["analysis_id"]
    assert model.calls == 2


def test_ai_analysis_rejects_missing_node_and_unconfirmed_transfer(tmp_path):
    client, _ = client_for(tmp_path)

    missing_node = client.post(
        "/api/ai-analysis",
        json={
            "task": "task02",
            "action": "generate",
            "request_id": "req-node",
            "transmission_confirmed": True,
        },
    )
    unconfirmed = client.post(
        "/api/ai-analysis",
        json={
            "task": "task01",
            "action": "generate",
            "request_id": "req-consent",
            "transmission_confirmed": False,
        },
    )

    assert missing_node.status_code == 400
    assert "节点" in missing_node.json()["error"]
    assert unconfirmed.status_code == 422


def test_source_verification_change_marks_saved_analysis_stale(tmp_path):
    client, _ = client_for(tmp_path)
    generated = client.post(
        "/api/ai-analysis",
        json={
            "task": "task01",
            "action": "generate",
            "request_id": "req-stale",
            "transmission_confirmed": True,
        },
    ).json()
    assert (
        client.get("/api/ai-analysis", params={"task": "task01"}).json()["stale"]
        is False
    )

    store = client.app.state.store
    with store.uow_factory() as uow:
        uow.stage2.append_source(
            generated["run_id"],
            "T01I1",
            {"status": "pending", "reason": "test source update"},
        )

    loaded = client.get("/api/ai-analysis", params={"task": "task01"}).json()
    assert loaded["stale"] is True
    assert loaded["analysis"] is None


def test_partial_analysis_retries_only_failed_packet_and_keeps_prior_findings(tmp_path):
    database_url = f"sqlite:///{(tmp_path / 'retry.db').as_posix()}"
    config = replace(
        settings,
        data_dir=tmp_path,
        resources_dir=tmp_path / "resources",
        database_url_override=database_url,
        model_provider="deepseek",
        model_api_url="https://api.deepseek.com/chat/completions",
        model_api_key="test-secret",
        model_name="mock-model",
    )
    store = Store(tmp_path, database_url=database_url, config=config)
    store.database.create_schema_for_tests()
    run = analyze(sample_tables(), {})
    run["objectives"] = [
        {"主题编号": f"T{index}", "指标编号": f"I{index}", "观察指标": "概念" * 3000}
        for index in (1, 2)
    ]
    with store.uow_factory() as uow:
        uow.runs.save(run)
    app = create_app(store, config)

    class FailSecondPacket:
        calls = 0

        def complete(self, body):
            self.calls += 1
            if self.calls == 2:
                return {"choices": []}
            return {
                "choices": [
                    {
                        "finish_reason": "stop",
                        "message": {"content": '{"findings": []}'},
                    }
                ]
            }

    model = FailSecondPacket()
    app.state.use_cases.ai_analysis.client = model
    client = TestClient(app)
    request = {
        "task": "task01",
        "action": "generate",
        "request_id": "req-partial",
        "transmission_confirmed": True,
    }

    partial = client.post("/api/ai-analysis", json=request).json()
    retried = client.post(
        "/api/ai-analysis",
        json={
            **request,
            "action": "retry_failed",
            "analysis_id": partial["analysis_id"],
            "request_id": "req-retry",
        },
    ).json()

    assert partial["status"] == "partial"
    assert retried["status"] == "complete"
    assert retried["coverage"]["packet_total"] == 2
    assert retried["coverage"]["packet_succeeded"] == 2
    assert retried["coverage"]["failed_packet_ids"] == []
    assert model.calls == 3
