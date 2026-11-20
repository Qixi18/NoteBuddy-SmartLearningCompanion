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
        plan["template_version"] == "teaching-plan-2026.11.1" for plan in plans.values()
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
    with pytest.raises(ValueError, match="有效评分证据"):
        build_teaching_plan(empty_evidence, [], _selection(), "指标", {"R1"})

    no_practice = _selection()
    no_practice["practice_items"] = []
    with pytest.raises(ValueError, match="节点内练习题"):
        build_teaching_plan(_bundle(), [], no_practice, "指标", {"R1"})
