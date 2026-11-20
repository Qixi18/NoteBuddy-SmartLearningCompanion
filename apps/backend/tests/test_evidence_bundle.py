import pytest
from app.domain.assessment.evidence_bundle import AnalysisScope
from app.services.task02.evidence_bundle_service import build_evidence_bundle


def sample_run():
    return {
        "run_id": "run-a",
        "students": [{"学生编号": "S1"}, {"学生编号": "S2"}, {"学生编号": "S9"}],
        "objectives": [{"指标编号": "I1"}],
        "items": [
            {
                "材料编号": "Q1",
                "指标编号": "I1",
                "题干或内容": "合并同类项",
                "评分点": "Q1P1 识别同类项 2分",
            },
            {
                "材料编号": "Q2",
                "指标编号": "I1",
                "题干或内容": "代入求值",
                "评分点": "Q2P1 正确代入 1分",
            },
        ],
        "nodes": [
            {"节点编号": "N1", "可用题目编号": "Q1"},
            {"节点编号": "N2", "可用题目编号": "Q2"},
        ],
        "raw_responses": [
            {
                "记录编号": "R1",
                "学生编号": "S1",
                "指标编号": "I1",
                "节点编号": "N1",
                "材料编号": "Q1",
                "评分状态": "已评分",
                "得分": "1",
                "满分": "2",
                "学生最终作答": "5x",
                "解答过程": "2x 与 3x 为同类项，相加得到 5x",
                "_source_line": 2,
            },
            {
                "记录编号": "R2",
                "学生编号": "S1",
                "指标编号": "I1",
                "节点编号": "N2",
                "材料编号": "Q2",
                "评分状态": "未作答",
                "得分": "",
                "满分": "1",
                "原始作答": "",
                "_source_line": 3,
            },
            {
                "记录编号": "R3",
                "学生编号": "S2",
                "指标编号": "I1",
                "节点编号": "N1",
                "材料编号": "Q1",
                "评分状态": "已评分",
                "得分": "2",
                "满分": "2",
                "原始作答": "5x",
                "_source_line": 4,
            },
            {
                "记录编号": "R4",
                "学生编号": "S1",
                "指标编号": "I1",
                "节点编号": "N1",
                "材料编号": "Q1",
                "评分状态": "已评分",
                "得分": "2",
                "满分": "2",
                "原始作答": "旧版答案",
                "_source_line": 5,
            },
            {
                "记录编号": "R5",
                "学生编号": "S1",
                "指标编号": "I1",
                "节点编号": "N1",
                "材料编号": "Q1",
                "评分状态": "未作答",
                "得分": "",
                "满分": "2",
                "学生最终作答": "",
                "解答过程": "",
                "_source_line": 6,
            },
        ],
        "responses": [],
        "rubric_observations": [],
        "quality": {
            "record_dispositions": [
                {"record_id": "R1", "source_line": 2, "disposition": "scored"},
                {"record_id": "R2", "source_line": 3, "disposition": "unanswered"},
                {"record_id": "R3", "source_line": 4, "disposition": "scored"},
                {"record_id": "R4", "source_line": 5, "disposition": "excluded"},
                {"record_id": "R5", "source_line": 6, "disposition": "unanswered"},
            ]
        },
        "source_index": [],
    }


def test_bundle_isolates_scope_and_keeps_full_item_and_response_evidence():
    run = sample_run()
    scope = AnalysisScope(
        run_id="run-a", student_id="S1", indicator_id="I1", node_id="N1"
    )
    bundle = build_evidence_bundle(
        run, scope, {"I1": [{"version": 3, "status": "verified"}]}
    )

    assert [row["record_id"] for row in bundle["responses"]] == ["R1", "R4", "R5"]
    assert (
        next(row for row in bundle["responses"] if row["record_id"] == "R4")["score"]
        is None
    )
    unanswered = next(row for row in bundle["responses"] if row["record_id"] == "R5")
    assert unanswered["state"] == "未作答"
    assert unanswered["disposition"] == "unanswered"
    assert unanswered["score"] is None
    assert [row["material_id"] for row in bundle["items"]] == ["Q1"]
    assert bundle["items"][0]["prompt"] == "合并同类项"
    assert bundle["responses"][0]["solution_steps"] == "2x 与 3x 为同类项，相加得到 5x"
    assert bundle["rubric_definitions"] == [
        {"point_id": "Q1P1", "item_id": "Q1", "description": "识别同类项", "maximum": 2}
    ]
    assert bundle["source_versions"] == {"I1": 3}
    assert "R2" not in str(bundle) and "R3" not in str(bundle)


def test_no_record_has_stable_coverage_evidence_not_a_zero_score():
    run = sample_run()
    scope = AnalysisScope(
        run_id="run-a", student_id="S9", indicator_id="I1", node_id="N1"
    )
    first = build_evidence_bundle(run, scope, {})
    second = build_evidence_bundle(run, scope, {})

    assert first["responses"] == []
    assert first["coverage"]["record_count"] == 0
    assert first["coverage"]["unknown_reason"] == "no_response_records_in_scope"
    assert first["coverage"]["expected_material_ids"] == ["Q1"]
    assert first["coverage"]["evidence_id"] == second["coverage"]["evidence_id"]
    assert "score" not in first["coverage"]
    assert first["fingerprint"] == second["fingerprint"]
    assert first["source_context"] == {
        "status": "pending",
        "stale": False,
        "rubric_mappings": [],
    }


def test_stale_source_context_does_not_expose_verified_issue_mappings():
    run = sample_run()
    scope = AnalysisScope(
        run_id="run-a", student_id="S1", indicator_id="I1", node_id="N1"
    )
    bundle = build_evidence_bundle(
        run,
        scope,
        {
            "I1": [
                {
                    "version": 4,
                    "status": "verified",
                    "stale": True,
                    "rubric_mappings": [{"issue_id": "old-map", "status": "verified"}],
                }
            ]
        },
    )

    assert bundle["source_context"]["stale"] is True
    assert bundle["source_context"]["rubric_mappings"] == []


def test_bundle_fingerprint_changes_with_source_versions_and_content():
    run = sample_run()
    scope = AnalysisScope(
        run_id="run-a", student_id="S1", indicator_id="I1", node_id="N1"
    )
    first = build_evidence_bundle(
        run, scope, {"I1": [{"version": 1, "status": "verified"}]}
    )
    changed_source = build_evidence_bundle(
        run, scope, {"I1": [{"version": 2, "status": "verified"}]}
    )
    run["items"][0]["评分点"] = "Q1P1 识别同类项 1分 Q1P2 推理 1分"
    changed_item = build_evidence_bundle(
        run, scope, {"I1": [{"version": 1, "status": "verified"}]}
    )

    assert first["fingerprint"] != changed_source["fingerprint"]
    assert first["fingerprint"] != changed_item["fingerprint"]
    mismatched_run_scope = AnalysisScope(
        run_id="run-b", student_id="S1", indicator_id="I1", node_id="N1"
    )
    with pytest.raises(ValueError, match="当前运行"):
        build_evidence_bundle(run, mismatched_run_scope, {})


def test_evidence_bundle_endpoint_uses_the_active_run(tmp_path):
    from test_server import client_for

    client = client_for(tmp_path)
    response = client.get(
        "/api/evidence-bundle",
        params={"student": "D01", "indicator": "T01I1", "node": "N01"},
    )

    assert response.status_code == 200, response.text
    bundle = response.json()
    assert bundle["scope"] == {
        "run_id": bundle["scope"]["run_id"],
        "student_id": "D01",
        "indicator_id": "T01I1",
        "node_id": "N01",
    }
    assert bundle["fingerprint"]
    assert all(row["student_id"] == "D01" for row in bundle["responses"])
    assert all(row["node_id"] == "N01" for row in bundle["responses"])
    client.close()
