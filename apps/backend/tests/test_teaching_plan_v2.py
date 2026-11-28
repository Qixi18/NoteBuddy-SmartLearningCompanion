from copy import deepcopy

import pytest
from app.services.task03.teaching_plan_service import (
    build_teaching_plan,
    student_safe_plan,
    validate_teaching_plan,
)


def _bundle():
    return {
        "scope": {
            "run_id": "run-1",
            "student_id": "D01",
            "indicator_id": "I1",
            "node_id": "N01",
        },
        "fingerprint": "evidence-fingerprint-v1",
        "source_versions": {"I1": 3},
        "source_context": {"status": "verified", "stale": False},
        "items": [{"material_id": "Q1"}, {"material_id": "Q2"}],
        "responses": [
            {
                "evidence_id": "ev-1",
                "record_id": "R1",
                "material_id": "Q1",
                "source_line": 8,
                "disposition": "scored",
            },
            {
                "evidence_id": "ev-2",
                "record_id": "R2",
                "material_id": "Q2",
                "source_line": 9,
                "disposition": "pending",
            },
        ],
    }


def _sources():
    return {
        "I1": [
            {
                "version": 3,
                "status": "verified",
                "stale": False,
                "material_ids": ["Q1", "Q2"],
                "resource_links": [
                    {
                        "material_id": "TB1",
                        "status": "verified",
                        "indicator_ids": ["I1"],
                        "allowed_node_ids": ["N01"],
                    }
                ],
            }
        ]
    }


def _selection():
    return {
        "status": "ready",
        "purpose": "remediation",
        "practice_items": [
            {
                "material_id": "Q2",
                "resource_type": "题目",
                "reason_codes": ["verified_indicator_match"],
                "reason": "节点内已核验练习题",
            }
        ],
        "learning_resources": [
            {
                "material_id": "TB1",
                "resource_type": "教材",
                "reason_codes": ["purpose_match"],
                "reason": "人工核验适用于当前目标",
            }
        ],
    }


def test_builds_versioned_plan_with_material_reasons_evidence_and_layered_hints():
    plan = build_teaching_plan(
        _bundle(),
        [{"kind": "rule_observation", "text": "步骤需要核对"}],
        _selection(),
        "目标指标",
        {"R1"},
    )

    assert plan["schema_version"] == 2
    assert plan["scope"]["node_id"] == "N01"
    assert plan["material_ids"] == ["Q2", "TB1"]
    assert {row["material_id"] for row in plan["resource_reasons"]} == {"Q2", "TB1"}
    assert [row["level"] for row in plan["hints"]] == [
        "direction",
        "structure",
        "local_check",
    ]
    assert [row["record_id"] for row in plan["evidence_refs"]] == ["R1"]
    assert plan["source_versions"] == {"I1": 3}
    assert plan["teacher_review_required"] is True
    assert validate_teaching_plan(plan, _bundle(), _sources()) == []


def test_student_projection_never_exposes_teacher_only_hint_notes():
    plan = build_teaching_plan(_bundle(), [], _selection(), "指标", {"R1"})

    student = student_safe_plan(plan)

    assert [set(hint) for hint in student["hints"]] == [
        {"level", "student_prompt"},
        {"level", "student_prompt"},
        {"level", "student_prompt"},
    ]
    assert all("teacher_note" not in hint for hint in student["hints"])


def test_local_templates_produce_distinct_goal_hints_and_adjustments_by_purpose():
    plans = {}
    for purpose in ("remediation", "transfer", "diagnostic"):
        selection = _selection()
        selection["purpose"] = purpose
        plans[purpose] = build_teaching_plan(_bundle(), [], selection, "指标", {"R1"})

    assert len({plan["goal"] for plan in plans.values()}) == 3
    assert len({plan["hints"][0]["student_prompt"] for plan in plans.values()}) == 3
    assert len({plan["adjustment_conditions"][0] for plan in plans.values()}) == 3
    assert all(
        plan["template_version"] == "teaching-plan-2026.11.2" for plan in plans.values()
    )


@pytest.mark.parametrize(
    ("change", "expected_code"),
    [
        (lambda plan: plan["scope"].update(node_id="N02"), "scope_changed"),
        (lambda plan: plan.update(evidence_fingerprint="old"), "evidence_changed"),
        (
            lambda plan: plan["evidence_refs"][0].update(record_id="R404"),
            "evidence_out_of_scope",
        ),
        (lambda plan: plan["source_versions"].update(I1=2), "source_version_changed"),
        (lambda plan: plan["material_ids"].__setitem__(1, "Q404"), "invalid_plan"),
        (
            lambda plan: (
                plan["material_ids"].__setitem__(1, "Q404"),
                plan["resource_reasons"][1].update(material_id="Q404"),
            ),
            "material_not_verified",
        ),
        (lambda plan: plan.update(goal="待填写"), "invalid_plan"),
        (
            lambda plan: plan["resource_reasons"][0].update(
                explanation="[填写选择理由]"
            ),
            "invalid_plan",
        ),
    ],
)
def test_rejects_stale_scope_evidence_signature_or_materials(change, expected_code):
    plan = build_teaching_plan(_bundle(), [], _selection(), "指标", {"R1"})
    tampered = deepcopy(plan)
    change(tampered)

    assert expected_code in {
        row["code"] for row in validate_teaching_plan(tampered, _bundle(), _sources())
    }


def test_cannot_build_a_plan_without_scored_evidence_or_node_practice():
    empty_evidence = _bundle()
    empty_evidence["responses"] = []
    with pytest.raises(ValueError, match="评分或覆盖证据"):
        build_teaching_plan(empty_evidence, [], _selection(), "指标", {"R1"})

    no_practice = _selection()
    no_practice["practice_items"] = []
    with pytest.raises(ValueError, match="节点内练习题"):
        build_teaching_plan(_bundle(), [], no_practice, "指标", {"R1"})


def test_diagnostic_plan_uses_coverage_evidence_when_student_has_no_records():
    empty = _bundle()
    empty["responses"] = []
    empty["coverage"] = {"evidence_id": "coverage-1", "record_count": 0}
    selection = _selection()
    selection["purpose"] = "diagnostic"

    plan = build_teaching_plan(empty, [], selection, "指标")

    assert plan["evidence_refs"] == [
        {
            "kind": "coverage",
            "evidence_id": "coverage-1",
            "record_id": "",
            "material_id": "",
            "source_line": 0,
        }
    ]
    assert validate_teaching_plan(plan, empty, _sources()) == []


def test_diagnostic_plan_uses_coverage_when_records_exist_but_none_are_scored():
    pending = _bundle()
    pending["responses"][0]["disposition"] = "pending"
    pending["coverage"] = {
        "evidence_id": "coverage-pending-only",
        "record_count": 1,
        "scored_record_count": 0,
        "record_disposition_counts": {"pending": 1},
    }
    selection = _selection()
    selection["purpose"] = "diagnostic"

    plan = build_teaching_plan(pending, [], selection)

    assert plan["evidence_refs"][0]["kind"] == "coverage"
    assert plan["evidence_refs"][0]["evidence_id"] == "coverage-pending-only"
    assert validate_teaching_plan(plan, pending, _sources()) == []


def _draft_context(**overrides):
    context = {
        "rule_id": "TR-05",
        "evidence_kind": "partial_score",
        "observed_fact": "Q2 的合并同类项步骤失分，代入求值步骤正确。",
        "inference_limit": "仅能说明该步骤需要回看，不能推断整章掌握情况。",
        "score_points_to_review": ["Q2P1 合并同类项", "Q2P3 结果核对"],
        "diagnosis": "部分得分集中在合并同类项步骤。",
    }
    context.update(overrides)
    return context


def test_plan_steps_hints_and_conditions_use_the_draft_diagnosis_context():
    plan = build_teaching_plan(
        _bundle(),
        [],
        _selection(),
        "目标指标",
        {"R1"},
        draft_context=_draft_context(),
    )

    assert len(plan["steps"]) == 4
    assert "Q2P1 合并同类项" in plan["steps"][0]
    assert "Q2P1 合并同类项" in "".join(plan["observation_points"])
    assert "Q2P1 合并同类项" in "".join(plan["adjustment_conditions"])
    assert "Q2P1 合并同类项" in plan["hints"][-1]["teacher_note"]
    assert "当前可核验事实" in plan["goal"]
    assert plan["purpose"] == "remediation"
    assert validate_teaching_plan(plan, _bundle(), _sources()) == []


def test_same_purpose_produces_different_plans_for_different_students():
    first = build_teaching_plan(
        _bundle(),
        [],
        _selection(),
        "目标指标",
        {"R1"},
        draft_context=_draft_context(),
    )
    second = build_teaching_plan(
        _bundle(),
        [],
        _selection(),
        "目标指标",
        {"R1"},
        draft_context=_draft_context(
            rule_id="TR-07",
            observed_fact="已能独立完成当前节点练习，但未见到迁移表现。",
            score_points_to_review=[],
            diagnosis="当前表现稳定，适合观察迁移。",
        ),
    )

    assert first["goal"] != second["goal"]
    assert first["steps"] != second["steps"]
    assert first["observation_points"] != second["observation_points"]


def test_transfer_steps_compare_task_conditions_instead_of_repeating_practice():
    selection = _selection()
    selection["purpose"] = "transfer"

    plan = build_teaching_plan(
        _bundle(),
        [],
        selection,
        "目标指标",
        {"R1"},
        draft_context=_draft_context(
            rule_id="TR-07",
            observed_fact="当前题目完成稳定，尚未观察到迁移。",
            score_points_to_review=[],
        ),
    )

    text = "".join(plan["steps"])
    assert "不是重复练习" in text
    assert "条件" in text
    assert len(plan["steps"]) == 4


def test_diagnostic_plan_steps_keep_observation_boundaries():
    empty = _bundle()
    empty["responses"] = []
    empty["coverage"] = {"evidence_id": "coverage-1", "record_count": 0}
    selection = _selection()
    selection["purpose"] = "diagnostic"

    plan = build_teaching_plan(
        empty,
        [],
        selection,
        "目标指标",
        draft_context=_draft_context(
            rule_id="TR-04",
            evidence_kind="no_scored_record",
            score_points_to_review=[],
        ),
    )

    text = "".join(plan["steps"])
    assert "补充观察" in text
    assert "不下掌握结论" in text
    assert len(plan["steps"]) == 3
    assert plan["evidence_refs"][0]["kind"] == "coverage"


@pytest.mark.parametrize(
    "tamper",
    [
        lambda plan: plan["hints"].reverse(),
        lambda plan: plan["hints"][0].update(student_prompt="   "),
        lambda plan: plan["hints"][1].pop("student_prompt"),
    ],
)
def test_rejects_incomplete_or_misordered_three_level_hints(tamper):
    plan = build_teaching_plan(_bundle(), [], _selection(), "目标指标", {"R1"})
    tamper(plan)

    codes = {
        row["code"] for row in validate_teaching_plan(plan, _bundle(), _sources())
    }
    assert codes == {"invalid_plan"}
