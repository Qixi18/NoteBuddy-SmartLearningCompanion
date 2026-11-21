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
    run["objectives"][0]["课标文件页／正文页"] = "62／55"
    run["objectives"][0]["教材正文页"] = "上册68—109"
    run["items"].append(
        {
            "材料编号": "B01",
            "材料类型": "教材",
            "指标编号": "",
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
    # 切分片段在前，领域词表命中项在后（同类项由词表补充）。
    assert mvs.indicator_keywords("识别同类项、去括号并化简") == [
        "识别同类项",
        "去括号",
        "化简",
        "同类项",
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


def test_curriculum_ocr_match_confirms_locator(tmp_path):
    class StubSourcesWithOCR(StubSources):
        def ocr_pages(self, run, name):
            if name == "课程标准_2022.pdf":
                return [
                    {"index": 61, "text": "Solve the equations by moving terms across the equals sign."}
                ]
            return None

    run = sample_run()
    payload = mvs.build_machine_verification(
        run,
        StubSourcesWithOCR(ENGLISH_PAGE),
        "T01I1",
        extract_page_texts=lambda path: ENGLISH_PAGE,
    )

    curriculum = [
        entry
        for entry in payload["machine_evidence"]
        if entry["type"] == "curriculum_ocr_match"
    ]
    assert len(curriculum) == 1
    # OCR 命中页（index 61 → 文件页 62）与课程要求 CSV 定位一致 → 定位确认。
    assert curriculum[0]["page"] == 62
    assert curriculum[0]["locator_confirmed"] is True
    assert payload["confidence"] == 0.9  # 教材 1.0 × 课标确认折减 0.9


def test_curriculum_ocr_skip_when_not_parsed(tmp_path):
    run = sample_run()
    # StubSources 无 ocr_pages → 课标侧跳过，教材侧照常核验。
    payload = mvs.build_machine_verification(
        run,
        StubSources(ENGLISH_PAGE),
        "T01I1",
        extract_page_texts=lambda path: ENGLISH_PAGE,
    )
    assert payload is not None
    assert all(
        entry["type"] != "curriculum_ocr_match"
        for entry in payload["machine_evidence"]
    )


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


def test_knowledge_link_candidates_same_topic_and_cross_topic():
    from app.services.task01.knowledge_link_service import (
        build_knowledge_link_candidates,
    )

    run = {
        "objectives": [
            {"指标编号": "A1", "观察指标": "认识整式", "主题编号": "T1"},
            {"指标编号": "A2", "观察指标": "整式加减", "主题编号": "T1"},
            {"指标编号": "B1", "观察指标": "解一元一次方程", "主题编号": "T2"},
        ],
        "nodes": [
            {"节点编号": "N01", "模拟测验日期": "2026-01-20", "已教及测量主题": "T1"},
            {"节点编号": "N02", "模拟测验日期": "2026-06-17", "已教及测量主题": "T1、T2"},
        ],
    }

    assert build_knowledge_link_candidates(run, "A1") == []

    same_topic = build_knowledge_link_candidates(run, "A2")
    assert [(c["target_indicator_id"], c["relation"], c["rule"]) for c in same_topic] == [
        ("A1", "前置知识", "same_topic_previous")
    ]

    cross_topic = build_knowledge_link_candidates(run, "B1")
    assert [c["target_indicator_id"] for c in cross_topic] == ["A2"]
    assert cross_topic[0]["rule"] == "topic_teaching_order"
    assert "N02" in cross_topic[0]["evidence"]
    assert "2026-06-17" in cross_topic[0]["evidence"]

    with pytest.raises(ValueError):
        build_knowledge_link_candidates(run, "NOPE")


def test_teacher_confirmation_flow_after_machine_verification(tmp_path, monkeypatch):
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

    confirmed = client.post("/api/source-machine-verification", json={})
    assert confirmed.status_code == 200
    assert confirmed.json()["verified"][0]["verified_by"] == "machine"

    candidates = client.get(
        "/api/knowledge-link-candidates", params={"indicator_id": "T01I1"}
    )
    assert candidates.status_code == 200
    # 样例运行只有一个指标：T01I1 是首位，无系统候选，教师可直接确认。
    assert candidates.json()["candidates"] == []

    machine_record = confirmed.json()["verified"][0]
    judgment = {
        "indicator_id": "T01I1",
        "status": "verified",
        "curriculum_locator": machine_record["curriculum_locator"],
        "textbook_locator": machine_record["textbook_locator"],
        "material_ids": machine_record["material_ids"],
        "knowledge_links": [],
        "resource_links": machine_record["resource_links"],
        "source_fingerprints": machine_record["source_fingerprints"],
        "expected_version": 1,
        "reviewer": "数学教师甲",
        "reason": "确认机器核验结果并补充学习顺序判断",
        "verified_by": "teacher",
    }
    saved = client.post("/api/source-verification", json=judgment)
    assert saved.status_code == 200
    assert saved.json()["version"] == 2
    assert saved.json()["verified_by"] == "teacher"

    listed = client.get("/api/source-verifications").json()["T01I1"]
    assert listed[-1]["verified_by"] == "teacher"
    assert listed[-2]["verified_by"] == "machine"


def test_spot_check_records_audit_trail_on_machine_record(tmp_path, monkeypatch):
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

    confirmed = client.post("/api/source-machine-verification", json={})
    assert confirmed.status_code == 200

    spot = client.post(
        "/api/source-spot-check",
        json={
            "indicator_id": "T01I1",
            "reviewer": "数学教师乙",
            "verdict": "抽查通过",
            "checked_items": ["B01_相关资料切片.pdf 第 12 页"],
        },
    )
    assert spot.status_code == 200
    record = spot.json()
    assert record["status"] == "verified"
    assert record["verified_by"] == "machine"
    assert record["spot_checks"][-1]["reviewer"] == "数学教师乙"
    assert record["version"] == 1  # 抽查留痕不新增版本

    listed = client.get("/api/source-verifications").json()["T01I1"]
    assert listed[-1]["spot_checks"][-1]["verdict"] == "抽查通过"

    # 教师署名记录不接受抽查
    judgment = {
        "indicator_id": "T01I1",
        "status": "verified",
        "curriculum_locator": "62／55",
        "textbook_locator": "上册68—109",
        "material_ids": confirmed.json()["verified"][0]["material_ids"],
        "knowledge_links": [],
        "resource_links": confirmed.json()["verified"][0]["resource_links"],
        "source_fingerprints": confirmed.json()["verified"][0]["source_fingerprints"],
        "expected_version": 1,
        "reviewer": "数学教师甲",
        "reason": "确认机器核验结果",
        "verified_by": "teacher",
    }
    assert client.post("/api/source-verification", json=judgment).status_code == 200
    refused = client.post(
        "/api/source-spot-check",
        json={"indicator_id": "T01I1", "reviewer": "数学教师乙", "verdict": "抽查通过"},
    )
    assert refused.status_code == 400
    assert "机器核验" in refused.json()["error"]

    invalid = client.post(
        "/api/source-spot-check",
        json={"indicator_id": "T01I1", "reviewer": "数学教师乙", "verdict": "很好"},
    )
    assert invalid.status_code in (400, 422)  # 无效结论被 schema 或用例拒绝
