"""Focused policy tests for deterministic TASK03 rules TR-01 through TR-08."""

import pytest

from app.services.task03.recommendation_service import _rubric, draft
from app.application.use_cases.workbench import _purpose_for_rule


def _response(
    record_id, item_id, score, maximum, *, status="已评分", points="", node="N02"
):
    return {
        "记录编号": record_id,
        "学生编号": "D01",
        "材料编号": item_id,
        "主题编号": "T03",
        "节点编号": node,
        "作答事件编号": f"E-{record_id}",
        "修订版本": "1",
        "评分状态": status,
        "得分": str(score),
        "满分": str(maximum),
        "评分点得分": points,
        "解答过程": "过程文本",
    }


def _run(
    responses=(),
    *,
    node="N02",
    topic="T03",
    taught="T03",
    note="该节点已教学该主题。",
    available=None,
    indicator_check=None,
    findings=(),
):
    responses = list(responses)
    item_ids = sorted({row["材料编号"] for row in responses})
    if available is None:
        available = item_ids
    items = []
    for item_id in sorted(set(item_ids) | set(available)):
        if item_id in {"Q001", "Q002", "Q003"}:
            points = f"{item_id}P1 正确步骤 1分\n{item_id}P2 正确结果 1分"
        else:
            points = ""
        items.append(
            {
                "材料编号": item_id,
                "主题编号": topic,
                "指标编号": "T03I1",
                "材料类型": "题目",
                "满分": "2",
                "评分点": points,
            }
        )
    eligible = [row for row in responses if row["评分状态"] == "已评分"]
    score = sum(float(row["得分"]) for row in eligible)
    maximum = sum(float(row["满分"]) for row in eligible)
    metrics = (
        [
            {
                "kind": "student_node_indicator",
                "key": f"D01:{node}:T03I1",
                "score": score,
                "maximum": maximum,
                "ratio": score / maximum if maximum else None,
                "count": len(eligible),
                "record_ids": [row["记录编号"] for row in eligible],
            }
        ]
        if eligible
        else []
    )
    state = (
        "scored"
        if eligible
        else "pending"
        if any(row["评分状态"] == "待评分" for row in responses)
        else "unanswered"
        if any(row["评分状态"] == "未作答" for row in responses)
        else "no_record"
        if available
        else "not_measured"
    )
    source_entry = {
        "indicator_id": "T03I1",
        "topic_id": topic,
        "verification": "verified" if indicator_check else "pending",
        "indicator_check": indicator_check or {},
    }
    return {
        "run_id": "RUN-1",
        "objectives": [
            {
                "主题编号": topic,
                "指标编号": "T03I1",
                "主题": "不等式与不等式组" if topic == "T03" else "方程主题",
                "观察指标": "理解不等式",
            }
        ],
        "students": [{"学生编号": "D01"}],
        "nodes": [
            {
                "节点编号": node,
                "已教及测量主题": taught,
                "说明": note,
                "可用题目编号": "、".join(available),
            }
        ],
        "items": items,
        "responses": responses,
        "raw_responses": responses,
        "metrics": metrics,
        "observations": [
            {
                "student_id": "D01",
                "indicator_id": "T03I1",
                "node_id": node,
                "state": state,
                "available_item_count": len(available),
            }
        ],
        "quality": {"findings": list(findings)},
        "source_index": [source_entry],
    }


def _verified_check(**extra):
    return {
        "status": "verified",
        "topic_id": "T03",
        "textbook_locator": "教材第 10 页",
        "reviewer": "数学教师",
        "checked_at": "2026-11-16",
        **extra,
    }


def _assert_legacy_contract(result):
    for field in (
        "student_id",
        "indicator_id",
        "objective",
        "diagnosis",
        "recommendation",
        "adjustment_condition",
        "material_ids",
        "score_points_to_review",
        "observation_point",
        "evidence_record_ids",
        "observed_record_ids",
        "source",
        "status",
    ):
        assert field in result
    assert result["status"] == "needs_review"


def test_tr01_explicitly_unteached_topic_gates_diagnosis_but_taught_topic_does_not():
    outside = _run(
        node="N01",
        taught="T01、T02",
        note="方程组和不等式尚未教学。",
        available=[],
    )
    result = draft(outside, "D01", "T03I1", "N01")
    assert result["rule_id"] == "TR-01"
    assert result["unknown_reason"] == "out_of_scope"
    assert result["material_ids"] == []
    assert "薄弱" not in result["diagnosis"]

    in_scope = _run(node="N02", taught="T01、T02、T03", available=[])
    assert draft(in_scope, "D01", "T03I1", "N02")["rule_id"] != "TR-01"


def test_tr02_no_measured_evidence_is_unknown_and_does_not_override_out_of_scope():
    result = draft(_run(available=[], taught="T01、T02、T03"), "D01", "T03I1", "N02")
    assert result["rule_id"] == "TR-02"
    assert result["unknown_reason"] == "no_valid_scored_evidence"
    assert result["evidence_record_ids"] == []
    assert "零分" not in result["diagnosis"]

    out_of_scope = _run(
        node="N01", taught="T01、T02", note="不等式尚未教学。", available=[]
    )
    assert draft(out_of_scope, "D01", "T03I1", "N01")["rule_id"] == "TR-01"


def test_tr03_pending_is_not_scored_and_is_disclosed_alongside_valid_evidence():
    pending = _response("R-P", "Q001", "", "2", status="待评分")
    result = draft(_run([pending]), "D01", "T03I1", "N02")
    assert result["rule_id"] == "TR-03"
    assert result["evidence_record_ids"] == ["R-P"]
    assert "待评分" in result["diagnosis"]
    assert "薄弱" not in result["diagnosis"]

    scored = _response("R-S", "Q002", 1, 2, points="Q002P1=1；Q002P2=0")
    mixed = draft(_run([pending, scored]), "D01", "T03I1", "N02")
    assert mixed["rule_id"] == "TR-05"
    assert "R-P" in mixed["evidence_record_ids"]
    assert "待评分" in mixed["observed_fact"]


def test_tr04_distinguishes_unanswered_from_no_record():
    unanswered = _response("R-U", "Q001", "", "2", status="未作答")
    result = draft(_run([unanswered]), "D01", "T03I1", "N02")
    assert result["rule_id"] == "TR-04"
    assert result["unknown_reason"] == "unanswered"
    assert "零分" not in result["diagnosis"]

    no_record = draft(_run([], available=["Q001"]), "D01", "T03I1", "N02")
    assert no_record["rule_id"] == "TR-04"
    assert no_record["unknown_reason"] == "no_record"


def test_tr05_reports_only_partial_item_facts_and_tr08_stops_on_rubric_conflict():
    partial = _response("R-1", "Q001", 1, 2, points="Q001P1=1；Q001P2=0")
    result = draft(_run([partial]), "D01", "T03I1", "N02")
    assert result["rule_id"] == "TR-05"
    assert "Q001 1/2" in result["observed_fact"]
    assert result["material_ids"] == []
    assert "概念错误" not in result["diagnosis"]

    inconsistent = _response("R-2", "Q001", 2, 2, points="Q001P1=1；Q001P2=0")
    conflict = draft(_run([inconsistent]), "D01", "T03I1", "N02")
    assert conflict["rule_id"] == "TR-08"
    assert conflict["unknown_reason"] == "rubric_conflict"
    assert conflict["material_ids"] == []


def test_tr06_requires_shared_verified_rubric_issue_mapping_or_downgrades_to_tr05():
    first = _response("R-1", "Q001", 1, 2, points="Q001P1=0；Q001P2=1")
    second = _response("R-2", "Q002", 1, 2, points="Q002P1=0；Q002P2=1")
    mapping = {
        "issue_id": "ISSUE-SIGN",
        "rubric_point_ids": ["Q001P1", "Q002P1"],
        "status": "verified",
    }
    verified = draft(
        _run(
            [first, second], indicator_check=_verified_check(rubric_mappings=[mapping])
        ),
        "D01",
        "T03I1",
        "N02",
    )
    assert verified["rule_id"] == "TR-06"
    assert "ISSUE-SIGN" in verified["observed_fact"]
    assert "能力缺陷" not in verified["diagnosis"]

    pending_mapping = draft(_run([first, second]), "D01", "T03I1", "N02")
    assert pending_mapping["rule_id"] == "TR-05"
    assert pending_mapping["unknown_reason"] == "rubric_mapping_unverified"
    assert pending_mapping["material_ids"] == []

    implicit_mapping = {key: value for key, value in mapping.items() if key != "status"}
    unverified = draft(
        _run(
            [first, second],
            indicator_check=_verified_check(rubric_mappings=[implicit_mapping]),
        ),
        "D01",
        "T03I1",
        "N02",
    )
    assert unverified["rule_id"] == "TR-05"
    assert unverified["unknown_reason"] == "rubric_mapping_unverified"


def test_tr07_needs_two_distinct_full_score_items_and_verified_mapping():
    first = _response("R-1", "Q001", 2, 2, points="Q001P1=1；Q001P2=1")
    second = _response("R-2", "Q002", 2, 2, points="Q002P1=1；Q002P2=1")
    result = draft(
        _run([first, second], indicator_check=_verified_check(material_ids=["Q001"])),
        "D01",
        "T03I1",
        "N02",
    )
    assert result["rule_id"] == "TR-07"
    assert result["material_ids"] == ["Q001"]
    assert "已掌握" not in result["diagnosis"]
    assert "Q001" in result["observed_fact"] and "Q002" in result["observed_fact"]

    unverified = draft(_run([first, second]), "D01", "T03I1", "N02")
    assert unverified["rule_id"] == "TR-08"
    assert unverified["unknown_reason"] == "indicator_mapping_unverified"
    assert unverified["material_ids"] == []
    single = draft(
        _run([first], indicator_check=_verified_check()), "D01", "T03I1", "N02"
    )
    assert single["rule_id"] == "TR-08"
    assert single["unknown_reason"] == "insufficient_distinct_items"


def test_latest_human_source_signoff_controls_rule_resources_over_snapshot():
    first = _response("R-1", "Q001", 2, 2, points="Q001P1=1；Q001P2=1")
    second = _response("R-2", "Q002", 2, 2, points="Q002P1=1；Q002P2=1")
    run = _run([first, second])
    run["source_index"][0]["verification"] = "verified"
    run["source_index"][0]["indicator_check"] = _verified_check(material_ids=["Q001"])

    revoked = draft(
        run,
        "D01",
        "T03I1",
        "N02",
        source_verifications={
            "T03I1": [
                {"version": 1, "status": "verified", "material_ids": ["Q001"]},
                {"version": 2, "status": "rejected", "material_ids": ["Q001"]},
            ]
        },
    )
    assert revoked["material_ids"] == []
    assert revoked["rule_id"] == "TR-08"

    class UnexpectedModelCall:
        def complete(self, _body):
            raise AssertionError("撤销最新签核后不能调用模型草稿")

    from app.services.task03.recommendation_service import deepseek_draft

    model_result = deepseek_draft(
        run,
        "D01",
        "T03I1",
        client=UnexpectedModelCall(),
        node_id="N02",
        source_verifications={
            "T03I1": [
                {"version": 1, "status": "verified", "material_ids": ["Q001"]},
                {"version": 2, "status": "rejected", "material_ids": ["Q001"]},
            ]
        },
    )
    assert model_result["rule_id"] == "TR-08"
    assert model_result["material_ids"] == []

    verified = draft(
        run,
        "D01",
        "T03I1",
        "N02",
        source_verifications={
            "T03I1": [{"version": 1, "status": "verified", "material_ids": ["Q001"]}]
        },
    )
    assert verified["material_ids"] == ["Q001"]
    assert verified["rule_id"] == "TR-07"


def test_tr08_conflicting_evidence_fails_closed_and_all_rules_keep_legacy_fields():
    row = _response("R-X", "Q001", 1, 2, points="Q001P1=1；Q001P2=0")
    result = draft(
        _run(
            [row],
            findings=[
                {
                    "record_id": "R-X",
                    "code": "invalid_score",
                    "severity": "ERROR",
                    "disposition": "excluded",
                }
            ],
        ),
        "D01",
        "T03I1",
        "N02",
    )
    assert result["rule_id"] == "TR-08"
    assert result["unknown_reason"] == "evidence_conflict"
    assert result["material_ids"] == []
    _assert_legacy_contract(result)

    for rule_result in (
        draft(
            _run(node="N01", taught="T01", note="不等式尚未教学。", available=[]),
            "D01",
            "T03I1",
            "N01",
        ),
        draft(_run(available=[], taught="T03"), "D01", "T03I1", "N02"),
        draft(
            _run([_response("R-P", "Q001", "", "2", status="待评分")]),
            "D01",
            "T03I1",
            "N02",
        ),
        draft(
            _run([_response("R-U", "Q001", "", "2", status="未作答")]),
            "D01",
            "T03I1",
            "N02",
        ),
        draft(
            _run([_response("R-S", "Q001", 1, 2, points="Q001P1=1；Q001P2=0")]),
            "D01",
            "T03I1",
            "N02",
        ),
    ):
        _assert_legacy_contract(rule_result)


def test_rubric_point_id_is_not_used_as_its_maximum():
    item = {
        "材料编号": "Q015",
        "满分": "3",
        "评分点": (
            "Q015P1 正确去两个括号 1分\n"
            "Q015P2 分别合并a项和b项 1分\n"
            "Q015P3 写出正确结果 1分"
        ),
    }
    row = {
        "评分点得分": "Q015P1=1；Q015P2=1；Q015P3=0",
        "得分": "2",
        "满分": "3",
    }

    scores, maxima, coherent = _rubric(row, item)

    assert coherent is True
    assert scores == {"Q015P1": 1.0, "Q015P2": 1.0, "Q015P3": 0.0}
    assert maxima == {"Q015P1": 1.0, "Q015P2": 1.0, "Q015P3": 1.0}


def test_missing_rubric_definition_keeps_point_evidence_unknown_not_conflicting():
    row = {
        "评分点得分": "P1=1",
        "得分": "1",
        "满分": "2",
    }

    scores, maxima, coherent = _rubric(row, {"材料编号": "Q001", "评分点": ""})

    assert coherent is True
    assert scores == {}
    assert maxima == {}




@pytest.mark.parametrize(("rule_id", "expected"), [
    ("TR-01", "blocked"), ("TR-02", "diagnostic"),
    ("TR-03", "requires_scoring"), ("TR-04", "diagnostic"),
    ("TR-05", "remediation"), ("TR-06", "remediation"),
    ("TR-07", "transfer"), ("TR-08", "blocked"),
])
def test_each_rule_has_an_explicit_teaching_purpose_or_blocker(rule_id, expected):
    assert _purpose_for_rule(rule_id) == expected
