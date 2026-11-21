"""机器核验层（切片文本匹配）的服务与接口测试。"""

import json
from dataclasses import replace
from pathlib import Path

import pytest
from app.api.app import create_app
from app.config import settings
from app.repositories.store import Store
from app.services.analysis import analyze
from app.services.task01 import machine_verification_service as mvs
from fastapi.testclient import TestClient
from test_core import sample_tables


class StubSources:
    """resolve 恒返回占位路径；配合注入的抽取器即可脱离真实 PDF 测试。"""

    def __init__(self, pages):
        self.pages = pages

    def resolve(self, run, name):
        return Path("stub.pdf")


def sample_run(**overrides):
    run = analyze(sample_tables(), {})
    run["objectives"][0]["观察指标"] = overrides.get(
        "indicator_text", "solve equations by moving terms"
    )
    run["items"].append(
        {
            "材料编号": "B01",
            "材料类型": "教材",
            "来源或资料文件": "5_课程标准及相关教学资源/B01_相关资料切片.pdf",
        }
    )
    run["source_index"][0]["source_check"]["textbook_slices"] = [
        "B01_相关资料切片.pdf"
    ]
    # 追加一个关键词无法命中的指标，用于验证门控：低置信度不自动写入。
    run["objectives"].append(
        {
            "主题编号": "T01",
            "指标编号": "T01I2",
            "观察指标": "能进行整式的加减运算",
            "课标文件页／正文页": "62／55",
        }
    )
    return run


ENGLISH_PAGE = [
    {"page": 12, "text": "Solve the equations by moving terms across the equals sign."}
]


def test_indicator_keywords_splits_on_particles():
    assert mvs.indicator_keywords("识别同类项、去括号并化简") == [
        "识别同类项",
        "去括号",
        "化简",
    ]


def test_build_machine_verification_writes_machine_signoff_above_threshold(tmp_path):
    run = sample_run()
    payload = mvs.build_machine_verification(
        run, StubSources(ENGLISH_PAGE), "T01I1", extract_page_texts=lambda path: ENGLISH_PAGE
    )

    assert payload is not None
    assert payload["status"] == "verified"
    assert payload["verified_by"] == "machine"
    assert payload["confidence"] == 1.0
    assert payload["material_ids"]
    assert payload["resource_links"][0]["material_id"] == "B01"
    assert "第 12 页" in payload["resource_links"][0]["source_locator"]
    assert payload["machine_evidence"][0]["keywords_total"] == 5
    assert payload["machine_evidence"][0]["page"] == 12


def test_build_machine_verification_gates_below_threshold(tmp_path):
    run = sample_run(indicator_text="用整式解释具体问题")
    payload = mvs.build_machine_verification(
        run,
        StubSources(ENGLISH_PAGE),
        "T01I1",
        extract_page_texts=lambda path: ENGLISH_PAGE,
    )
    assert payload is None


def test_build_machine_verification_requires_known_indicator(tmp_path):
    run = sample_run()
    with pytest.raises(ValueError):
        mvs.build_machine_verification(
            run,
            StubSources(ENGLISH_PAGE),
            "NOPE",
            extract_page_texts=lambda path: ENGLISH_PAGE,
        )


def test_machine_verification_endpoint_writes_and_skips(tmp_path, monkeypatch):
    pdf_root = tmp_path / "pdfs"
    pdf_root.mkdir()
    (pdf_root / "B01_相关资料切片.pdf").write_bytes(b"%PDF-1.4 stub")
    config = replace(settings, source_files_dir=pdf_root)
    run = sample_run()
    store = Store(tmp_path / "state", config=config)
    store.database.create_schema_for_tests()
    with store.uow_factory() as uow:
        uow.runs.save(run)
    monkeypatch.setattr(mvs, "_page_texts", lambda path: ENGLISH_PAGE)
    client = TestClient(create_app(store, config))

    first = client.post("/api/source-machine-verification", json={})
    assert first.status_code == 200
    body = first.json()
    assert [record["indicator_id"] for record in body["verified"]] == ["T01I1"]
    record = body["verified"][0]
    assert record["verified_by"] == "machine"
    assert record["confidence"] == 1.0
    assert record["resource_links"][0]["material_id"] == "B01"
    assert any(
        item["indicator_id"] == "T01I2" and "低于阈值" in item["reason"]
        for item in body["skipped"]
    )

    listed = client.get("/api/source-verifications").json()
    assert listed["T01I1"][-1]["verified_by"] == "machine"
    assert listed["T01I1"][-1]["confidence"] == 1.0

    second = client.post("/api/source-machine-verification", json={})
    assert second.status_code == 200
    assert second.json()["verified"] == []
    assert second.json()["skipped"][0]["reason"].startswith("已有未过期")


def test_teacher_signoff_rejects_machine_signature_fields(tmp_path):
    client = TestClient(create_app(Store(tmp_path)))
    client.post("/api/import", json={"folder": "unused"})
    signoff = {
        "indicator_id": "T01I1",
        "status": "pending",
        "curriculum_locator": "62／55",
        "verified_by": "machine",
        "confidence": 0.9,
        "machine_evidence": [{"type": "forged"}],
    }
    response = client.post("/api/source-verification", json=signoff)
    assert response.status_code == 400
