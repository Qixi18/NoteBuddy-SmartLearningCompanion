import pytest

from app.services.task02.analysis_service import analyze


def _row(
    record,
    event,
    item,
    node,
    status="已评分",
    score="1",
    maximum="2",
    version="1",
    line=2,
):
    return {
        "记录编号": record,
        "学生编号": "D01",
        "材料编号": item,
        "节点编号": node,
        "主题编号": "T01",
        "作答事件编号": event,
        "修订版本": version,
        "评分状态": status,
        "得分": score,
        "满分": maximum,
        "评分点得分": "",
        "学生最终作答": "",
        "解答过程": "",
        "_source_line": line,
    }


def _tables():
    return {
        "课程要求": [{"主题编号": "T01", "指标编号": "I1", "观察指标": "代数"}],
        "题目与材料": [
            {"材料编号": "Q001", "主题编号": "T01", "指标编号": "I1", "满分": "2"},
            {"材料编号": "Q002", "主题编号": "T01", "指标编号": "I1", "满分": "2"},
        ],
        "模拟学生": [{"学生编号": "D01", "模拟班级编号": "C1"}],
        "测验节点": [
            {"节点编号": "N01", "可用题目编号": "Q001"},
            {"节点编号": "N02", "可用题目编号": "Q002"},
            {"节点编号": "N03", "可用题目编号": "Q003"},
        ],
        "字段说明": [],
        "作答记录": [
            _row("R1", "E1", "Q001", "N01", score="0", version="1", line=2),
            _row("R2", "E1", "Q001", "N01", score="1", version="2", line=3),
            _row("R3", "E2", "Q001", "N01", "待评分", score="", line=4),
            _row("R4", "E3", "Q001", "N01", score="3", line=5),
            _row("R5", "E4", "Q002", "N02", score="1.0", line=6),
        ],
    }


def test_quality_records_disposition_and_audit_metadata():
    run = analyze(_tables(), {})
    quality = run["quality"]
    assert quality["disposition_counts"] == {
        "superseded": 1,
        "scored": 1,
        "pending": 1,
        "excluded": 2,
    }
    assert quality["raw_status_counts"] == {"已评分": 4, "待评分": 1}
    assert quality["event_disposition_counts"] == {
        "scored": 1,
        "pending": 1,
        "excluded": 2,
    }
    assert all(
        row["source_file"] == "作答记录.csv" for row in quality["record_dispositions"]
    )
    findings = {finding["record_id"]: finding for finding in quality["findings"]}
    assert findings["R3"]["severity"] == "INFO"
    assert findings["R3"]["disposition"] == "pending"
    assert findings["R4"]["severity"] == "ERROR"
    assert findings["R4"]["source_line"] == 5
    assert findings["R5"]["code"] == "invalid_score"


def test_node_metrics_preserve_legacy_aggregate_and_separate_denominators():
    run = analyze(_tables(), {})
    legacy = next(
        m
        for m in run["metrics"]
        if m["kind"] == "student_indicator" and m["key"] == "D01:I1"
    )
    assert (legacy["score"], legacy["maximum"], legacy["record_ids"]) == (1, 2, ["R2"])
    n01 = next(
        m
        for m in run["metrics"]
        if m.get("student_id") == "D01" and m.get("node_id") == "N01"
    )
    assert (n01["score"], n01["maximum"], n01["record_ids"]) == (1, 2, ["R2"])
    assert any(
        m.get("class_id") == "C1" and m.get("node_id") == "N01" for m in run["metrics"]
    )
    observations = [
        row
        for row in run["observations"]
        if row["student_id"] == "D01" and row["indicator_id"] == "I1" and row["node_id"]
    ]
    states = {row["node_id"]: row["state"] for row in observations}
    assert states == {"N01": "scored", "N02": "excluded", "N03": "not_measured"}
    assert (
        next(row for row in observations if row["node_id"] == "N01")["scored_count"]
        == 1
    )


def test_class_weighted_ratio_is_recomputed_from_score_and_maximum_totals():
    tables = _tables()
    tables["模拟学生"].append({"学生编号": "D02", "模拟班级编号": "C1"})
    tables["作答记录"] = [
        _row("R-small", "E-small", "Q001", "N01", score="1", maximum="2"),
        _row("R-large", "E-large", "Q001", "N01", score="8", maximum="10"),
    ]
    tables["题目与材料"][0]["满分"] = "2"
    # Use a second item whose declared maximum agrees with its response.
    tables["题目与材料"].append(
        {"材料编号": "Q010", "主题编号": "T01", "指标编号": "I1", "满分": "10"}
    )
    tables["测验节点"][0]["可用题目编号"] = "Q001 Q010"
    tables["作答记录"][1]["材料编号"] = "Q010"
    tables["作答记录"][1]["学生编号"] = "D02"

    run = analyze(tables, {})
    class_metric = next(
        metric
        for metric in run["metrics"]
        if metric["kind"] == "class_indicator" and metric["key"] == "C1:I1@N01"
    )
    independent_score = sum(int(row["得分"]) for row in tables["作答记录"])
    independent_maximum = sum(int(row["满分"]) for row in tables["作答记录"])
    independent_weighted_ratio = independent_score / independent_maximum
    unweighted_student_average = ((1 / 2) + (8 / 10)) / 2

    assert class_metric["score"] == independent_score == 9
    assert class_metric["maximum"] == independent_maximum == 12
    assert class_metric["ratio"] == independent_weighted_ratio == 0.75
    assert class_metric["ratio"] != unweighted_student_average


def test_student_and_class_node_metrics_use_disjoint_node_records():
    tables = _tables()
    tables["模拟学生"].append({"学生编号": "D02", "模拟班级编号": "C1"})
    tables["测验节点"].append({"节点编号": "N04", "可用题目编号": "Q001"})
    tables["作答记录"] = [
        _row("R-n01", "E-n01", "Q001", "N01", score="1", maximum="2"),
        _row("R-n04", "E-n04", "Q001", "N04", score="2", maximum="2"),
    ]
    tables["作答记录"][1]["学生编号"] = "D02"

    run = analyze(tables, {})
    metrics = {
        metric["key"]: metric
        for metric in run["metrics"]
        if metric["kind"] in {"student_indicator", "class_indicator"}
        and metric.get("node_id")
    }
    assert metrics["D01:I1@N01"]["record_ids"] == ["R-n01"]
    assert metrics["D01:I1@N01"]["score"] == 1
    assert metrics["C1:I1@N01"]["record_ids"] == ["R-n01"]
    assert metrics["C1:I1@N04"]["record_ids"] == ["R-n04"]
    assert metrics["C1:I1@N04"]["score"] == 2
    assert "R-n04" not in metrics["D01:I1@N01"]["record_ids"]


def test_node_with_available_question_but_no_student_record_is_unknown_no_record():
    tables = _tables()
    tables["测验节点"].append({"节点编号": "N04", "可用题目编号": "Q001"})
    run = analyze(tables, {})
    observation = next(
        row
        for row in run["observations"]
        if row["student_id"] == "D01"
        and row["indicator_id"] == "I1"
        and row["node_id"] == "N04"
    )
    assert observation["state"] == "no_record"
    assert observation["unknown_reason"] == "no_record"
    assert observation["available_item_count"] == 1


@pytest.mark.parametrize(
    ("row", "expected_state", "expected_score", "expected_ratio"),
    [
        (_row("R-zero", "E-zero", "Q001", "N01", score="0"), "scored", 0.0, 0.0),
        (
            _row("R-pending", "E-pending", "Q001", "N01", "待评分", score=""),
            "pending",
            None,
            None,
        ),
        (
            _row("R-unanswered", "E-unanswered", "Q001", "N01", "未作答", score=""),
            "unanswered",
            None,
            None,
        ),
        (
            _row("R-zero-max", "E-zero-max", "Q001", "N01", score="0", maximum="0"),
            "excluded",
            None,
            None,
        ),
    ],
)
def test_node_observation_distinguishes_zero_from_empty_or_invalid_denominators(
    row, expected_state, expected_score, expected_ratio
):
    tables = _tables()
    tables["作答记录"] = [row]
    if row["记录编号"] == "R-zero-max":
        tables["题目与材料"][0]["满分"] = "0"
    run = analyze(tables, {})
    observation = next(
        item
        for item in run["observations"]
        if item["student_id"] == "D01"
        and item["indicator_id"] == "I1"
        and item["node_id"] == "N01"
    )

    assert observation["state"] == expected_state
    metric = next(
        (
            item
            for item in run["metrics"]
            if item.get("student_id") == "D01" and item.get("node_id") == "N01"
        ),
        None,
    )
    if expected_score is None:
        assert metric is None
        assert observation["scored_count"] == 0
    else:
        assert metric["score"] == expected_score
        assert metric["ratio"] == expected_ratio
        assert observation["scored_count"] == 1


def test_quarantined_revision_events_are_excluded_not_absent():
    for versions in (("1", "bad"), ("1", "1")):
        tables = _tables()
        tables["作答记录"] = [
            _row("R1", "E-quarantine", "Q001", "N01", version=versions[0], line=2),
            _row("R2", "E-quarantine", "Q001", "N01", version=versions[1], line=3),
        ]
        run = analyze(tables, {})
        observation = next(
            row
            for row in run["observations"]
            if row["student_id"] == "D01"
            and row["indicator_id"] == "I1"
            and row["node_id"] == "N01"
        )
        assert observation["state"] == "excluded"
        assert observation["unknown_reason"] == "excluded"
        assert observation["quarantined_count"] == 2
        assert observation["quarantined_record_ids"] == ["R1", "R2"]
        assert run["quality"]["disposition_counts"]["excluded"] == 2
        assert run["quality"]["disposition_counts"].get("superseded", 0) == 0


@pytest.mark.parametrize("bad_version", ["0", "-1", "bad", "1.5", ""])
def test_unorderable_revisions_quarantine_each_raw_row_once(bad_version):
    tables = _tables()
    tables["作答记录"] = [
        _row("R1", "E-version", "Q001", "N01", version="1", line=2),
        _row("R2", "E-version", "Q001", "N01", version=bad_version, line=3),
    ]
    run = analyze(tables, {})
    dispositions = run["quality"]["record_dispositions"]
    ids = [row["record_id"] for row in dispositions]

    assert sorted(ids) == ["R1", "R2"]
    assert len(ids) == len(set(ids))
    assert sum(run["quality"]["disposition_counts"].values()) == 2
    assert run["quality"]["disposition_counts"] == {"excluded": 2}
    assert run["quality"]["eligible_scored"] == 0
    assert not any(row["作答事件编号"] == "E-version" for row in run["responses"])


def test_invalid_highest_revision_never_falls_back_to_valid_lower_revision():
    tables = _tables()
    tables["作答记录"] = [
        _row("R1", "E-invalid-high", "Q001", "N01", score="1", version="1", line=2),
        _row("R2", "E-invalid-high", "Q001", "N01", score="bad", version="2", line=3),
    ]
    run = analyze(tables, {})
    dispositions = {
        row["record_id"]: row["disposition"]
        for row in run["quality"]["record_dispositions"]
    }

    assert dispositions == {"R1": "superseded", "R2": "excluded"}
    assert run["quality"]["eligible_scored"] == 0
    assert [row["记录编号"] for row in run["responses"]] == ["R2"]
    assert all(
        "R1" not in metric["record_ids"] and "R2" not in metric["record_ids"]
        for metric in run["metrics"]
    )
    assert any(
        finding["record_id"] == "R2" and finding["code"] == "invalid_score"
        for finding in run["quality"]["findings"]
    )


def _rubric_run(point_scores, total_score="1", rubric=None):
    tables = _tables()
    tables["题目与材料"][0]["评分点"] = (
        rubric or "Q001P1 答案正确 1分\nQ001P2 过程正确 1分"
    )
    row = _row("R-rubric", "E-rubric", "Q001", "N01", score=total_score, line=20)
    row["评分点得分"] = point_scores
    tables["作答记录"] = [row]
    return analyze(tables, {})


def test_rubric_observation_validates_point_ids_and_keeps_total_metrics():
    run = _rubric_run("Q001P1=1；Q001P2=0")
    observation = run["rubric_observations"][0]
    assert observation["state"] == "valid"
    assert observation["points"] == [
        {"point_id": "Q001P1", "earned": 1, "maximum": 1},
        {"point_id": "Q001P2", "earned": 0, "maximum": 1},
    ]
    assert observation["total_score"] == 1
    assert run["quality"]["eligible_scored"] == 1
    assert not run["quality"]["finding_counts"].get("rubric_conflict")


def test_rubric_conflicts_warn_and_do_not_remove_valid_total_score():
    cases = (
        ("Q001P1=1；Q001P1=0；Q001P2=0", "1", "duplicate_rubric_score_id"),
        ("Q999P1=1；Q001P2=0", "1", "unknown_rubric_score_id"),
        ("Q001P1=2；Q001P2=0", "2", "rubric_score_out_of_range"),
        ("Q001P1=1；Q001P2=0", "2", "rubric_total_mismatch"),
    )
    for score_text, total_score, conflict_code in cases:
        run = _rubric_run(score_text, total_score)
        observation = run["rubric_observations"][0]
        assert observation["state"] == "conflict"
        assert conflict_code in observation["conflicts"]
        finding = next(
            f for f in run["quality"]["findings"] if f["code"] == "rubric_conflict"
        )
        assert finding["severity"] == "WARN"
        assert finding["disposition"] == "scored"
        assert observation["points"] == []
        assert run["quality"]["eligible_scored"] == 1
        metric = next(m for m in run["metrics"] if m["kind"] == "student")
        assert metric["score"] == float(total_score)
        assert metric["maximum"] == 2


def test_missing_rubric_data_is_unknown_instead_of_zero():
    run = _rubric_run("")
    observation = run["rubric_observations"][0]
    assert observation["state"] == "unknown"
    assert observation["points"] == []
    assert "未知" in observation["reason"]
