from app.services.task02.case_service import suggest_cases


def _response(record_id, student_id, item_id, node_id, score, maximum, process=""):
    return {
        "记录编号": record_id,
        "学生编号": student_id,
        "材料编号": item_id,
        "节点编号": node_id,
        "得分": str(score),
        "满分": str(maximum),
        "解答过程": process,
    }


def _run():
    responses = [
        # D01 has an older-node partial score; it must not be used as current evidence.
        _response("OLD-D01", "D01", "Q001", "N01", 1, 2, "旧节点过程"),
        _response("R-D02-P", "D02", "Q001", "N02", 1, 2, "当前部分得分过程"),
        _response("R-D03-A", "D03", "Q001", "N02", 2, 2, "当前过程"),
        _response("R-D03-B", "D03", "Q002", "N02", 2, 2, "当前过程"),
    ]
    eligible_ids = [row["记录编号"] for row in responses]
    return {
        "students": [
            {"学生编号": "D01", "模拟班级编号": "C1"},
            {"学生编号": "D02", "模拟班级编号": "C2"},
            {"学生编号": "D03", "模拟班级编号": "C1"},
            {"学生编号": "D04", "模拟班级编号": "C3"},
        ],
        "nodes": [
            {"节点编号": "N01", "模拟测验日期": "2026-01-20", "可用题目编号": "Q001"},
            {
                "节点编号": "N02",
                "模拟测验日期": "2026-06-17",
                "可用题目编号": "Q001、Q002、Q003",
            },
        ],
        "metrics": [
            {"kind": "student", "key": sid, "record_ids": eligible_ids}
            for sid in ("D01", "D02", "D03")
        ],
        "responses": responses,
    }


def test_cases_use_latest_node_and_explain_evidence_and_roster_coverage():
    cases = suggest_cases(_run())
    by_type = {case["type"]: case for case in cases}

    assert len(cases) == 3
    assert len({case["student_id"] for case in cases}) == 3
    assert by_type["部分得分"]["student_id"] == "D02"
    assert by_type["部分得分"]["class_id"] == "C2"
    assert by_type["部分得分"]["evidence_record_ids"] == ["R-D02-P"]
    assert by_type["表现较好"]["student_id"] == "D03"
    assert by_type["表现较好"]["class_id"] == "C1"
    assert set(by_type["表现较好"]["evidence_record_ids"]) == {"R-D03-A", "R-D03-B"}
    assert by_type["记录较少"]["student_id"] == "D04"
    assert by_type["记录较少"]["class_id"] == "C3"
    assert by_type["记录较少"]["evidence_record_ids"] == []
    for case in cases:
        assert "节点 N02" in case["reason"]
        assert "样本覆盖" in case["reason"]
        assert "3/3 个班级" in case["reason"]
        assert "不代表全班" in case["reason"]
    assert "0 条有效已评分事件" in by_type["记录较少"]["reason"]
    assert "0/3 道可用题" in by_type["记录较少"]["reason"]


def test_insufficient_scores_and_single_class_are_stated_without_invented_evidence():
    run = _run()
    run["students"] = [
        {"学生编号": "D01", "模拟班级编号": "C1"},
        {"学生编号": "D02", "模拟班级编号": "C1"},
        {"学生编号": "D03", "模拟班级编号": "C1"},
    ]
    run["metrics"] = [{"kind": "student", "key": "D01", "record_ids": ["R-D03-A"]}]
    run["responses"] = [_response("R-D03-A", "D01", "Q001", "N02", 1, 2)]

    cases = suggest_cases(run)
    assert len({case["student_id"] for case in cases}) == 3
    assert all("1/1 个班级" in case["reason"] for case in cases)
    assert all("未覆盖班级" not in case["reason"] for case in cases)
    partial = next(case for case in cases if case["type"] == "部分得分")
    assert partial["evidence_record_ids"] == ["R-D03-A"]
    assert "没有可核实的带过程部分得分证据" in partial["reason"]
    best = next(case for case in cases if case["type"] == "表现较好")
    assert best["evidence_record_ids"] == []
    assert "无法比较表现" in best["reason"]
