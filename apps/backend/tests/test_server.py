import asyncio
import csv
import hashlib
import io
import json
import re
import zipfile
from dataclasses import replace
from pathlib import Path

import pytest
from app.api.app import RequestBodyLimitMiddleware, create_app
from app.api.app import logger as api_logger
from app.config import settings
from app.repositories.store import Store
from app.services.analysis import TABLES, analyze
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError, OperationalError
from test_core import sample_tables


def client_for(tmp_path, config=None, tables=None):
    run = analyze(tables or sample_tables(), {})
    store = Store(tmp_path)
    store.database.create_schema_for_tests()
    with store.uow_factory() as uow:
        uow.runs.save(run)
    return TestClient(create_app(store, config or settings))


def test_http_review_to_export(tmp_path):
    client = client_for(tmp_path)
    cases = client.get("/api/cases")
    assert cases.status_code == 200
    assert all("class_id" in item for item in cases.json())
    response = client.get("/api/draft", params={"student": "D01", "indicator": "T01I1"})
    assert response.status_code == 200
    assert response.json()["rule_id"] == "TR-08"
    assert response.json()["unknown_reason"] == "evidence_conflict"
    assert response.json()["evidence_record_ids"] == ["R4"]
    assert response.json()["node_id"] == "N01"
    assert response.json()["scope_required"] is False
    body = {
        "student_id": "D01",
        "indicator_id": "T01I1",
        "status": "edited",
        "diagnosis": "复核诊断",
        "recommendation": "先做一道练习",
        "adjustment_condition": "再次观察",
        "reason": "根据步骤",
        "evidence_record_ids": ["R2"],
        "original_draft": response.json(),
    }
    saved = client.post("/api/review", json=body)
    assert saved.status_code == 200
    assert saved.json()["version"] == 1
    response = client.get("/api/export", params={"cases": "D01,D02,D03"})
    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        recommendations = json.loads(archive.read("recommendations.json"))
        assert recommendations[0]["recommendation"] == "先做一道练习"
        assert len(json.loads(archive.read("student_cases.json"))) == 3
        contents = b"\n".join(archive.read(name) for name in archive.namelist())
        assert (
            re.search(
                rb"(?i)(?:sk-[A-Za-z0-9_-]{20,}|Bearer\s+[A-Za-z0-9._~-]{20,})",
                contents,
            )
            is None
        )
        assert (
            re.search(rb"[A-Z]:\\Users\\[^\\\r\n\"<>]+", contents, re.IGNORECASE)
            is None
        )
        assert str(tmp_path).replace("\\", "/").encode() not in contents


def test_release_preflight_blocks_missing_cases_and_invalidates_changed_review_fingerprint(
    tmp_path,
):
    client = client_for(tmp_path)
    params = {"case_ids": ["D01", "D02", "D03"], "node": "N01"}
    preflight = client.get("/api/release-checks", params=params)
    assert preflight.status_code == 200
    before = preflight.json()
    checks = {item["id"]: item for item in before["checks"]}
    assert checks["case_selection"]["status"] == "passed"
    assert checks["confirmed_cases"]["status"] == "blocked"
    assert checks["human_content_review"]["status"] == "not_checked"
    assert before["release_status"] == "blocked"

    draft = client.get(
        "/api/draft", params={"student": "D01", "indicator": "T01I1", "node": "N01"}
    ).json()
    saved = client.post(
        "/api/review",
        json={
            "student_id": "D01",
            "indicator_id": "T01I1",
            "status": "edited",
            "diagnosis": "需复核步骤",
            "recommendation": "教师安排短练习",
            "adjustment_condition": "再次观察",
            "reason": "核对当前证据",
            "source": "rule",
            "evidence_record_ids": draft["evidence_record_ids"],
            "original_draft": draft,
        },
    )
    assert saved.status_code == 200
    after = client.get("/api/release-checks", params=params).json()
    assert before["fingerprint"] != after["fingerprint"]

    response = client.post(
        "/api/export-submission",
        json={
            "run_id": before["run_id"],
            "case_ids": params["case_ids"],
            "node_id": "N01",
            "preflight_fingerprint": before["fingerprint"],
            "reviewer": "内容负责人",
            "content_reviewed": True,
        },
    )
    assert response.status_code == 400
    assert "预检后案例、复核、来源或报告已变化" in response.json()["error"]


def test_submission_preflight_and_zip_export_success_roundtrip_with_synthetic_records(
    tmp_path,
):
    tables = sample_tables()
    template = next(row for row in tables["作答记录"] if row["记录编号"] == "R2")
    for student_id, record_id, event_id, source_line in (
        ("D02", "R5", "E4", 6),
        ("D03", "R6", "E5", 7),
    ):
        tables["作答记录"].append(
            {
                **template,
                "记录编号": record_id,
                "学生编号": student_id,
                "作答事件编号": event_id,
                "_source_line": source_line,
            }
        )
    client = client_for(tmp_path, tables=tables)
    case_ids = ["D01", "D02", "D03"]
    case_payloads = {}
    reviewer = "Playwright 合成验收"
    signoff = client.post(
        "/api/source-verification",
        json={
            "indicator_id": "T01I1",
            "status": "verified",
            "curriculum_locator": "合成测试定位；不代表正式课标页码",
            "textbook_locator": "合成测试定位；不代表正式教材页码",
            "material_ids": ["Q001"],
            "reviewer": reviewer,
            "reason": "仅验证隔离测试数据库的发布流程。",
        },
    )
    assert signoff.status_code == 200, signoff.text

    for student_id in case_ids:
        draft_response = client.get(
            "/api/draft",
            params={"student": student_id, "indicator": "T01I1", "node": "N01"},
        )
        assert draft_response.status_code == 200, draft_response.text
        draft = draft_response.json()
        evidence_ids = draft["evidence_record_ids"]
        assert evidence_ids
        review = client.post(
            "/api/review",
            json={
                "student_id": student_id,
                "indicator_id": "T01I1",
                "status": "edited",
                "diagnosis": "合成测试诊断；不代表真实学生结论",
                "recommendation": "完成针对 Q001 的独立练习",
                "adjustment_condition": "教师核对步骤",
                "reason": "仅验证隔离测试数据库的发布流程。",
                "source": "rule",
                "evidence_record_ids": evidence_ids,
                "original_draft": draft,
                "structured_plan": {
                    "material_ids": ["Q001"],
                    "activity": "合成验收演示活动",
                    "steps": ["读取题目", "独立完成"],
                    "practice": ["完成 Q001 同型练习"],
                    "observation_points": ["记录解题步骤"],
                },
                "reviewer": reviewer,
            },
        )
        assert review.status_code == 200, review.text

        bundle_response = client.get(
            "/api/evidence-bundle",
            params={"student": student_id, "indicator": "T01I1", "node": "N01"},
        )
        assert bundle_response.status_code == 200, bundle_response.text
        bundle = bundle_response.json()
        refs = [
            {
                "kind": "response",
                "evidence_id": row["evidence_id"],
                "record_id": row["record_id"],
                "source_line": row["source_line"],
                "scope": bundle["scope"],
            }
            for row in bundle["responses"]
            if row["record_id"] in evidence_ids
        ]
        assert refs
        case_payload = {
            "student_id": student_id,
            "status": "confirmed",
            "need_type": "部分得分",
            "selection_reason": "合成测试夹具；不代表正式案例遴选。",
            "narrative": "合成案例叙述，仅用于验证 ZIP 生成流程。",
            "limitations": "所有记录均为自动化合成测试数据。",
            "evidence_record_ids": evidence_ids,
            "evidence_refs": refs,
            "review_refs": [
                {
                    "indicator_id": "T01I1",
                    "node_id": "N01",
                    "version": review.json()["version"],
                }
            ],
            "reviewer": reviewer,
        }
        case = client.post(
            "/api/teacher-case",
            json=case_payload,
        )
        assert case.status_code == 200, case.text
        case_payloads[student_id] = case_payload

    preflight = client.get(
        "/api/release-checks",
        params=[("case_ids", student_id) for student_id in case_ids]
        + [("node", "N01"), ("reviewer", reviewer), ("content_reviewed", "true")],
    )
    assert preflight.status_code == 200, preflight.text
    prepared = preflight.json()
    checks = {row["id"]: row for row in prepared["checks"]}
    assert prepared["release_status"] == "ready_with_open_checks"
    assert all(
        checks[key]["status"] == "passed"
        for key in (
            "case_selection",
            "confirmed_cases",
            "case_selection_reason",
            "evidence_references",
            "teacher_reviews",
            "source_signoffs",
            "case_report",
            "class_report",
            "human_content_review",
        )
    ), checks
    assert checks["independent_evaluation"]["status"] == "not_checked"

    changed_case = {
        **case_payloads["D01"],
        "narrative": "合成案例已在预检后修改；应要求重新预检。",
    }
    changed = client.post("/api/teacher-case", json=changed_case)
    assert changed.status_code == 200, changed.text
    stale_export = client.post(
        "/api/export-submission",
        json={
            "run_id": prepared["run_id"],
            "case_ids": case_ids,
            "node_id": "N01",
            "preflight_fingerprint": prepared["fingerprint"],
            "reviewer": reviewer,
            "content_reviewed": True,
        },
    )
    assert stale_export.status_code == 400
    assert "预检后案例、复核、来源或报告已变化" in stale_export.json()["error"]

    preflight = client.get(
        "/api/release-checks",
        params=[("case_ids", student_id) for student_id in case_ids]
        + [("node", "N01"), ("reviewer", reviewer), ("content_reviewed", "true")],
    )
    assert preflight.status_code == 200, preflight.text
    prepared = preflight.json()
    checks = {row["id"]: row for row in prepared["checks"]}
    assert prepared["release_status"] == "ready_with_open_checks"
    assert checks["confirmed_cases"]["status"] == "passed"
    assert checks["case_report"]["status"] == "passed"

    exported = client.post(
        "/api/export-submission",
        json={
            "run_id": prepared["run_id"],
            "case_ids": case_ids,
            "node_id": "N01",
            "preflight_fingerprint": prepared["fingerprint"],
            "reviewer": reviewer,
            "content_reviewed": True,
        },
    )
    assert exported.status_code == 200, exported.text
    assert exported.headers["content-type"].startswith("application/zip")
    with zipfile.ZipFile(io.BytesIO(exported.content)) as archive:
        names = set(archive.namelist())
        assert {
            "manifest.json",
            "release_checks.json",
            "case_reports.json",
            "class_report.json",
            "checksums.json",
            "submission-report.html",
        }.issubset(names)
        assert archive.testzip() is None
        manifest = json.loads(archive.read("manifest.json"))
        assert manifest["package_type"] == "competition_submission"
        assert manifest["release_status"] == "ready_with_open_checks"
        case_report = json.loads(archive.read("case_reports.json"))
        assert case_report["status"] == "ready"
        assert {
            case["student_id"] for case in case_report["cases"]
        } == set(case_ids)
        archived_checks = {
            row["id"]: row for row in json.loads(archive.read("release_checks.json"))
        }
        assert archived_checks["independent_evaluation"]["status"] == "not_checked"
        checksums = json.loads(archive.read("checksums.json"))
        assert set(checksums) == names - {"checksums.json"}
        for name, expected in checksums.items():
            assert hashlib.sha256(archive.read(name)).hexdigest() == expected


def test_import_files_rejects_request_body_over_http_limit(tmp_path):
    client = client_for(tmp_path)
    response = client.post(
        "/api/import-files",
        content=b" " * (20 * 1024 * 1024 + 1),
        headers={"content-type": "application/json"},
    )
    assert response.status_code == 413
    assert response.json()["code"] == "REQUEST_TOO_LARGE"
    assert client.get("/api/run").status_code == 200


def test_import_files_rejects_chunked_body_over_http_limit(tmp_path):
    client = client_for(tmp_path)

    def body_chunks():
        yield b" " * (10 * 1024 * 1024)
        yield b" " * (10 * 1024 * 1024 + 1)

    response = client.post(
        "/api/import-files",
        content=body_chunks(),
        headers={"content-type": "application/json"},
    )
    assert response.status_code == 413
    assert response.json()["code"] == "REQUEST_TOO_LARGE"


def test_import_files_rejects_invalid_utf8_without_changing_current_run(tmp_path):
    client = client_for(tmp_path)
    response = client.post(
        "/api/import-files",
        content=b'{"files":{"x.csv":"\xff"}}',
        headers={"content-type": "application/json"},
    )
    assert response.status_code == 400
    assert response.json()["code"] == "HTTP_ERROR"
    assert "traceback" not in response.text.lower()
    assert client.get("/api/run").status_code == 200


def test_request_body_middleware_times_out_slow_uploads():
    async def no_op_app(scope, receive, send):
        raise AssertionError("timed-out request must not reach the application")

    async def slow_receive():
        await asyncio.sleep(0.05)
        return {"type": "http.request", "body": b"{", "more_body": True}

    async def run():
        sent = []

        async def send(message):
            sent.append(message)

        middleware = RequestBodyLimitMiddleware(
            no_op_app, max_bytes=100, max_duration_seconds=0.001
        )
        await middleware(
            {
                "type": "http",
                "method": "POST",
                "headers": [],
                "path": "/api/import-files",
            },
            slow_receive,
            send,
        )
        return sent

    sent = asyncio.run(run())
    assert sent[0]["status"] == 408
    assert b"REQUEST_BODY_TIMEOUT" in sent[1]["body"]


def test_node_scoped_reviews_are_exported_as_distinct_current_decisions(tmp_path):
    tables = sample_tables()
    second_node_response = dict(tables["作答记录"][1])
    second_node_response.update(
        {
            "记录编号": "R5",
            "作答事件编号": "E5",
            "节点编号": "N02",
            "修订版本": "1",
            "_source_line": 7,
        }
    )
    tables["作答记录"].append(second_node_response)
    tables["测验节点"].append(
        {"节点编号": "N02", "可用题目编号": "Q001", "模拟测验日期": "2026-06-17"}
    )
    client = client_for(tmp_path, tables=tables)

    for node_id, record_id, recommendation in (
        ("N01", "R2", "N01 教学建议"),
        ("N02", "R5", "N02 教学建议"),
    ):
        draft_response = client.get(
            "/api/draft",
            params={"student": "D01", "indicator": "T01I1", "node": node_id},
        ).json()
        saved = client.post(
            "/api/review",
            json={
                "student_id": "D01",
                "indicator_id": "T01I1",
                "status": "edited",
                "diagnosis": f"{node_id} 诊断",
                "recommendation": recommendation,
                "reason": "按节点证据复核",
                "evidence_record_ids": [record_id],
                "original_draft": draft_response,
            },
        )
        assert saved.status_code == 200, saved.text

    archive_response = client.get("/api/export", params={"cases": "D01,D02,D03"})
    assert archive_response.status_code == 200
    with zipfile.ZipFile(io.BytesIO(archive_response.content)) as archive:
        recommendations = json.loads(archive.read("recommendations.json"))

    node_recommendations = [
        entry
        for entry in recommendations
        if entry["student_id"] == "D01" and entry["indicator_id"] == "T01I1"
    ]
    assert {
        (entry["node_id"], entry["recommendation"]) for entry in node_recommendations
    } == {("N01", "N01 教学建议"), ("N02", "N02 教学建议")}


def test_latest_source_verification_controls_task03_rule_draft(tmp_path):
    tables = sample_tables()
    tables["作答记录"] = [
        row for row in tables["作答记录"] if row["记录编号"] in {"R1", "R2"}
    ]
    client = client_for(tmp_path, tables=tables)

    revoked = client.post(
        "/api/source-verification",
        json={
            "indicator_id": "T01I1",
            "status": "rejected",
            "material_ids": ["Q001"],
            "reviewer": "教师甲",
            "reason": "复核后撤销",
        },
    )
    assert revoked.status_code == 200
    refreshed = client.get(
        "/api/draft", params={"student": "D01", "indicator": "T01I1", "node": "N01"}
    ).json()
    assert refreshed["material_ids"] == []

    verified = client.post(
        "/api/source-verification",
        json={
            "indicator_id": "T01I1",
            "status": "verified",
            "curriculum_locator": "课标第 1 页",
            "textbook_locator": "教材第 1 页",
            "material_ids": ["Q001"],
            "reviewer": "教师甲",
            "reason": "重新核验",
        },
    )
    assert verified.status_code == 200
    refreshed = client.get(
        "/api/draft", params={"student": "D01", "indicator": "T01I1", "node": "N01"}
    ).json()
    assert refreshed["material_ids"] == ["Q001"]


def test_export_rejects_empty_duplicate_and_unknown_case_ids(tmp_path):
    client = client_for(tmp_path)
    for case_ids in ("", "D01,D01,D03", "D01,D02,UNKNOWN"):
        response = client.get("/api/export", params={"cases": case_ids})
        assert response.status_code == 400
        assert response.json()["code"] == "INVALID_REQUEST"
        assert "三名不同的有效学生" in response.json()["error"]


def test_export_selected_case_bundle_member_scope_is_explicit(tmp_path):
    tables = sample_tables()
    tables["模拟学生"].append({"学生编号": "D04", "模拟班级编号": "C3"})
    outside_case = dict(tables["作答记录"][1])
    outside_case.update(
        {
            "记录编号": "R5",
            "学生编号": "D04",
            "作答事件编号": "E5",
            "修订版本": "1",
            "得分": "2",
            "_source_line": 7,
        }
    )
    tables["作答记录"].append(outside_case)
    client = client_for(tmp_path, tables=tables)
    response = client.get("/api/export", params={"cases": "D01,D02,D03"})
    assert response.status_code == 200

    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        selected_cases = json.loads(archive.read("student_cases.json"))
        all_metrics = json.loads(archive.read("all_metrics.json"))
        responses = json.loads(archive.read("responses.json"))
        raw_responses = json.loads(archive.read("raw_responses.json"))
        evidence = json.loads(archive.read("evidence_index.json"))
        review_history = json.loads(archive.read("teacher_review_history.json"))
        manifest = json.loads(archive.read("manifest.json"))
        observations = json.loads(archive.read("observations.json"))
        rubric = json.loads(archive.read("rubric_observations.json"))
        quality = json.loads(archive.read("data_quality.json"))
        metrics_csv = archive.read("metrics.csv").decode("utf-8-sig")
        field_notes = archive.read("字段与口径说明.md").decode("utf-8")

    assert {entry["student_id"] for entry in selected_cases} == {"D01", "D02", "D03"}
    assert all(not entry["key"].startswith("D04") for entry in all_metrics)
    assert all(row["学生编号"] in {"D01", "D02", "D03"} for row in responses)
    assert all(row["学生编号"] in {"D01", "D02", "D03"} for row in raw_responses)
    assert all(row["student_id"] in {"D01", "D02", "D03"} for row in evidence)
    assert set(review_history).issubset({"D01:T01I1", "D02:T01I1", "D03:T01I1"})
    assert manifest["package_type"] == "selected_student_cases"
    assert manifest["case_ids"] == ["D01", "D02", "D03"]
    assert all(
        row.get("student_id") in {None, "D01", "D02", "D03"}
        and row.get("class_id") in {None, "C1", "C2"}
        for row in observations
    )
    assert all(row.get("student_id") in {"D01", "D02", "D03"} for row in rubric)
    assert all(
        row["record_id"] in {item["记录编号"] for item in raw_responses}
        for row in quality["record_dispositions"]
    )
    assert all(
        row.get("record_id") in {item["记录编号"] for item in raw_responses}
        for row in quality["findings"]
    )
    assert "D04" not in metrics_csv
    assert "D04" not in field_notes


def test_shared_draft_contract_fixture(tmp_path):
    fixture = json.loads(
        (Path(__file__).parents[3] / "contracts/api/draft.json").read_text(
            encoding="utf-8"
        )
    )
    response = client_for(tmp_path).get(
        "/api/draft",
        params={"student": "D01", "indicator": "T01I1", "node": "N01"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert set(fixture).issubset(payload)
    assert payload["node_id"] == fixture["node_id"]
    assert isinstance(payload["scope_required"], bool)
    assert isinstance(payload["evidence_record_ids"], list)


def test_deepseek_does_not_override_tr08_conflict_baseline(tmp_path):
    response = client_for(tmp_path).post(
        "/api/deepseek", json={"student_id": "D01", "indicator_id": "T01I1"}
    )
    assert response.status_code == 200
    assert response.json()["rule_id"] == "TR-08"
    assert response.json()["unknown_reason"] == "evidence_conflict"
    assert response.json()["source"] == "rule"


def test_cross_node_draft_requires_explicit_node_and_does_not_call_model(
    tmp_path, monkeypatch
):
    config = replace(settings, deepseek_api_key="test-only-key")
    tables = sample_tables()
    tables["测验节点"].append({"节点编号": "N02", "可用题目编号": "Q001"})
    second_node = dict(tables["作答记录"][1])
    second_node.update(
        {
            "记录编号": "R5",
            "作答事件编号": "E5",
            "节点编号": "N02",
            "修订版本": "1",
            "得分": "2",
            "_source_line": 8,
        }
    )
    tables["作答记录"].append(second_node)
    client = client_for(tmp_path, config, tables)

    def unexpected_call(*args, **kwargs):
        raise AssertionError("跨节点范围未明确时不应请求模型")

    monkeypatch.setattr(
        "app.infrastructure.llm.deepseek_client.urllib.request.urlopen",
        unexpected_call,
    )
    response = client.post(
        "/api/deepseek", json={"student_id": "D01", "indicator_id": "T01I1"}
    )

    assert response.status_code == 200
    assert response.json()["scope_required"] is True
    assert response.json()["rule_id"] == "TR-08"
    assert response.json()["source"] == "rule"


def test_run_api_exposes_extended_quality_dispositions(tmp_path):
    payload = client_for(tmp_path).get("/api/run").json()
    quality = payload["quality"]
    assert quality["record_dispositions"]
    assert quality["disposition_counts"]["scored"] > 0
    assert "raw_status_counts" in quality
    assert "event_disposition_counts" in quality
    assert payload["rubric_observations"]


def test_draft_rejects_node_outside_current_run(tmp_path):
    response = client_for(tmp_path).get(
        "/api/draft",
        params={"student": "D01", "indicator": "T01I1", "node": "N99"},
    )
    assert response.status_code == 400
    assert response.json()["code"] == "INVALID_REQUEST"
    assert response.json()["error"] == "测验节点不存在"


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


def test_unexpected_error_log_omits_exception_text_and_traceback(tmp_path, monkeypatch):
    secret_marker = "synthetic-secret-marker-7d4a1b"
    application = create_app(Store(tmp_path))

    @application.get("/test-unexpected-error")
    def raise_unexpected_error():
        raise RuntimeError(
            f"database path D:\\Users\\Private\\state.sqlite key={secret_marker}"
        )

    client = TestClient(application, raise_server_exceptions=False)
    logged = []
    monkeypatch.setattr(
        api_logger, "error", lambda *args, **kwargs: logged.append((args, kwargs))
    )
    response = client.get("/test-unexpected-error")

    assert response.status_code == 500
    assert response.json()["code"] == "INTERNAL_ERROR"
    assert response.json()["request_id"]
    assert len(logged) == 1
    args, kwargs = logged[0]
    assert args == ("request failed (%s)", "RuntimeError")
    assert kwargs["extra"]["request_id"] == response.json()["request_id"]
    assert secret_marker not in repr(logged)
    assert "D:\\Users\\Private" not in repr(logged)
    assert "exc_info" not in kwargs


def test_api_not_found_uses_common_error_contract(tmp_path):
    response = client_for(tmp_path).get("/api/does-not-exist")
    assert response.status_code == 404
    assert response.json()["code"] == "NOT_FOUND"
    assert response.json()["request_id"]


def test_review_api_rejects_invalid_identity_and_cross_student_evidence(tmp_path):
    tables = sample_tables()
    other_student = dict(tables["作答记录"][1])
    other_student.update(
        {
            "记录编号": "R5",
            "学生编号": "D02",
            "作答事件编号": "E5",
            "修订版本": "1",
            "得分": "2",
            "_source_line": 7,
        }
    )
    tables["作答记录"].append(other_student)
    client = client_for(tmp_path, tables=tables)
    draft = client.get(
        "/api/draft", params={"student": "D01", "indicator": "T01I1", "node": "N01"}
    ).json()
    base = {
        "student_id": "D01",
        "indicator_id": "T01I1",
        "status": "edited",
        "diagnosis": "复核作答",
        "recommendation": "完成变式",
        "reason": "按节点证据复核",
        "evidence_record_ids": ["R2"],
        "original_draft": draft,
    }

    invalid_payloads = (
        {**base, "student_id": "UNKNOWN"},
        {**base, "student_id": "  "},
        {**base, "indicator_id": "I-UNKNOWN"},
        {**base, "evidence_record_ids": ["R5"]},
    )
    for payload in invalid_payloads:
        response = client.post("/api/review", json=payload)
        assert response.status_code == 400
        assert response.json()["code"] == "INVALID_REQUEST"
        assert "Traceback" not in response.text
    assert client.get("/api/reviews").json() == {}

    for params in (
        {"student": "", "indicator": "T01I1"},
        {"student": "D01", "indicator": ""},
        {"student": "D01", "indicator": "T01I1", "node": ""},
    ):
        response = client.get("/api/draft", params=params)
        assert response.status_code == 422
        assert response.json()["code"] == "VALIDATION_ERROR"


def test_application_lifespan_disposes_engine_on_shutdown(tmp_path, monkeypatch):
    store = Store(tmp_path)
    store.database.create_schema_for_tests()
    disposed = []
    monkeypatch.setattr(store.database, "dispose", lambda: disposed.append(True))
    with TestClient(create_app(store)) as client:
        assert client.get("/api/health").status_code == 200
    assert disposed == [True]


def test_run_and_review_history_persist_after_service_restart(tmp_path):
    store = Store(tmp_path)
    store.database.create_schema_for_tests()
    run = analyze(sample_tables(), {})
    with store.uow_factory() as uow:
        uow.runs.save(run)

    with TestClient(create_app(store)) as client:
        first = client.get("/api/run")
        assert first.status_code == 200
        assert first.json()["run_id"] == run["run_id"]
        draft = client.get(
            "/api/draft", params={"student": "D01", "indicator": "T01I1", "node": "N01"}
        ).json()
        saved = client.post(
            "/api/review",
            json={
                "student_id": "D01",
                "indicator_id": "T01I1",
                "status": "edited",
                "diagnosis": "复核步骤",
                "recommendation": "完成一道变式",
                "reason": "根据 R2 作答",
                "evidence_record_ids": ["R2"],
                "reviewer": "教师甲",
                "original_draft": draft,
            },
        )
        assert saved.status_code == 200, saved.text
        assert saved.json()["version"] == 1

    restarted_store = Store(tmp_path)
    with TestClient(create_app(restarted_store)) as restarted:
        current = restarted.get("/api/run")
        history = restarted.get("/api/reviews")
        assert current.status_code == 200
        assert current.json()["run_id"] == run["run_id"]
        assert history.status_code == 200
        assert history.json()["D01:T01I1"][0]["version"] == 1
        assert history.json()["D01:T01I1"][0]["node_id"] == "N01"


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
        rubric = json.loads(archive.read("rubric_observations.json"))
    assert quality["eligible_scored"] == 1
    assert reviewed[0]["recommendation"] == "先做一道基础练习"
    assert any(row["record_id"] == "R2" and row["source_line"] == 3 for row in evidence)
    assert rubric == run["rubric_observations"]


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
    requirements_path = source / "课程要求.csv"
    requirements_path.write_text(
        '主题编号,指标编号,观察指标\nT01,T01I1,"未闭合描述\n', encoding="utf-8"
    )
    malformed = client.post("/api/import", json={"folder": str(source)})
    assert malformed.status_code == 400
    assert "课程要求.csv 第 2 行 CSV 格式错误" in malformed.json()["error"]
    assert client.get("/api/run").json()["run_id"] == before

    requirements_path.write_bytes(b"\xff\xfe\xfa")
    invalid_encoding = client.post("/api/import", json={"folder": str(source)})
    assert invalid_encoding.status_code == 400
    assert "课程要求.csv 不是 UTF-8 编码" in invalid_encoding.json()["error"]
    assert client.get("/api/run").json()["run_id"] == before


def test_import_files_rejects_oversized_csv_without_changing_current_run(tmp_path):
    client = client_for(tmp_path)
    before = client.get("/api/run").json()["run_id"]
    response = client.post(
        "/api/import-files",
        json={"files": {"作答记录.csv": "x" * (16 * 1024 * 1024 + 1)}},
    )
    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_ERROR"
    assert response.json()["request_id"]
    assert client.get("/api/run").json()["run_id"] == before


@pytest.mark.parametrize(
    "payload",
    [
        {"files": []},
        {"files": {"作答记录.csv": ["not", "text"]}},
        {"files": {"作答记录.csv": 123}},
    ],
)
def test_import_files_rejects_invalid_container_and_content_types(tmp_path, payload):
    client = client_for(tmp_path)
    before = client.get("/api/run").json()["run_id"]

    response = client.post("/api/import-files", json=payload)

    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_ERROR"
    assert response.json()["request_id"]
    assert client.get("/api/run").json()["run_id"] == before


def test_deepseek_timeout_returns_rule_fallback(tmp_path: Path, monkeypatch):
    config = replace(settings, deepseek_api_key="test-only-key")
    clean_tables = sample_tables()
    clean_tables["作答记录"] = [
        row for row in clean_tables["作答记录"] if row["记录编号"] != "R4"
    ]
    for row in clean_tables["作答记录"]:
        if row["记录编号"] == "R2":
            row["评分点得分"] = ""
    client = client_for(tmp_path, config, clean_tables)

    def timeout(*args, **kwargs):
        raise TimeoutError("provider timeout")

    monkeypatch.setattr(
        "app.infrastructure.llm.deepseek_client.urllib.request.urlopen", timeout
    )
    fallback = client.post(
        "/api/deepseek", json={"student_id": "D01", "indicator_id": "T01I1"}
    )
    assert fallback.status_code == 200
    assert fallback.json()["source"] == "rule"
    assert fallback.json()["status"] == "needs_review"
    assert fallback.json()["model_fallback_reason"] == "provider_error"
    assert (
        client.get(
            "/api/draft", params={"student": "D01", "indicator": "T01I1"}
        ).status_code
        == 200
    )


def test_malformed_deepseek_response_returns_rule_fallback(tmp_path: Path, monkeypatch):
    config = replace(settings, deepseek_api_key="test-only-key")
    clean_tables = sample_tables()
    clean_tables["作答记录"] = [
        row for row in clean_tables["作答记录"] if row["记录编号"] != "R4"
    ]
    for row in clean_tables["作答记录"]:
        if row["记录编号"] == "R2":
            row["评分点得分"] = ""
    client = client_for(tmp_path, config, clean_tables)

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
    fallback = client.post(
        "/api/deepseek", json={"student_id": "D01", "indicator_id": "T01I1"}
    )
    assert fallback.status_code == 200
    assert fallback.json()["source"] == "rule"
    assert fallback.json()["status"] == "needs_review"
    assert fallback.json()["model_fallback_reason"] == "invalid_response"


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
    for unsafe_name in (
        "../allowed.pdf",
        "..\\allowed.pdf",
        "/allowed.pdf",
        "allowed.pdf/../../secret.pdf",
    ):
        unsafe = client.get("/api/source", params={"file": unsafe_name})
        assert unsafe.status_code == 400
        assert unsafe.json()["code"] == "INVALID_REQUEST"
    missing = client.get("/api/source", params={"file": "missing.pdf"})
    assert missing.status_code == 400
    assert missing.json()["code"] == "RESOURCE_NOT_FOUND"


def test_source_route_reads_configured_pdf_root_after_browser_style_import(tmp_path):
    metadata = tmp_path / "app-resources"
    metadata.mkdir()
    (metadata / "source_checks.json").write_text(
        json.dumps({"T01": {"textbook_slices": ["B05_相关资料切片.pdf"]}}),
        encoding="utf-8",
    )
    pdf_root = tmp_path / "contest-pdfs"
    pdf_root.mkdir()
    pdf_path = pdf_root / "B05_相关资料切片.pdf"
    pdf_path.write_bytes(b"%PDF-1.4 configured source")
    config = replace(
        settings,
        resources_dir=metadata,
        source_files_dir=pdf_root,
    )
    run = analyze(sample_tables(), {}, resources_dir=metadata)
    run["source_root"] = str(tmp_path / "temporary-browser-upload")
    store = Store(tmp_path / "state", metadata, config=config)
    store.database.create_schema_for_tests()
    with store.uow_factory() as uow:
        uow.runs.save(run)

    response = TestClient(create_app(store, config)).get(
        "/api/source", params={"file": pdf_path.name}
    )

    assert response.status_code == 200
    assert response.content == pdf_path.read_bytes()


def test_source_route_rejects_allowlisted_symlink_outside_resource_root(
    tmp_path: Path, monkeypatch
):
    resources = tmp_path / "resources"
    resources.mkdir()
    outside = tmp_path / "outside.pdf"
    outside.write_bytes(b"%PDF-1.4 outside")
    link = resources / "allowed.pdf"
    link.write_bytes(b"%PDF-1.4 in-root placeholder")
    outside_resolved = outside.resolve()
    original_resolve = Path.resolve

    def resolve(path, *args, **kwargs):
        if path == link:
            return outside_resolved
        return original_resolve(path, *args, **kwargs)

    monkeypatch.setattr(Path, "resolve", resolve)

    run = analyze(sample_tables(), {})
    run["source_index"][0]["source_check"]["textbook_slices"] = ["allowed.pdf"]
    store = Store(tmp_path / "state", resources)
    store.database.create_schema_for_tests()
    with store.uow_factory() as uow:
        uow.runs.save(run)
    response = TestClient(create_app(store)).get(
        "/api/source", params={"file": "allowed.pdf"}
    )
    assert response.status_code == 400
    assert response.json()["code"] == "RESOURCE_NOT_FOUND"


def test_static_asset_errors_use_common_error_contract(tmp_path: Path):
    config = replace(settings, web_dist_dir=tmp_path / "empty-dist")
    store = Store(tmp_path / "state")
    store.database.create_schema_for_tests()
    client = TestClient(create_app(store, config))
    response = client.get("/")
    assert response.status_code == 503
    assert response.json()["code"] == "WEB_ASSETS_UNAVAILABLE"
    assert response.json()["request_id"] == response.headers["X-Request-ID"]
