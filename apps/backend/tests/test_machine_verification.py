"""机器核验层 v2（多维证据 + 原因码）的服务与接口测试。

与 v1 的差别（对应《课程来源自动核验开发规划》4.3）：

- 课标页没有文本时不再"跳过课标侧照样通过"，而是给出 TEXT_UNAVAILABLE；
- 关键词命中不再跨页合并，单页命中不足就是 TEXTBOOK_MISMATCH；
- 失败结论带稳定原因码，界面据此解释"为什么没有自动通过"。
"""

from dataclasses import replace
from pathlib import Path

import pytest
from app.api.app import create_app
from app.config import settings
from app.repositories.store import Store
from app.services.analysis import analyze
from app.services.task01 import machine_verification_service as mvs
from app.services.task01.source_service import SourceService
from fastapi.testclient import TestClient
from test_core import sample_tables

CURRICULUM = "课程标准_2022.pdf"
SLICE = "B01_相关资料切片.pdf"

# 观察指标 "识别同类项、去括号并化简" 的四个关键词里，这一页命中三个。
MATCHING_TEXT = "同类项与去括号的化简方法。"
UNRELATED_TEXT = "分数的加减运算与通分。"


def _pages(*entries):
    return [{"page": page, "text": text, "source": "local"} for page, text in entries]


class StubSources:
    """按文件名返回文本页与指纹，脱离真实 PDF 也能驱动核验逻辑。"""

    def __init__(self, pages_by_name: dict[str, list[dict]] | None = None):
        self.pages_by_name = pages_by_name or {}

    def resolve(self, run, name):
        return Path("stub.pdf") if name in self.pages_by_name else None

    def get_text_pages(self, run, name):
        pages = self.pages_by_name.get(name)
        if pages is None:
            return {
                "name": name,
                "available": False,
                "text_status": "missing",
                "pages": [],
                "page_count": None,
                "text_page_count": 0,
                "local_text_page_count": 0,
                "ocr_text_page_count": 0,
                "sha256": None,
                "bytes": None,
            }
        numbers = [page["page"] for page in pages]
        return {
            "name": name,
            "available": True,
            "text_status": "available" if pages else "unavailable",
            "pages": pages,
            "page_count": max(numbers) if numbers else None,
            "text_page_count": len(pages),
            "local_text_page_count": len(pages),
            "ocr_text_page_count": 0,
            "sha256": "a" * 64,
            "bytes": 10,
        }

    def fingerprints(self, run):
        return {
            name: {"sha256": "b" * 64, "bytes": 10} for name in self.pages_by_name
        }


def sample_run(**overrides):
    run = analyze(sample_tables(), {})
    run["objectives"][0]["观察指标"] = overrides.get(
        "indicator_text", "识别同类项、去括号并化简"
    )
    run["objectives"][0]["课标文件页／正文页"] = "62／55"
    run["objectives"][0]["教材正文页"] = "上册68—109"
    run["items"].append(
        {
            "材料编号": "B01",
            "材料类型": "教材",
            "指标编号": "",
            "来源或资料文件": f"5_课程标准及相关教学资源/{SLICE}",
        }
    )
    run["source_index"][0]["source_check"]["textbook_slices"] = [SLICE]
    # 追加一个没有关联题目的指标，用于验证 MATERIAL_NOT_LINKED。
    run["objectives"].append(
        {
            "主题编号": "T01",
            "指标编号": "T01I2",
            "观察指标": "能进行整式的加减运算",
            "课标文件页／正文页": "62／55",
        }
    )
    return run


def full_evidence():
    return {
        CURRICULUM: _pages((62, MATCHING_TEXT)),
        SLICE: _pages((12, MATCHING_TEXT)),
    }


def test_indicator_keywords_splits_on_particles():
    # 切分片段在前，领域词表命中项在后（同类项由词表补充）。
    assert mvs.indicator_keywords("识别同类项、去括号并化简") == [
        "识别同类项",
        "去括号",
        "化简",
        "同类项",
    ]


def test_all_evidence_present_verifies_and_records_machine_signoff():
    run = sample_run()
    report = mvs.build_machine_verification_report(
        run, StubSources(full_evidence()), "T01I1"
    )

    assert report["status"] == "verified"
    assert report["reason_code"] is None
    payload = report["payload"]
    assert payload["verified_by"] == "machine"
    assert payload["verification_version"] == mvs.VERIFICATION_VERSION
    assert payload["material_ids"] == ["Q001"]
    assert payload["resource_links"][0]["material_id"] == "B01"
    assert "第 12 页" in payload["resource_links"][0]["source_locator"]
    assert report["evidence"]["curriculum"]["page"] == 62
    assert report["evidence"]["textbook"]["page"] == 12
    assert all(check["status"] != "failed" for check in report["checks"])
    assert report["checks"] and {check["id"] for check in report["checks"]} == {
        "sources",
        "curriculum",
        "textbook",
        "item_link",
        "reference",
        "fingerprint",
    }


def test_curriculum_page_without_text_blocks_verification():
    """课标为扫描件且未 OCR 时，教材侧再匹配也不能自动通过。"""
    run = sample_run()
    sources = StubSources({CURRICULUM: [], SLICE: _pages((12, MATCHING_TEXT))})
    report = mvs.build_machine_verification_report(run, sources, "T01I1")

    assert report["status"] == "needs_review"
    assert report["reason_code"] == "TEXT_UNAVAILABLE"
    assert report["payload"] is None
    curriculum_check = next(c for c in report["checks"] if c["id"] == "curriculum")
    assert curriculum_check["status"] == "failed"
    assert "第 62 页" in curriculum_check["detail"]


def test_curriculum_content_mismatch_has_own_reason_code():
    run = sample_run()
    sources = StubSources(
        {CURRICULUM: _pages((62, UNRELATED_TEXT)), SLICE: _pages((12, MATCHING_TEXT))}
    )
    report = mvs.build_machine_verification_report(run, sources, "T01I1")

    assert report["status"] == "needs_review"
    assert report["reason_code"] == "CURRICULUM_MISMATCH"


def test_keyword_hits_on_different_pages_are_not_merged():
    """v1 会把两页各命中一个关键词合并成"命中2个"；v2 只看单页。"""
    run = sample_run()
    sources = StubSources(
        {
            CURRICULUM: _pages((62, MATCHING_TEXT)),
            SLICE: _pages((12, "同类项的定义。"), (13, "去括号的法则。")),
        }
    )
    report = mvs.build_machine_verification_report(run, sources, "T01I1")

    assert report["status"] == "needs_review"
    assert report["reason_code"] == "TEXTBOOK_MISMATCH"
    # 最好的一页只命中 1 个关键词——两页的命中没有被合并成 2 个。
    assert len(report["evidence"]["textbook"]["keywords_matched"]) == 1


def test_missing_source_file_is_reported_as_source_missing():
    run = sample_run()
    sources = StubSources({CURRICULUM: _pages((62, MATCHING_TEXT))})
    report = mvs.build_machine_verification_report(run, sources, "T01I1")

    assert report["status"] == "needs_review"
    assert report["reason_code"] == "SOURCE_MISSING"
    assert SLICE in report["reason"]


def test_indicator_without_linked_materials_is_not_verified():
    run = sample_run()
    report = mvs.build_machine_verification_report(
        run, StubSources(full_evidence()), "T01I2"
    )

    assert report["status"] == "needs_review"
    assert report["reason_code"] == "MATERIAL_NOT_LINKED"


def test_fabricated_ai_reference_is_rejected():
    run = sample_run()
    ai_mappings = [
        {
            "material_id": "Q001",
            "evidence": [
                {
                    "ref_id": "pdf-2",
                    "source": SLICE,
                    "page": 12,
                    "excerpt": "来源原文里根本没有这句话",
                }
            ],
        }
    ]
    report = mvs.build_machine_verification_report(
        run, StubSources(full_evidence()), "T01I1", ai_mappings=ai_mappings
    )

    assert report["status"] == "needs_review"
    assert report["reason_code"] == "REFERENCE_INVALID"


def test_known_indicator_required():
    run = sample_run()
    with pytest.raises(ValueError):
        mvs.build_machine_verification_report(
            run, StubSources(full_evidence()), "NOPE"
        )


def _endpoint_store(tmp_path):
    pdf_root = tmp_path / "pdfs"
    pdf_root.mkdir()
    (pdf_root / SLICE).write_bytes(b"%PDF-1.4 stub")
    (pdf_root / CURRICULUM).write_bytes(b"%PDF-1.4 curriculum")
    config = replace(settings, source_files_dir=pdf_root)
    run = sample_run()
    store = Store(tmp_path / "state", config=config)
    store.database.create_schema_for_tests()
    with store.uow_factory() as uow:
        uow.runs.save(run)
    return store, config, run


def _patch_pages(monkeypatch, pages_by_name):
    stub = StubSources(pages_by_name)

    def fake_get_text_pages(self, run, name):
        return stub.get_text_pages(run, name)

    monkeypatch.setattr(SourceService, "get_text_pages", fake_get_text_pages)
    return stub


def test_machine_verification_endpoint_returns_summary_and_results(
    tmp_path, monkeypatch
):
    store, config, run = _endpoint_store(tmp_path)
    _patch_pages(monkeypatch, full_evidence())
    client = TestClient(create_app(store, config))

    response = client.post(
        "/api/source-machine-verification", json={"run_id": run["run_id"]}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["run_id"] == run["run_id"]
    assert body["summary"] == {"total": 2, "verified": 1, "needs_review": 1, "skipped": 0}
    by_id = {item["indicator_id"]: item for item in body["results"]}
    assert by_id["T01I1"]["status"] == "verified"
    assert by_id["T01I1"]["verified_by"] == "machine"
    assert by_id["T01I1"]["version"] == 1
    assert by_id["T01I2"]["status"] == "needs_review"
    assert by_id["T01I2"]["reason_code"] == "MATERIAL_NOT_LINKED"
    # 兼容字段仍然返回已写入的记录。
    assert [record["indicator_id"] for record in body["verified"]] == ["T01I1"]
    record = body["verified"][0]
    assert record["confidence"] > 0.5
    assert record["resource_links"][0]["material_id"] == "B01"

    listed = client.get("/api/source-verifications").json()
    assert listed["T01I1"][-1]["verified_by"] == "machine"
    # 证据不足的指标写入待核验记录并保留原因码，绝不伪造成通过。
    assert listed["T01I2"][-1]["status"] == "pending"
    assert listed["T01I2"][-1]["reason_code"] == "MATERIAL_NOT_LINKED"

    again = client.post("/api/source-machine-verification", json={"run_id": run["run_id"]})
    assert again.status_code == 200
    again_body = again.json()
    assert again_body["summary"]["verified"] == 0
    assert again_body["summary"]["skipped"] == 1
    # 重复执行不产生无意义的新版本。
    assert listed["T01I1"][-1]["version"] == client.get("/api/source-verifications").json()["T01I1"][-1]["version"]
    assert len(client.get("/api/source-verifications").json()["T01I2"]) == 1
    assert any(
        item["indicator_id"] == "T01I1" and item["status"] == "skipped"
        for item in again_body["results"]
    )


def test_machine_verification_force_rechecks_without_duplicating_versions(
    tmp_path, monkeypatch
):
    store, config, run = _endpoint_store(tmp_path)
    _patch_pages(monkeypatch, full_evidence())
    client = TestClient(create_app(store, config))
    client.post("/api/source-machine-verification", json={"run_id": run["run_id"]})

    forced = client.post(
        "/api/source-machine-verification",
        json={"run_id": run["run_id"], "indicator_id": "T01I1", "force": True},
    )
    assert forced.status_code == 200
    body = forced.json()
    assert body["summary"]["verified"] == 0
    assert body["summary"]["skipped"] == 1
    assert body["results"][0]["status"] == "skipped"
    assert body["results"][0]["version"] == 1


def test_machine_verification_rejects_stale_run_id(tmp_path, monkeypatch):
    store, config, run = _endpoint_store(tmp_path)
    _patch_pages(monkeypatch, full_evidence())
    client = TestClient(create_app(store, config))

    response = client.post(
        "/api/source-machine-verification", json={"run_id": "old-run"}
    )
    assert response.status_code == 400
    assert "运行已变化" in response.json()["error"]


def test_machine_verification_never_overrides_teacher_rejection(tmp_path, monkeypatch):
    """教师驳回是人工结论；机器核验（含 force）不能把它改成通过。"""
    store, config, run = _endpoint_store(tmp_path)
    _patch_pages(monkeypatch, full_evidence())
    client = TestClient(create_app(store, config))

    rejected = client.post(
        "/api/source-verification",
        json={
            "indicator_id": "T01I1",
            "status": "rejected",
            "material_ids": ["Q001"],
            "reviewer": "数学教师甲",
            "reason": "教材切片与本指标不符，需人工复核",
            "expected_version": 0,
        },
    )
    assert rejected.status_code == 200

    for payload in (
        {"run_id": run["run_id"], "indicator_id": "T01I1"},
        {"run_id": run["run_id"], "indicator_id": "T01I1", "force": True},
    ):
        response = client.post("/api/source-machine-verification", json=payload)
        assert response.status_code == 200
        body = response.json()
        assert body["summary"]["verified"] == 0
        assert body["results"][0]["status"] == "skipped"
        assert "教师已驳回" in body["results"][0]["reason"]

    history = client.get("/api/source-verifications").json()["T01I1"]
    assert len(history) == 1
    assert history[-1]["status"] == "rejected"


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


def test_knowledge_link_candidates_do_not_infer_cross_topic_order_from_ambiguous_dates():
    from app.services.task01.knowledge_link_service import (
        build_knowledge_link_candidates,
    )

    run = {
        "objectives": [
            {"指标编号": "A1", "观察指标": "认识整式", "主题编号": "T1"},
            {"指标编号": "B1", "观察指标": "解方程", "主题编号": "T2"},
        ],
        "nodes": [
            {"节点编号": "N01", "模拟测验日期": "2026-01-20", "已教及测量主题": "T1"},
            {"节点编号": "N02", "模拟测验日期": "2026-01-20", "已教及测量主题": "T1、T2"},
        ],
    }

    assert build_knowledge_link_candidates(run, "B1") == []

    # Curriculum ordering is explicit and remains usable for same-topic suggestions.
    run["objectives"].append(
        {"指标编号": "B2", "观察指标": "方程应用", "主题编号": "T2"}
    )
    same_topic = build_knowledge_link_candidates(run, "B2")
    assert [(row["target_indicator_id"], row["rule"]) for row in same_topic] == [
        ("B1", "same_topic_previous")
    ]


def test_teacher_confirmation_flow_after_machine_verification(tmp_path, monkeypatch):
    store, config, run = _endpoint_store(tmp_path)
    _patch_pages(monkeypatch, full_evidence())
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
    store, config, run = _endpoint_store(tmp_path)
    _patch_pages(monkeypatch, full_evidence())
    client = TestClient(create_app(store, config))

    confirmed = client.post("/api/source-machine-verification", json={})
    assert confirmed.status_code == 200

    spot = client.post(
        "/api/source-spot-check",
        json={
            "indicator_id": "T01I1",
            "reviewer": "数学教师乙",
            "verdict": "抽查通过",
            "checked_items": [f"{SLICE} 第 12 页"],
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
    assert invalid.status_code == 422
