from app.services.task02.class_insight_service import build_class_insights
from test_server import client_for


def _response(record, student, item, line, score, point_earned):
    return {
        "记录编号": record,
        "学生编号": student,
        "材料编号": item,
        "节点编号": "N01",
        "评分状态": "已评分",
        "得分": str(score),
        "满分": "2",
        "_source_line": line,
    }


def _run():
    responses = [
        _response("R1", "D1", "Q1", 2, 0, 0),
        _response("R2", "D1", "Q2", 3, 0, 0),
        _response("R3", "D1", "Q3", 4, 0, 0),
        _response("R4", "D2", "Q1", 5, 2, 1),
        _response("R5", "D3", "Q2", 6, 1, 1),
        _response("R6", "D4", "Q3", 7, 2, 1),
    ]
    return {
        "run_id": "run-1",
        "students": [
            {"学生编号": "D1", "模拟班级编号": "C1"},
            {"学生编号": "D2", "模拟班级编号": "C1"},
            {"学生编号": "D3", "模拟班级编号": "C2"},
            {"学生编号": "D4", "模拟班级编号": "C2"},
        ],
        "nodes": [{"节点编号": "N01", "可用题目编号": "Q1,Q2,Q3"}],
        "items": [
            {"材料编号": item, "指标编号": "I1", "满分": "2"}
            for item in ("Q1", "Q2", "Q3")
        ],
        "responses": responses,
        "rubric_observations": [
            {
                "record_id": row["记录编号"],
                "student_id": row["学生编号"],
                "item_id": row["材料编号"],
                "node_id": "N01",
                "state": "valid",
                "points": [
                    {
                        "point_id": f"{row['材料编号']}P1",
                        "earned": 0 if row["记录编号"] in {"R1", "R2", "R3"} else 1,
                        "maximum": 1,
                    }
                ],
            }
            for row in responses
        ],
        "quality": {
            "record_dispositions": [
                {
                    "record_id": row["记录编号"],
                    "source_line": row["_source_line"],
                    "disposition": "scored",
                }
                for row in responses
            ]
        },
    }


def _verified_sources():
    return {
        "I1": [
            {
                "status": "verified",
                "stale": False,
                "rubric_mappings": [
                    {
                        "issue_id": "common-step",
                        "label": "步骤依据缺失",
                        "rubric_point_ids": ["Q1P1", "Q2P1", "Q3P1"],
                        "material_ids": ["Q1", "Q2", "Q3"],
                        "status": "verified",
                    }
                ],
            }
        ]
    }


def test_issue_counts_deduplicate_students_and_report_observation_denominator():
    result = build_class_insights(_run(), "N01", _verified_sources())

    issue = result["issues"][0]
    by_class = {row["class_id"]: row for row in issue["by_class"]}
    assert by_class["C1"]["affected_count"] == 1
    assert by_class["C1"]["affected_student_ids"] == ["D1"]
    assert by_class["C1"]["observed_student_count"] == 2
    assert by_class["C2"]["affected_count"] == 0
    assert by_class["C2"]["observed_student_count"] == 2


def test_class_insights_expose_current_ai_mapping_coverage_per_indicator():
    mappings = {
        "I1": {
            "status": "needs_resolution",
            "usable_count": 1,
            "needs_resolution_count": 1,
            "mappings": [
                {"material_id": "Q1", "status": "usable", "evidence": [{"page": 3}]},
                {"material_id": "Q2", "status": "needs_resolution", "evidence": []},
            ],
        }
    }

    result = build_class_insights(_run(), "N01", _verified_sources(), mappings)

    assert result["source_mappings"]["I1"] == mappings["I1"]


def test_class_comparison_recomputes_only_on_common_observed_items():
    run = _run()
    run["responses"] = [
        _response("R1", "D1", "Q1", 2, 1, 1),
        _response("R2", "D1", "Q2", 3, 2, 1),
        _response("R3", "D3", "Q2", 4, 1, 1),
        _response("R4", "D3", "Q3", 5, 2, 1),
    ]
    run["quality"]["record_dispositions"] = [
        {
            "record_id": row["记录编号"],
            "source_line": row["_source_line"],
            "disposition": "scored",
        }
        for row in run["responses"]
    ]
    run["rubric_observations"] = []

    result = build_class_insights(run, "N01", {})

    comparison_entry = result["comparisons"][0]
    assert comparison_entry["status"] == "available"
    assert comparison_entry["common_material_ids"] == ["Q2"]
    comparison = {row["class_id"]: row for row in comparison_entry["classes"]}
    assert comparison["C1"]["common_score"] == 2
    assert comparison["C1"]["common_maximum"] == 2
    assert comparison["C2"]["common_score"] == 1
    assert comparison["C2"]["common_maximum"] == 2
    assert "不输出班级能力排名" in result["limitations"][0]


def test_no_common_questions_is_explicitly_unavailable():
    run = _run()
    run["responses"] = [
        _response("R1", "D1", "Q1", 2, 1, 1),
        _response("R2", "D3", "Q3", 3, 2, 1),
    ]
    run["quality"]["record_dispositions"] = [
        {
            "record_id": row["记录编号"],
            "source_line": row["_source_line"],
            "disposition": "scored",
        }
        for row in run["responses"]
    ]
    run["rubric_observations"] = []

    result = build_class_insights(run, "N01", {})

    comparison = result["comparisons"][0]
    assert comparison["status"] == "unavailable_no_common_questions"
    assert comparison["common_material_ids"] == []


def test_single_material_loss_does_not_count_as_a_repeated_mapped_issue():
    run = _run()
    run["responses"] = [run["responses"][0]]
    run["quality"]["record_dispositions"] = [run["quality"]["record_dispositions"][0]]
    run["rubric_observations"] = [run["rubric_observations"][0]]

    result = build_class_insights(run, "N01", _verified_sources())

    assert result["issues"] == []


def test_stale_verified_mapping_is_not_used_for_class_issue_counts():
    sources = _verified_sources()
    sources["I1"][-1]["stale"] = True

    result = build_class_insights(_run(), "N01", sources)

    assert result["issues"] == []


def test_class_insights_endpoint_returns_scoped_comparison(tmp_path):
    client = client_for(tmp_path)

    response = client.get("/api/class-insights", params={"node": "N01"})

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["run_id"]
    assert payload["node_id"] == "N01"
    assert all("student_count" in item for item in payload["classes"])
    assert "不输出班级能力排名或显著性结论。" in payload["limitations"]
    assert (
        client.get("/api/class-insights", params={"node": "UNKNOWN"}).status_code == 400
    )
    client.close()
