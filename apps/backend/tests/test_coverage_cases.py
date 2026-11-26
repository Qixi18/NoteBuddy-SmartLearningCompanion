import csv
import io
import json
import zipfile

from app.services.analysis import TABLES
from test_core import sample_tables
from test_server import client_for


def _coverage_ref(bundle):
    return {
        "kind": "coverage",
        "evidence_id": bundle["coverage"]["evidence_id"],
        "scope": bundle["scope"],
    }


def test_teacher_case_requires_traceable_refs_for_selected_response_ids(tmp_path):
    client = client_for(tmp_path)
    bundle = client.get(
        "/api/evidence-bundle",
        params={"student": "D01", "indicator": "T01I1", "node": "N01"},
    ).json()
    run = client.get("/api/run").json()
    current_record_ids = {
        row["记录编号"] for row in run["responses"] if row["学生编号"] == "D01"
    }
    record = next(
        row for row in bundle["responses"] if row["record_id"] in current_record_ids
    )

    response = client.post(
        "/api/teacher-case",
        json={
            "student_id": "D01",
            "status": "draft",
            "narrative": "当前范围案例草稿",
            "limitations": "仅说明当前指标和节点",
            "evidence_record_ids": [record["record_id"]],
            "evidence_refs": [],
            "review_refs": [],
            "reviewer": "",
        },
    )

    assert response.status_code == 400
    assert "证据引用" in response.json()["error"]


def test_student_followup_evidence_only_allows_effective_valid_scores():
    from app.application.use_cases.teaching_adjustments import TeachingAdjustments
    from app.services.analysis import analyze

    run = analyze(sample_tables(), {})

    assert TeachingAdjustments._evidence_ids(run, "D01", "T01I1", "N01") == {"R2"}


def test_student_adjustment_cannot_reuse_origin_assessment_as_followup(tmp_path):
    client = client_for(tmp_path)
    run = client.get("/api/run").json()
    draft = client.get(
        "/api/draft", params={"student": "D01", "indicator": "T01I1", "node": "N01"}
    ).json()
    review = client.post(
        "/api/review",
        json={
            "student_id": "D01",
            "indicator_id": "T01I1",
            "status": "accepted",
            "diagnosis": "基线诊断",
            "recommendation": "围绕证据安排练习",
            "reason": "教师核对当前作答证据",
            "evidence_record_ids": ["R2"],
            "original_draft": draft,
        },
    )
    assert review.status_code == 200, review.text
    adjustment = client.post(
        "/api/teaching-adjustments",
        json={
            "student_id": "D01",
            "indicator_id": "T01I1",
            "origin_run_id": run["run_id"],
            "origin_node_id": "N01",
            "review_version": review.json()["version"],
            "planned_activity": "依据基线证据安排分步练习",
            "planned_practice": ["Q001"],
            "observation_points": ["记录学生独立步骤"],
            "teacher": "教师甲",
            "planned_at": "2026-11-26",
        },
    )
    assert adjustment.status_code == 200, adjustment.text

    response = client.patch(
        f"/api/teaching-adjustments/{adjustment.json()['adjustment_id']}",
        json={
            "implementation": "已完成课堂练习",
            "implementation_status": "completed",
            "outcome_observations": "观察到学生能完成练习",
            "followup_run_id": run["run_id"],
            "followup_node_id": "N01",
            "followup_evidence_record_ids": ["R2"],
            "comparability": "comparable",
            "comparability_reason": "试图复用起始节点证据",
            "teacher_conclusion": "不能将基线作答当作干预后结果",
            "reviewer": "教师甲",
            "concluded_at": "2026-11-26",
        },
    )

    assert response.status_code == 400
    assert "必须晚于起始测验" in response.json()["error"]
    client.close()


def _csv_files(tables):
    files = {}
    for name, rows in tables.items():
        stream = io.StringIO(newline="")
        headers = list(
            dict.fromkeys(
                TABLES[name]
                + [key for row in rows for key in row if not key.startswith("_")]
            )
        )
        writer = csv.DictWriter(stream, fieldnames=headers, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
        files[f"{name}.csv"] = stream.getvalue()
    return files


def test_no_record_coverage_to_diagnostic_plan_case_export_and_followup(tmp_path):
    tables = sample_tables()
    tables["测验节点"][0]["模拟测验日期"] = "2026-01-20"
    tables["作答记录"] = [row for row in tables["作答记录"] if row["学生编号"] != "D01"]
    client = client_for(tmp_path, tables=tables)
    run = client.get("/api/run").json()
    assert run["nodes"][0]["模拟测验日期"] == "2026-01-20"
    bundle = client.get(
        "/api/evidence-bundle",
        params={"student": "D01", "indicator": "T01I1", "node": "N01"},
    ).json()
    assert bundle["coverage"]["record_count"] == 0
    assert bundle["coverage"]["unknown_reason"] == "no_response_records_in_scope"
    ref = _coverage_ref(bundle)
    draft = client.get(
        "/api/draft", params={"student": "D01", "indicator": "T01I1", "node": "N01"}
    ).json()

    diagnostic_plan = {
        "material_ids": [],
        "activity": "安排一题短诊断并观察独立列式过程",
        "steps": ["教师说明任务", "学生独立作答", "教师记录过程"],
        "practice": ["教师自备诊断题"],
        "observation_points": ["记录独立步骤，不按缺席或零分解释"],
    }
    invalid_refs = [
        {**ref, "evidence_id": "coverage:stale-run-hash"},
        {**ref, "scope": {**ref["scope"], "student_id": "D02"}},
    ]
    for invalid_ref in invalid_refs:
        rejected = client.post(
            "/api/review",
            json={
                "student_id": "D01",
                "indicator_id": "T01I1",
                "status": "edited",
                "diagnosis": "记录不足，原因未知",
                "recommendation": "安排短诊断",
                "reason": "教师已核对当前节点覆盖状态",
                "evidence_record_ids": [],
                "evidence_refs": [invalid_ref],
                "original_draft": draft,
                "structured_plan": diagnostic_plan,
                "reviewer": "教师甲",
            },
        )
        assert rejected.status_code == 400

    review = client.post(
        "/api/review",
        json={
            "student_id": "D01",
            "indicator_id": "T01I1",
            "status": "edited",
            "diagnosis": "当前节点没有作答记录，原因未知",
            "recommendation": "安排短诊断并记录独立作答过程",
            "adjustment_condition": "取得可核验作答后重新分析",
            "reason": "教师已核对任务安排，不能把无记录解释为零分",
            "evidence_record_ids": [],
            "evidence_refs": [ref],
            "original_draft": draft,
            "structured_plan": diagnostic_plan,
            "reviewer": "教师甲",
        },
    )
    assert review.status_code == 200, review.text
    assert review.json()["evidence_refs"] == [ref]
    assert review.json()["structured_plan"] == diagnostic_plan

    case_base = {
        "student_id": "D01",
        "status": "confirmed",
        "need_type": "无记录观察",
        "selection_reason": "当前节点缺少有效评分记录，选择该案例验证补充观察流程。",
        "narrative": "当前节点没有学生作答记录，教师安排诊断活动补充观察。",
        "limitations": "缺记录原因未知；不推断为未作答、零分或能力不足。",
        "evidence_record_ids": [],
        "evidence_refs": [ref],
        "review_refs": [{"indicator_id": "T01I1", "node_id": "N01", "version": 1}],
        "reviewer": "教师甲",
    }
    for invalid_case in (
        {**case_base, "evidence_refs": [{**ref, "evidence_id": "coverage:old"}]},
        {**case_base, "evidence_refs": [ref], "evidence_record_ids": ["FORGED-0"]},
    ):
        assert client.post("/api/teacher-case", json=invalid_case).status_code == 400
    confirmed = client.post("/api/teacher-case", json=case_base)
    assert confirmed.status_code == 200, confirmed.text

    adjustment = client.post(
        "/api/teaching-adjustments",
        json={
            "student_id": "D01",
            "indicator_id": "T01I1",
            "origin_run_id": run["run_id"],
            "origin_node_id": "N01",
            "review_version": review.json()["version"],
            "origin_evidence_refs": [ref],
            "planned_activity": diagnostic_plan["activity"],
            "planned_practice": diagnostic_plan["practice"],
            "observation_points": diagnostic_plan["observation_points"],
            "teacher": "教师甲",
            "planned_at": "2026-11-20",
        },
    )
    assert adjustment.status_code == 200, adjustment.text
    assert adjustment.json()["origin_evidence_refs"] == [ref]

    exported = client.get("/api/export", params={"cases": "D01,D02,D03"})
    assert exported.status_code == 200
    with zipfile.ZipFile(io.BytesIO(exported.content)) as archive:
        cases = json.loads(archive.read("confirmed_cases.json"))
    assert [item["student_id"] for item in cases] == ["D01"]
    assert cases[0]["evidence_refs"] == [ref]

    followup_tables = sample_tables()
    followup_tables["测验节点"][0]["模拟测验日期"] = "2026-06-17"
    followup_tables["作答记录"] = [
        {
            **row,
            "记录编号": f"F-{row['记录编号']}",
            "作答事件编号": f"F-{row['作答事件编号']}",
        }
        for row in followup_tables["作答记录"]
        if row["学生编号"] == "D01"
    ]
    followup = client.post(
        "/api/import-files", json={"files": _csv_files(followup_tables)}
    )
    assert followup.status_code == 200, followup.text
    assert client.get("/api/run").json()["nodes"][0]["模拟测验日期"] == "2026-06-17"
    followup_bundle = client.get(
        "/api/evidence-bundle",
        params={"student": "D01", "indicator": "T01I1", "node": "N01"},
    ).json()
    response = next(
        item for item in followup_bundle["responses"] if item["record_id"] == "F-R2"
    )
    followup_ref = {
        "kind": "response",
        "evidence_id": response["evidence_id"],
        "record_id": response["record_id"],
        "source_line": response["source_line"],
        "scope": followup_bundle["scope"],
    }
    completed = client.patch(
        f"/api/teaching-adjustments/{adjustment.json()['adjustment_id']}",
        json={
            "implementation": "已执行诊断活动",
            "implementation_status": "completed",
            "outcome_observations": "学生完成了可追溯作答，待教师复核步骤",
            "followup_run_id": followup.json()["run_id"],
            "followup_node_id": "N01",
            "followup_evidence_record_ids": ["F-R2"],
            "followup_evidence_refs": [followup_ref],
            "comparability": "undetermined",
            "comparability_reason": "这是诊断观察，不与无记录状态作分数比较",
            "teacher_conclusion": "不自动判断干预效果，后续由教师复核作答步骤",
            "reviewer": "教师甲",
            "concluded_at": "2026-11-20",
        },
    )
    assert completed.status_code == 200, completed.text
    assert completed.json()["origin_evidence_refs"] == [ref]
    assert completed.json()["followup_evidence_record_ids"] == ["F-R2"]
    assert completed.json()["followup_evidence_refs"] == [followup_ref]
    for invalid_record_id in ("F-R3", "F-R4"):
        invalid_response = next(
            item
            for item in followup_bundle["responses"]
            if item["record_id"] == invalid_record_id
        )
        invalid_ref = {
            "kind": "response",
            "evidence_id": invalid_response["evidence_id"],
            "record_id": invalid_response["record_id"],
            "source_line": invalid_response["source_line"],
            "scope": followup_bundle["scope"],
        }
        rejected = client.patch(
            f"/api/teaching-adjustments/{adjustment.json()['adjustment_id']}",
            json={
                "implementation": "已执行诊断活动",
                "implementation_status": "completed",
                "outcome_observations": "仅用于验证无效证据不会写入结论",
                "followup_run_id": followup.json()["run_id"],
                "followup_node_id": "N01",
                "followup_evidence_record_ids": [invalid_record_id],
                "followup_evidence_refs": [invalid_ref],
                "comparability": "undetermined",
                "comparability_reason": "未使用无效记录作比较",
                "teacher_conclusion": "无效后续记录不能支撑结论",
                "reviewer": "教师甲",
                "concluded_at": "2026-11-20",
            },
        )
        assert rejected.status_code == 400
        assert "有效" in rejected.json()["error"]
    client.close()
