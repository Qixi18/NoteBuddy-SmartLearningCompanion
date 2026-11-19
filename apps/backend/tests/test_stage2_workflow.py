import io
import json
import zipfile

from test_server import client_for


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
    valid = {
        "student_id": "D01",
        "status": "confirmed",
        "narrative": "按步骤核查该节点作答",
        "limitations": "仅代表该节点证据",
        "evidence_record_ids": ["R2"],
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
        {
            **valid,
            "review_refs": [{"indicator_id": "T01I1", "node_id": "N01", "version": 99}],
        },
    )

    for payload in invalid_payloads:
        response = client.post("/api/teacher-case", json=payload)
        assert response.status_code == 400
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
