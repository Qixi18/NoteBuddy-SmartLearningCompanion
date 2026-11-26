"""班级级教学实施与复测记录：闭环约束、证据校验与历史保留。"""

from test_server import client_for
from test_core import sample_tables


def _run_id(client) -> str:
    return client.get("/api/run").json()["run_id"]


def _accepted_plan(client):
    run_id = _run_id(client)
    draft = client.post(
        "/api/class-teaching-plans/draft",
        json={"class_id": "C1", "node_id": "N01"},
    )
    assert draft.status_code == 200, draft.text
    review = client.post(
        f"/api/class-teaching-plans/{draft.json()['plan_id']}/review",
        json={"run_id": run_id, "status": "accepted", "reviewer": "王老师", "reason": "核对完成"},
    )
    assert review.status_code == 200, review.text
    return run_id, review.json()


def _create(client, run_id, plan_id):
    return client.post(
        "/api/class-teaching-adjustments",
        json={
            "run_id": run_id,
            "class_id": "C1",
            "node_id": "N01",
            "plan_id": plan_id,
            "planned_activity": "集中处理方程类共同问题",
            "planned_practice": ["Q001 同型题重练"],
            "observation_points": ["复测时比较方程指标得分率"],
            "teacher": "王老师",
        },
    )


def test_class_adjustment_requires_an_accepted_plan(tmp_path):
    client = client_for(tmp_path)
    run_id = _run_id(client)
    draft = client.post(
        "/api/class-teaching-plans/draft",
        json={"class_id": "C1", "node_id": "N01"},
    ).json()

    response = _create(client, run_id, draft["plan_id"])

    assert response.status_code == 400
    assert "采纳" in response.json()["error"]
    client.close()


def test_class_adjustment_create_and_update_keeps_history(tmp_path):
    tables = sample_tables()
    tables["测验节点"][0]["模拟测验日期"] = "2026-01-20"
    tables["测验节点"].append(
        {"节点编号": "N02", "可用题目编号": "Q001", "模拟测验日期": "2026-06-17"}
    )
    followup = dict(tables["作答记录"][1])
    followup.update(
        {
            "记录编号": "R5",
            "作答事件编号": "E5",
            "节点编号": "N02",
            "修订版本": "1",
            "得分": "2",
            "_source_line": 7,
        }
    )
    tables["作答记录"].append(followup)
    client = client_for(tmp_path, tables=tables)
    run_id, plan = _accepted_plan(client)

    created = _create(client, run_id, plan["plan_id"])
    assert created.status_code == 200, created.text
    record = created.json()
    assert record["implementation_status"] == "not_completed"
    assert record["plan_version"] == plan["version"]

    rejected_evidence = client.patch(
        f"/api/class-teaching-adjustments/{record['adjustment_id']}",
        json={
            "implementation": "已完成第一节",
            "implementation_status": "partial",
            "outcome_observations": "学生能说出移项依据",
            "followup_node_id": "N01",
            "followup_evidence_record_ids": ["NOT-A-RECORD"],
        },
    )
    assert rejected_evidence.status_code == 400

    updated = client.patch(
        f"/api/class-teaching-adjustments/{record['adjustment_id']}",
        json={
            "implementation": "已完成第一节",
            "implementation_status": "partial",
            "outcome_observations": "学生能说出移项依据",
            "followup_node_id": "N02",
            "followup_evidence_record_ids": ["R5"],
            "teacher_conclusion": "",
        },
    )
    assert updated.status_code == 200, updated.text
    saved = updated.json()
    assert saved["implementation_status"] == "partial"
    assert saved["followup_evidence_record_ids"] == ["R5"]
    assert saved["followup_comparison"][0]["status"] == "comparable"
    assert saved["followup_comparison"][0]["delta_ratio"] == 0.5
    assert saved["history"]
    assert saved["history"][-1]["followup_comparison"] == []

    listed = client.get(
        "/api/class-teaching-adjustments", params={"class": "C1", "node": "N01"}
    ).json()
    assert len(listed) == 1
    assert listed[0]["adjustment_id"] == record["adjustment_id"]
    client.close()


def test_class_adjustment_cannot_reuse_origin_node_as_retest(tmp_path):
    client = client_for(tmp_path)
    run_id, plan = _accepted_plan(client)
    record = _create(client, run_id, plan["plan_id"]).json()

    response = client.patch(
        f"/api/class-teaching-adjustments/{record['adjustment_id']}",
        json={
            "implementation": "已完成第一节",
            "implementation_status": "partial",
            "outcome_observations": "学生能说出移项依据",
            "followup_node_id": "N01",
            "followup_evidence_record_ids": ["R2"],
        },
    )

    assert response.status_code == 400
    assert "必须晚于实施节点" in response.json()["error"]
    client.close()


def test_class_adjustment_completion_requires_conclusion(tmp_path):
    tables = sample_tables()
    tables["测验节点"][0]["模拟测验日期"] = "2026-01-20"
    tables["测验节点"].append(
        {"节点编号": "N02", "可用题目编号": "Q001", "模拟测验日期": "2026-06-17"}
    )
    followup = dict(tables["作答记录"][1])
    followup.update(
        {
            "记录编号": "R5",
            "作答事件编号": "E5",
            "节点编号": "N02",
            "修订版本": "1",
            "_source_line": 7,
        }
    )
    tables["作答记录"].append(followup)
    client = client_for(tmp_path, tables=tables)
    run_id, plan = _accepted_plan(client)
    record = _create(client, run_id, plan["plan_id"]).json()

    response = client.patch(
        f"/api/class-teaching-adjustments/{record['adjustment_id']}",
        json={
            "implementation": "全部完成",
            "implementation_status": "completed",
            "outcome_observations": "复测表现提升",
            "followup_node_id": "N02",
            "followup_evidence_record_ids": ["R5"],
            "teacher_conclusion": "",
        },
    )

    assert response.status_code == 400
    assert "结论" in response.json()["error"]
    client.close()


def test_class_adjustment_rejects_unknown_plan_and_scope(tmp_path):
    client = client_for(tmp_path)
    run_id = _run_id(client)

    unknown_plan = _create(client, run_id, "missing-plan")
    assert unknown_plan.status_code == 400

    wrong_class = client.post(
        "/api/class-teaching-adjustments",
        json={
            "run_id": run_id,
            "class_id": "C9",
            "node_id": "N01",
            "plan_id": "x",
            "planned_activity": "活动",
        },
    )
    assert wrong_class.status_code == 400
    client.close()


def test_class_adjustment_rejects_cross_node_retest_when_dates_tie(tmp_path):
    tables = sample_tables()
    tables["测验节点"] = [
        {"节点编号": "N01", "可用题目编号": "Q001", "模拟测验日期": "2026-01-20"},
        {"节点编号": "N02", "可用题目编号": "Q001", "模拟测验日期": "2026-01-20"},
    ]
    followup = dict(tables["作答记录"][1])
    followup.update(
        {
            "记录编号": "R5",
            "作答事件编号": "E5",
            "节点编号": "N02",
            "修订版本": "1",
            "_source_line": 7,
        }
    )
    tables["作答记录"].append(followup)
    client = client_for(tmp_path, tables=tables)
    run_id, plan = _accepted_plan(client)
    record = _create(client, run_id, plan["plan_id"]).json()

    response = client.patch(
        f"/api/class-teaching-adjustments/{record['adjustment_id']}",
        json={
            "implementation": "已完成实施",
            "implementation_status": "partial",
            "followup_node_id": "N02",
            "followup_evidence_record_ids": ["R5"],
        },
    )

    assert response.status_code == 400
    assert "日期" in response.json()["error"]
    client.close()


def test_class_adjustment_persists_comparable_retest_metrics_for_common_materials(tmp_path):
    tables = sample_tables()
    tables["测验节点"] = [
        {"节点编号": "N01", "可用题目编号": "Q001", "模拟测验日期": "2026-01-20"},
        {"节点编号": "N02", "可用题目编号": "Q001", "模拟测验日期": "2026-06-17"},
    ]
    followup = dict(tables["作答记录"][1])
    followup.update(
        {
            "记录编号": "R5",
            "作答事件编号": "E5",
            "节点编号": "N02",
            "修订版本": "1",
            "得分": "2",
            "_source_line": 7,
        }
    )
    tables["作答记录"].append(followup)
    second_student_followup = dict(followup)
    second_student_followup.update(
        {
            "记录编号": "R6",
            "学生编号": "D02",
            "作答事件编号": "E6",
            "_source_line": 8,
        }
    )
    tables["作答记录"].append(second_student_followup)
    client = client_for(tmp_path, tables=tables)
    run_id, plan = _accepted_plan(client)
    record = _create(client, run_id, plan["plan_id"]).json()
    assert len(
        client.get(
            "/api/class-evidence", params={"class": "C1", "node": "N02"}
        ).json()["records"]
    ) == 2

    updated = client.patch(
        f"/api/class-teaching-adjustments/{record['adjustment_id']}",
        json={
            "implementation": "已完成分步示范和同型练习",
            "implementation_status": "completed",
            "followup_node_id": "N02",
            "followup_evidence_record_ids": ["R5"],
            "teacher_conclusion": "教师结合课堂观察记录后续安排",
        },
    )

    assert updated.status_code == 200, updated.text
    comparison = updated.json()["followup_comparison"][0]
    assert comparison["indicator_id"] == "T01I1"
    assert comparison["status"] == "comparable"
    assert comparison["common_material_ids"] == ["Q001"]
    assert comparison["baseline"]["ratio"] == 0.5
    assert comparison["followup"]["ratio"] == 1.0
    assert comparison["delta_ratio"] == 0.5
    assert comparison["baseline"]["record_count"] == 1
    assert comparison["followup"]["record_count"] == 2
    assert comparison["baseline"]["observed_student_count"] == 1
    assert comparison["followup"]["observed_student_count"] == 2
    assert comparison["followup"]["student_count"] == 2

    listed = client.get(
        "/api/class-teaching-adjustments", params={"class": "C1", "node": "N01"}
    ).json()
    assert listed[0]["followup_comparison"] == updated.json()["followup_comparison"]
    client.close()
