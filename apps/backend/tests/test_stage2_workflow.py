import io
import json
import zipfile
from dataclasses import replace

from app.config import settings
from test_server import client_for


def response_refs(client, student_id, indicator_id, node_id, record_ids):
    bundle = client.get(
        "/api/evidence-bundle",
        params={"student": student_id, "indicator": indicator_id, "node": node_id},
    ).json()
    return [
        {
            "kind": "response",
            "evidence_id": row["evidence_id"],
            "record_id": row["record_id"],
            "source_line": row["source_line"],
            "scope": bundle["scope"],
        }
        for row in bundle["responses"]
        if row["record_id"] in record_ids
    ]


def test_source_signoff_structured_plan_case_and_export_roundtrip(tmp_path):
    client = client_for(tmp_path)
    draft = client.get(
        "/api/draft", params={"student": "D01", "indicator": "T01I1", "node": "N01"}
    ).json()
    plan = {
        "material_ids": ["Q001"],
        "activity": "核对代数式步骤",
        "steps": ["先看原题", "再独立练习"],
        "practice": ["完成 Q001 的变式题"],
        "observation_points": ["记录代入步骤"],
    }
    review = {
        "student_id": "D01",
        "indicator_id": "T01I1",
        "status": "edited",
        "diagnosis": "教师核对步骤",
        "recommendation": "再做变式",
        "reason": "已查原始作答",
        "evidence_record_ids": draft["evidence_record_ids"],
        "original_draft": draft,
        "structured_plan": plan,
        "reviewer": "数学教师甲",
    }
    blocked = client.post("/api/review", json=review)
    assert blocked.status_code == 400
    assert "尚未完成" in blocked.json()["error"]

    signoff = {
        "indicator_id": "T01I1",
        "status": "verified",
        "curriculum_locator": "课标文件第 62 页",
        "textbook_locator": "教材上册第 68 页",
        "material_ids": ["Q001"],
        "knowledge_links": [],
        "reviewer": "数学教师甲",
        "reason": "逐页核对课标、教材和题目",
    }
    signed = client.post("/api/source-verification", json=signoff)
    assert signed.status_code == 200
    assert signed.json()["version"] == 1
    assert (
        client.get("/api/source-verifications").json()["T01I1"][0]["reviewer"]
        == "数学教师甲"
    )

    invalid_plans = (
        {**plan, "material_ids": ["Q999"]},
        {**plan, "material_ids": ["Q001", "Q001"]},
        {**plan, "activity": "  "},
        {**plan, "steps": []},
        {**plan, "practice": []},
        {**plan, "observation_points": []},
    )
    for invalid_plan in invalid_plans:
        rejected = client.post(
            "/api/review", json={**review, "structured_plan": invalid_plan}
        )
        assert rejected.status_code == 400
    assert client.get("/api/reviews").json() == {}

    saved = client.post("/api/review", json=review)
    assert saved.status_code == 200, saved.text
    assert saved.json()["structured_plan"] == plan
    assert saved.json()["source_verification_versions"] == {"T01I1": 1}
    assert client.get("/api/reviews").json()["D01:T01I1"][0]["structured_plan"] == plan

    case = {
        "student_id": "D01",
        "status": "confirmed",
        "narrative": "本节点作答需核对代入步骤",
        "limitations": "仅依据 N01 的已选记录，不代表全班",
        "evidence_record_ids": draft["evidence_record_ids"],
        "evidence_refs": response_refs(
            client, "D01", "T01I1", "N01", draft["evidence_record_ids"]
        ),
        "need_type": "部分得分",
        "selection_reason": "通过原始步骤证据选取该案例用于过程核对。",
        "review_refs": [{"indicator_id": "T01I1", "node_id": "N01", "version": 1}],
        "reviewer": "数学教师甲",
    }
    confirmed = client.post("/api/teacher-case", json=case)
    assert confirmed.status_code == 200, confirmed.text
    assert client.get("/api/teacher-cases").json()["D01"][0]["status"] == "confirmed"

    response = client.get("/api/export", params={"cases": "D01,D02,D03"})
    assert response.status_code == 200
    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        assert (
            json.loads(archive.read("confirmed_cases.json"))[0]["student_id"] == "D01"
        )
        assert (
            json.loads(archive.read("verified_source_relations.json"))[0][
                "indicator_id"
            ]
            == "T01I1"
        )
        recommendations = json.loads(archive.read("recommendations.json"))
        assert recommendations[0]["structured_plan"] == plan
        assert recommendations[0]["material_ids"] == ["Q001"]
        assert "student_cases.json" in archive.namelist()

    forged_case = client.post(
        "/api/teacher-case",
        json={
            **case,
            "status": "confirmed",
            "evidence_record_ids": ["UNKNOWN-RECORD"],
        },
    )
    assert forged_case.status_code == 400

    revoked = client.post(
        "/api/source-verification",
        json={**signoff, "status": "rejected", "reason": "复查后撤销"},
    )
    assert revoked.status_code == 200
    assert client.get("/api/reviews").json()["D01:T01I1"][0]["version"] == 1
    assert client.get("/api/teacher-cases").json()["D01"][0]["status"] == "confirmed"
    response = client.get("/api/export", params={"cases": "D01,D02,D03"})
    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        assert json.loads(archive.read("confirmed_cases.json")) == []
        recommendation = json.loads(archive.read("recommendations.json"))[0]
        assert recommendation["material_ids"] == []
        assert "structured_plan" not in recommendation


def test_teaching_plan_v2_is_revalidated_on_save_and_export(tmp_path):
    from test_core import sample_tables

    tables = sample_tables()
    tables["作答记录"] = [row for row in tables["作答记录"] if row["记录编号"] != "R4"]
    client = client_for(tmp_path, tables=tables)
    signoff = {
        "indicator_id": "T01I1",
        "status": "verified",
        "curriculum_locator": "课标第 62 页",
        "textbook_locator": "教材第 68 页",
        "material_ids": ["Q001"],
        "reviewer": "数学教师甲",
        "reason": "逐项核对来源",
    }
    assert client.post("/api/source-verification", json=signoff).status_code == 200
    draft = client.get(
        "/api/draft", params={"student": "D01", "indicator": "T01I1", "node": "N01"}
    ).json()
    plan = draft["teaching_plan_preview"]
    assert plan is not None, draft
    assert plan["schema_version"] == 2
    assert plan["scope"] == {
        "run_id": draft["run_id"],
        "student_id": "D01",
        "indicator_id": "T01I1",
        "node_id": "N01",
    }
    assert plan["material_ids"] == ["Q001"]

    saved = client.post(
        "/api/review",
        json={
            "student_id": "D01",
            "indicator_id": "T01I1",
            "status": "edited",
            "diagnosis": "教师核对步骤",
            "recommendation": "再做变式",
            "reason": "方案已复核",
            "evidence_record_ids": draft["evidence_record_ids"],
            "original_draft": draft,
            "teaching_plan_v2": plan,
            "reviewer": "数学教师甲",
        },
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["teaching_plan_v2"] == plan
    assert saved.json()["source_verification_versions"] == {"T01I1": 1}
    assert saved.json()["structured_plan"]["material_ids"] == ["Q001"]

    confirmed = client.post(
        "/api/teacher-case",
        json={
            "student_id": "D01",
            "status": "confirmed",
            "narrative": "根据当前节点证据复核后形成方案。",
            "limitations": "结论仅限已列出的有效评分记录。",
            "evidence_record_ids": draft["evidence_record_ids"],
            "evidence_refs": response_refs(
                client, "D01", "T01I1", "N01", draft["evidence_record_ids"]
            ),
            "need_type": "部分得分",
            "selection_reason": "该案例有可复核的当前节点步骤证据。",
            "review_refs": [{"indicator_id": "T01I1", "node_id": "N01", "version": 1}],
            "reviewer": "数学教师甲",
        },
    )
    assert confirmed.status_code == 200, confirmed.text

    response = client.get("/api/export", params={"cases": "D01,D02,D03"})
    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        recommendations = json.loads(archive.read("recommendations.json"))
        assert recommendations[0]["teaching_plan_v2"] == plan
        assert len(json.loads(archive.read("confirmed_cases.json"))) == 1

    revoked = client.post(
        "/api/source-verification",
        json={**signoff, "status": "rejected", "reason": "复核后撤销"},
    )
    assert revoked.status_code == 200
    response = client.get("/api/export", params={"cases": "D01,D02,D03"})
    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        recommendation = json.loads(archive.read("recommendations.json"))[0]
        assert "teaching_plan_v2" not in recommendation
        assert recommendation["teaching_plan_v2_status"] == "evidence_or_source_changed"
        assert json.loads(archive.read("confirmed_cases.json")) == []


def test_unverified_source_and_unconfirmed_case_never_enter_confirmed_export(tmp_path):
    client = client_for(tmp_path)
    pending = client.post(
        "/api/source-verification",
        json={
            "indicator_id": "T01I1",
            "status": "pending",
            "material_ids": ["Q001"],
            "reviewer": "数学教师甲",
            "reason": "待逐页核对",
        },
    )
    assert pending.status_code == 200
    candidate = client.post(
        "/api/teacher-case",
        json={
            "student_id": "D01",
            "status": "draft",
            "narrative": "候选",
            "limitations": "未核查",
            "evidence_record_ids": [],
            "review_refs": [],
        },
    )
    assert candidate.status_code == 200
    response = client.get("/api/export", params={"cases": "D01,D02,D03"})
    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        assert json.loads(archive.read("verified_source_relations.json")) == []
        assert json.loads(archive.read("confirmed_cases.json")) == []


def test_source_verification_expected_version_rejects_stale_editor(tmp_path):
    client = client_for(tmp_path)
    payload = {
        "indicator_id": "T01I1",
        "status": "pending",
        "material_ids": ["Q001"],
        "reviewer": "数学教师甲",
        "reason": "待逐页核对",
    }
    first = client.post(
        "/api/source-verification", json={**payload, "expected_version": 0}
    )
    assert first.status_code == 200
    assert first.json()["version"] == 1

    stale = client.post(
        "/api/source-verification", json={**payload, "expected_version": 0}
    )
    assert stale.status_code == 409
    assert client.get("/api/source-verifications").json()["T01I1"] == [first.json()]

    current = client.post(
        "/api/source-verification", json={**payload, "expected_version": 1}
    )
    assert current.status_code == 200
    assert current.json()["version"] == 2


def test_confirmed_case_requires_teacher_content_evidence_and_review_reference(
    tmp_path,
):
    client = client_for(tmp_path)
    draft = client.get(
        "/api/draft", params={"student": "D01", "indicator": "T01I1", "node": "N01"}
    ).json()
    signoff = client.post(
        "/api/source-verification",
        json={
            "indicator_id": "T01I1",
            "status": "verified",
            "curriculum_locator": "课标第 62 页",
            "textbook_locator": "教材第 68 页",
            "material_ids": ["Q001"],
            "reviewer": "数学教师甲",
            "reason": "逐页核对",
        },
    )
    assert signoff.status_code == 200
    saved_review = client.post(
        "/api/review",
        json={
            "student_id": "D01",
            "indicator_id": "T01I1",
            "status": "edited",
            "diagnosis": "教师已复核作答步骤",
            "recommendation": "再做一道变式",
            "reason": "检查原始作答",
            "evidence_record_ids": ["R2"],
            "original_draft": draft,
            "structured_plan": {
                "material_ids": ["Q001"],
                "activity": "按步骤核验",
                "steps": ["回看题目", "独立演算"],
                "practice": ["完成变式"],
                "observation_points": ["记录关键步骤"],
            },
            "reviewer": "数学教师甲",
        },
    )
    assert saved_review.status_code == 200, saved_review.text
    bundle = client.get(
        "/api/evidence-bundle",
        params={"student": "D01", "indicator": "T01I1", "node": "N01"},
    ).json()
    selected_evidence = next(
        row for row in bundle["responses"] if row["record_id"] == "R2"
    )
    valid = {
        "student_id": "D01",
        "status": "confirmed",
        "need_type": "部分得分",
        "selection_reason": "当前节点有可复核的部分得分步骤证据。",
        "narrative": "按步骤核查该节点作答",
        "limitations": "仅代表该节点证据",
        "evidence_record_ids": ["R2"],
        "evidence_refs": [
            {
                "kind": "response",
                "evidence_id": selected_evidence["evidence_id"],
                "record_id": "R2",
                "source_line": selected_evidence["source_line"],
                "scope": bundle["scope"],
            }
        ],
        "review_refs": [
            {
                "indicator_id": "T01I1",
                "node_id": "N01",
                "version": saved_review.json()["version"],
            }
        ],
        "reviewer": "数学教师甲",
    }
    invalid_payloads = (
        {**valid, "reviewer": "  "},
        {**valid, "narrative": "  "},
        {**valid, "limitations": "  "},
        {**valid, "evidence_record_ids": []},
        {**valid, "evidence_record_ids": ["UNKNOWN"]},
        {**valid, "review_refs": []},
        {**valid, "need_type": ""},
        {**valid, "selection_reason": "  "},
        {
            **valid,
            "review_refs": [{"indicator_id": "T01I1", "node_id": "N01", "version": 99}],
        },
    )

    for payload in invalid_payloads:
        response = client.post("/api/teacher-case", json=payload)
        assert response.status_code in {400, 422}
    assert client.get("/api/teacher-cases").json() == {}
    confirmed = client.post("/api/teacher-case", json=valid)
    assert confirmed.status_code == 200, confirmed.text
    assert client.get("/api/teacher-cases").json()["D01"][-1]["status"] == "confirmed"


def test_verified_source_signoff_requires_complete_valid_mapping(tmp_path):
    client = client_for(tmp_path)
    valid = {
        "indicator_id": "T01I1",
        "status": "verified",
        "curriculum_locator": "课标第 62 页",
        "textbook_locator": "教材上册第 68 页",
        "material_ids": ["Q001"],
        "knowledge_links": [],
        "reviewer": "数学教师甲",
        "reason": "逐页核对课标、教材和题目",
    }
    invalid_payloads = (
        {**valid, "curriculum_locator": "  "},
        {**valid, "textbook_locator": "  "},
        {**valid, "reviewer": "  "},
        {**valid, "reason": "  "},
        {**valid, "material_ids": []},
        {**valid, "material_ids": ["Q999"]},
        {**valid, "material_ids": ["Q001", "Q001"]},
        {
            **valid,
            "knowledge_links": [
                {
                    "target_indicator_id": "T01I1",
                    "relation": "先修",
                    "evidence": "教材依据",
                }
            ],
        },
        {
            **valid,
            "knowledge_links": [
                {
                    "target_indicator_id": "T01I1",
                    "relation": "先修",
                    "evidence": "教材前置关系",
                }
            ],
        },
        {
            **valid,
            "knowledge_links": [
                {
                    "target_indicator_id": "T99",
                    "relation": "先修",
                    "evidence": "教材前置关系",
                }
            ],
        },
        {
            **valid,
            "knowledge_links": [
                {
                    "target_indicator_id": "T01I1",
                    "relation": "先修",
                    "evidence": "  ",
                }
            ],
        },
    )
    for payload in invalid_payloads:
        response = client.post("/api/source-verification", json=payload)
        assert response.status_code == 400
    assert client.get("/api/source-verifications").json() == {}
    signed = client.post("/api/source-verification", json=valid)
    assert signed.status_code == 200
    assert signed.json()["version"] == 1


def test_teaching_adjustment_links_origin_and_followup_runs_with_teacher_comparability(
    tmp_path,
):
    from app.api.app import create_app
    from app.services.analysis import TABLES, analyze
    from fastapi.testclient import TestClient
    from test_core import make_store, persist_run, sample_tables

    store = make_store(tmp_path)
    first_run = analyze(sample_tables(), {})
    persist_run(store, first_run)
    client = TestClient(create_app(store))
    first_draft = client.get(
        "/api/draft", params={"student": "D01", "indicator": "T01I1", "node": "N01"}
    ).json()
    review = client.post(
        "/api/review",
        json={
            "student_id": "D01",
            "indicator_id": "T01I1",
            "status": "edited",
            "diagnosis": "依据起始记录复核",
            "recommendation": "进行同类题教学",
            "reason": "核对原始过程",
            "evidence_record_ids": ["R2"],
            "original_draft": first_draft,
        },
    )
    assert review.status_code == 200
    created = client.post(
        "/api/teaching-adjustments",
        json={
            "student_id": "D01",
            "indicator_id": "T01I1",
            "origin_run_id": first_run["run_id"],
            "origin_node_id": "N01",
            "review_version": review.json()["version"],
            "planned_activity": "按步骤完成同类练习",
            "planned_practice": ["Q001 变式"],
            "observation_points": ["记录关键步骤"],
            "teacher": "教师甲",
            "planned_at": "2026-11-19",
        },
    )
    assert created.status_code == 200, created.text

    followup_tables = sample_tables()
    followup_tables["作答记录"][1]["得分"] = "2"
    followup_tables["模拟学生"].append({"学生编号": "D04", "模拟班级编号": "C3"})
    followup_tables["作答记录"].append(
        {
            "记录编号": "F-R5",
            "学生编号": "D04",
            "材料编号": "Q001",
            "主题编号": "T01",
            "节点编号": "N01",
            "作答事件编号": "F-E5",
            "修订版本": "1",
            "评分状态": "已评分",
            "得分": "2",
            "满分": "2",
            "_source_line": 7,
            "解答过程": "后续测量",
            "评分点得分": "P1=2",
        }
    )
    followup_tables["作答记录"] = [
        {
            **row,
            "记录编号": f"F-{row['记录编号']}",
            "作答事件编号": f"F-{row['作答事件编号']}",
        }
        for row in followup_tables["作答记录"]
    ]
    followup_folder = tmp_path / "followup-bundle"
    followup_folder.mkdir()
    for name, rows in followup_tables.items():
        headers = list(
            dict.fromkeys(
                TABLES[name]
                + [key for row in rows for key in row if not key.startswith("_")]
            )
        )
        with (followup_folder / f"{name}.csv").open(
            "w", encoding="utf-8-sig", newline=""
        ) as file:
            import csv

            writer = csv.DictWriter(file, fieldnames=headers, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(rows)
    followup_run = store.import_folder(followup_folder)
    completed = client.patch(
        f"/api/teaching-adjustments/{created.json()['adjustment_id']}",
        json={
            "implementation": "已完成课堂讲解和独立变式练习",
            "implementation_status": "completed",
            "outcome_observations": "学生能写出主要步骤，仍需核对符号处理",
            "followup_run_id": followup_run["run_id"],
            "followup_node_id": "N01",
            "followup_evidence_record_ids": ["F-R2"],
            "comparability": "not_comparable",
            "comparability_reason": "后测题目和测量范围不同，不比较分数变化",
            "teacher_conclusion": "仅记录过程观察；暂不判断干预效果",
            "reviewer": "教师甲",
            "concluded_at": "2026-11-19",
        },
    )
    assert completed.status_code == 200, completed.text
    assert completed.json()["origin_run_id"] == first_run["run_id"]
    assert completed.json()["followup_run_id"] == followup_run["run_id"]
    assert completed.json()["comparability"] == "not_comparable"
    assert len(client.get("/api/teaching-adjustments").json()) == 1
    revised = client.patch(
        f"/api/teaching-adjustments/{created.json()['adjustment_id']}",
        json={
            "implementation": "已完成课堂讲解和独立变式练习",
            "implementation_status": "completed",
            "outcome_observations": "补充记录：学生仍需核对符号处理",
            "followup_run_id": followup_run["run_id"],
            "followup_node_id": "N01",
            "followup_evidence_record_ids": ["F-R2"],
            "comparability": "not_comparable",
            "comparability_reason": "后测题目和测量范围不同，不比较分数变化",
            "teacher_conclusion": "补充课堂观察，不判断干预效果",
            "reviewer": "教师甲",
            "concluded_at": "2026-11-20",
        },
    )
    assert revised.status_code == 200
    assert len(revised.json()["history"]) == 2
    assert [item["comparability"] for item in revised.json()["history"]] == [
        "pending",
        "not_comparable",
    ]
    assert (
        revised.json()["history"][1]["teacher_conclusion"]
        == completed.json()["teacher_conclusion"]
    )
    export = client.get("/api/export", params={"cases": "D01,D02,D03"})
    assert export.status_code == 200
    with zipfile.ZipFile(io.BytesIO(export.content)) as archive:
        exported_adjustments = json.loads(archive.read("teaching_adjustments.json"))
    assert exported_adjustments[0]["adjustment_id"] == created.json()["adjustment_id"]
    assert exported_adjustments[0]["followup_run_id"] == followup_run["run_id"]
    client.close()


def test_teaching_adjustment_rejects_wrong_student_or_node_evidence(tmp_path):
    from app.api.app import create_app
    from app.services.analysis import analyze
    from fastapi.testclient import TestClient
    from test_core import make_store, persist_run, sample_tables

    store = make_store(tmp_path)
    run = analyze(sample_tables(), {})
    persist_run(store, run)
    client = TestClient(create_app(store))
    draft = client.get(
        "/api/draft", params={"student": "D01", "indicator": "T01I1", "node": "N01"}
    ).json()
    review = client.post(
        "/api/review",
        json={
            "student_id": "D01",
            "indicator_id": "T01I1",
            "status": "accepted",
            "diagnosis": "核验",
            "recommendation": "练习",
            "reason": "依据",
            "evidence_record_ids": ["R2"],
            "original_draft": draft,
        },
    )
    assert review.status_code == 200
    response = client.post(
        "/api/teaching-adjustments",
        json={
            "student_id": "D01",
            "indicator_id": "T01I1",
            "origin_run_id": run["run_id"],
            "origin_node_id": "N01",
            "review_version": 1,
            "planned_activity": "练习",
            "planned_practice": ["Q001"],
            "observation_points": ["步骤"],
            "teacher": "教师甲",
            "planned_at": "2026-11-19",
        },
    )
    assert response.status_code == 200
    wrong_origin = client.post(
        "/api/teaching-adjustments",
        json={
            "student_id": "D02",
            "indicator_id": "T01I1",
            "origin_run_id": run["run_id"],
            "origin_node_id": "N01",
            "review_version": 1,
            "planned_activity": "练习",
            "planned_practice": ["Q001"],
            "observation_points": ["步骤"],
            "teacher": "教师甲",
            "planned_at": "2026-11-19",
        },
    )
    assert wrong_origin.status_code == 400
    client.close()


def test_source_signoff_roundtrips_verified_rubric_issue_mappings(tmp_path):
    from test_core import sample_tables

    tables = sample_tables()
    tables["题目与材料"][0]["评分点"] = "Q001P1 正确识别同类项 2分"
    tables["题目与材料"].append(
        {
            "材料编号": "Q002",
            "主题编号": "T01",
            "指标编号": "T01I1",
            "满分": "1",
            "评分点": "Q002P1 解释步骤 1分",
        }
    )
    client = client_for(tmp_path, tables=tables)
    payload = {
        "indicator_id": "T01I1",
        "status": "verified",
        "curriculum_locator": "课标第62页",
        "textbook_locator": "教材第68页",
        "material_ids": ["Q001", "Q002"],
        "knowledge_links": [],
        "rubric_mappings": [
            {
                "issue_id": "combine_like_terms",
                "label": "同类项识别有误",
                "rubric_point_ids": ["Q001P1"],
                "material_ids": ["Q001"],
                "evidence": "两题评分点描述指向同一错误",
                "reviewer": "数学教师甲",
                "status": "verified",
            }
        ],
        "reviewer": "数学教师甲",
        "reason": "已核验题目评分点与共同问题对应关系",
    }

    invalid_payloads = (
        {
            **payload,
            "rubric_mappings": [
                {**payload["rubric_mappings"][0], "rubric_point_ids": ["Q999P1"]}
            ],
        },
        {
            **payload,
            "rubric_mappings": [
                {**payload["rubric_mappings"][0], "rubric_point_ids": ["Q002P1"]}
            ],
        },
        {
            **payload,
            "rubric_mappings": [
                payload["rubric_mappings"][0],
                {**payload["rubric_mappings"][0], "issue_id": "duplicate_issue"},
            ],
        },
        {
            **payload,
            "rubric_mappings": [
                payload["rubric_mappings"][0],
                {**payload["rubric_mappings"][0], "issue_id": "duplicate_point"},
            ],
        },
    )
    for invalid_payload in invalid_payloads:
        rejected = client.post("/api/source-verification", json=invalid_payload)
        assert rejected.status_code == 400
    assert client.get("/api/source-verifications").json() == {}

    saved = client.post("/api/source-verification", json=payload)

    assert saved.status_code == 200, saved.text
    assert saved.json()["rubric_mappings"] == payload["rubric_mappings"]
    history = client.get("/api/source-verifications").json()["T01I1"]
    assert history[0]["rubric_mappings"] == payload["rubric_mappings"]
    from app.services.task03.recommendation_service import _verified_indicator_check

    rule_input = _verified_indicator_check({"items": []}, "T01I1", {"T01I1": history})
    assert rule_input["rubric_mappings"] == payload["rubric_mappings"]
    client.close()


def test_resource_links_include_unscoped_textbook_and_card_with_server_metadata(
    tmp_path,
):
    from test_core import sample_tables

    tables = sample_tables()
    supporting_ids = [
        *(f"TB{index:02d}" for index in range(1, 9)),
        *(f"LC{index:02d}" for index in range(1, 4)),
    ]
    tables["题目与材料"].extend(
        {
            "材料编号": material_id,
            "指标编号": "",
            "材料类型": "教材" if material_id.startswith("TB") else "学习卡",
            "题干或内容": f"{material_id} 内容",
        }
        for material_id in supporting_ids
    )
    client = client_for(
        tmp_path,
        config=replace(settings, source_files_dir=tmp_path / "no-source-files"),
        tables=tables,
    )
    payload = {
        "indicator_id": "T01I1",
        "status": "verified",
        "curriculum_locator": "课标第 62 页",
        "textbook_locator": "教材第 68 页",
        "material_ids": ["Q001"],
        "knowledge_links": [],
        "rubric_mappings": [],
        "resource_links": [
            {
                "material_id": material_id,
                "purpose": purpose,
                "indicator_ids": ["T01I1"],
                "allowed_node_ids": ["N01"],
                "source_locator": locator,
                "evidence": evidence,
                "status": "verified",
                "resource_type": "caller-forged-type",
                "content_hash": "caller-forged-hash",
            }
            for material_id in supporting_ids
            for purpose, locator, evidence in (
                (
                    "再次讲解合并同类项"
                    if material_id.startswith("TB")
                    else "自主回忆",
                    f"材料 {material_id} 定位",
                    f"材料 {material_id} 与指标对应",
                ),
            )
        ],
        "reviewer": "数学教师甲",
        "reason": "已核对来源",
    }

    invalid_links = (
        {**payload["resource_links"][0], "material_id": "MISSING"},
        {**payload["resource_links"][0], "indicator_ids": ["T99I9"]},
        {**payload["resource_links"][0], "allowed_node_ids": ["N99"]},
    )
    for link in invalid_links:
        rejected = client.post(
            "/api/source-verification",
            json={**payload, "resource_links": [link]},
        )
        assert rejected.status_code == 400
    assert client.get("/api/source-verifications").json() == {}

    saved = client.post("/api/source-verification", json=payload)

    assert saved.status_code == 200, saved.text
    links = saved.json()["resource_links"]
    assert [link["resource_type"] for link in links] == [
        *(["教材"] * 8),
        *(["学习卡"] * 3),
    ]
    assert all(link["content_hash"] != "caller-forged-hash" for link in links)
    assert all(len(link["content_hash"]) == 64 for link in links)
    assert set(saved.json()["source_fingerprints"]) == {
        "material:Q001",
        *(f"material:{material_id}" for material_id in supporting_ids),
    }
    assert all(
        saved.json()["source_fingerprints"][f"material:{link['material_id']}"]
        == link["content_hash"]
        for link in links
    )
    assert (
        client.get("/api/source-verifications").json()["T01I1"][0]["resource_links"]
        == links
    )
    draft = client.get(
        "/api/draft", params={"student": "D02", "indicator": "T01I1", "node": "N01"}
    )
    assert draft.status_code == 200
    assert set(draft.json()["material_ids"]) >= set(supporting_ids), draft.json()
    selection = draft.json()["resource_selection"]
    assert selection["status"] == "ready", selection
    assert selection["learning_resources"]
    assert {item["material_id"] for item in selection["learning_resources"]} <= set(
        supporting_ids
    )
    assert all(
        "verified_indicator_match" in item["reason_codes"]
        for item in selection["learning_resources"]
    )
    client.close()


def test_verified_source_becomes_stale_when_allowlisted_pdf_changes(tmp_path):
    source_dir = tmp_path / "source_files"
    source_dir.mkdir()
    source_pdf = source_dir / "B05_相关资料切片.pdf"
    source_pdf.write_bytes(b"synthetic pdf first version")
    client = client_for(
        tmp_path,
        config=replace(settings, source_files_dir=source_dir),
    )
    payload = {
        "indicator_id": "T01I1",
        "status": "verified",
        "curriculum_locator": "课标第 62 页",
        "textbook_locator": "教材第 68 页",
        "material_ids": ["Q001"],
        "reviewer": "数学教师甲",
        "reason": "已核对原页",
    }

    saved = client.post("/api/source-verification", json=payload)
    assert saved.status_code == 200, saved.text
    assert any(name.startswith("file:") for name in saved.json()["source_fingerprints"])
    assert client.get("/api/source-verifications").json()["T01I1"][-1]["stale"] is False

    source_pdf.write_bytes(b"synthetic pdf changed content")
    latest = client.get("/api/source-verifications").json()["T01I1"][-1]
    assert latest["stale"] is True
    draft = client.get(
        "/api/draft", params={"student": "D02", "indicator": "T01I1", "node": "N01"}
    ).json()
    assert draft["material_ids"] == []
    export = client.get("/api/export", params={"cases": "D01,D02,D03"})
    with zipfile.ZipFile(io.BytesIO(export.content)) as archive:
        assert json.loads(archive.read("verified_source_relations.json")) == []
    renewed = client.post(
        "/api/source-verification",
        json={**payload, "expected_version": latest["version"]},
    )
    assert renewed.status_code == 200, renewed.text
    assert renewed.json()["version"] == latest["version"] + 1
    assert renewed.json()["stale"] is False
    client.close()


def _package_with_unselected_student():
    from app.services.analysis import analyze
    from app.services.exports import package
    from test_core import sample_tables

    tables = sample_tables()
    tables["模拟学生"].append({"学生编号": "D04", "模拟班级编号": "C1"})
    for row in list(tables["作答记录"]):
        outsider = dict(row)
        outsider["记录编号"] = f"D04-{row['记录编号']}"
        outsider["学生编号"] = "D04"
        outsider["作答事件编号"] = f"D04-{row['作答事件编号']}"
        outsider["_source_line"] += 10
        tables["作答记录"].append(outsider)
    run = analyze(tables, {})
    reviews = {
        "D01:T01I1": [
            {
                "student_id": "D01",
                "indicator_id": "T01I1",
                "node_id": "N01",
                "version": 1,
                "status": "accepted",
                "evidence_record_ids": ["R2"],
                "reason": "所选学生的复核",
            }
        ],
        "D02:T01I1": [
            {
                "student_id": "D02",
                "indicator_id": "T01I1",
                "node_id": "N01",
                "version": 1,
                "status": "pending",
                "evidence_record_ids": [],
                "reason": "仍待复核",
            }
        ],
        "D04:T01I1": [
            {
                "student_id": "D04",
                "indicator_id": "T01I1",
                "node_id": "N01",
                "version": 1,
                "status": "accepted",
                "evidence_record_ids": ["D04-R2"],
                "reason": "未选择学生的已接受建议",
            },
            {
                "student_id": "D04",
                "indicator_id": "T01I1",
                "version": 2,
                "status": "edited",
                "evidence_record_ids": ["D04-R2"],
                "reason": "未选择学生的其他节点待处理建议",
            },
        ],
    }
    cases = {
        "D01": [
            {
                "student_id": "D01",
                "status": "draft",
                "history": [{"evidence_record_ids": ["R2"]}],
            }
        ],
        "D04": [
            {
                "student_id": "D04",
                "status": "draft",
                "history": [{"evidence_record_ids": ["D04-R2"]}],
            }
        ],
    }
    adjustments = [
        {
            "student_id": "D01",
            "adjustment_id": "ADJ-D01",
            "origin_evidence_record_ids": ["R2"],
            "history": [{"followup_evidence_record_ids": ["R2"]}],
        },
        {
            "student_id": "D04",
            "adjustment_id": "ADJ-D04",
            "origin_evidence_record_ids": ["D04-R2"],
            "history": [{"followup_evidence_record_ids": ["D04-R2"]}],
        },
    ]
    return package(
        run,
        reviews,
        ["D01", "D02", "D03"],
        cases=cases,
        teaching_adjustments=adjustments,
    )


def test_export_filters_selected_students_recommendations_and_adjustments():
    with zipfile.ZipFile(io.BytesIO(_package_with_unselected_student())) as archive:
        manifest = json.loads(archive.read("manifest.json"))
        accepted = json.loads(archive.read("recommendations.json"))
        pending = json.loads(archive.read("pending_review.json"))
        student_cases = json.loads(archive.read("student_cases.json"))
        adjustments = json.loads(archive.read("teaching_adjustments.json"))
        cases = json.loads(archive.read("teacher_cases_history.json"))

    assert manifest["reviewed_recommendations"] == len(accepted) == 1
    assert manifest["pending_recommendations"] == len(pending) == 2
    assert {row["student_id"] for row in accepted + pending} <= {"D01", "D02", "D03"}
    assert {row["student_id"] for row in student_cases} == {"D01", "D02", "D03"}
    assert [row["adjustment_id"] for row in adjustments] == ["ADJ-D01"]
    assert set(cases) == {"D01", "D02", "D03"}


def test_export_student_references_are_closed_and_class_rows_are_aggregates():
    with zipfile.ZipFile(io.BytesIO(_package_with_unselected_student())) as archive:
        members = {name: archive.read(name) for name in archive.namelist()}
        raw_rows = json.loads(members["raw_responses.json"])
        observations = json.loads(members["observations.json"])
        class_metrics = json.loads(members["class_summary.json"])
        all_metrics = json.loads(members["all_metrics.json"])

    assert {row["学生编号"] for row in raw_rows} <= {"D01", "D02", "D03"}
    assert {row["student_id"] for row in observations} <= {"D01", "D02", "D03"}
    assert any(row["key"] == "C1" and row["count"] >= 2 for row in class_metrics)
    for metric in class_metrics + [
        row for row in all_metrics if row["kind"].startswith("class")
    ]:
        assert "record_ids" not in metric
        assert "event_ids" not in metric

    allowed_records = {row["记录编号"] for row in raw_rows}
    allowed_events = {row["作答事件编号"] for row in raw_rows}
    record_fields = {
        "record_id",
        "record_ids",
        "evidence_record_ids",
        "origin_evidence_record_ids",
        "followup_evidence_record_ids",
    }
    event_fields = {"event_id", "event_ids"}
    found_records: set[str] = set()
    found_events: set[str] = set()

    def visit(value):
        if isinstance(value, dict):
            for key, item in value.items():
                if key in record_fields:
                    found_records.update(item if isinstance(item, list) else [item])
                if key in event_fields:
                    found_events.update(item if isinstance(item, list) else [item])
                visit(item)
        elif isinstance(value, list):
            for item in value:
                visit(item)

    for name, payload in members.items():
        assert b"D04" not in payload, f"unselected student leaked in {name}"
        if name.endswith(".json"):
            visit(json.loads(payload))
    assert found_records <= allowed_records
    assert found_events <= allowed_events


def test_package_scope_validator_rejects_nested_outsider_refs_and_class_details():
    from app.services.shared.export_service import validate_package_scope

    selected = {"记录编号": "R1", "学生编号": "D01", "作答事件编号": "E1"}
    outsider = {"记录编号": "D04-R1", "学生编号": "D04", "作答事件编号": "D04-E1"}
    violations = validate_package_scope(
        {
            "raw_responses.json": [selected],
            "_scope_raw_responses": [selected, outsider],
            "teacher_review_history.json": {
                "D01:T01I1": [
                    {
                        "student_id": "D01",
                        "evidence_record_ids": ["D04-R1"],
                        "event_ids": ["D04-E1"],
                    }
                ]
            },
            "class_summary.json": [
                {
                    "kind": "class",
                    "key": "C1",
                    "record_ids": ["R1"],
                    "event_ids": ["E1"],
                }
            ],
        },
        {"D01"},
    )

    assert {item["code"] for item in violations} == {
        "unselected_record_reference",
        "unselected_event_reference",
        "class_metric_contains_individual_references",
    }
