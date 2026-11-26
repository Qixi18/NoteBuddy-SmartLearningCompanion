"""班级教学方案：领域不变量、规则生成、版本与过期判断。"""

import pytest
from app.domain.common.exceptions import InvalidReview
from app.domain.teaching.class_plan import (
    ClassPlanBody,
    ClassPlanScope,
    ClassTeachingPlan,
)
from app.repositories.store import Store
from app.services.task03.class_teaching_plan_service import (
    build_rule_plan,
    class_indicator_rows,
    current_class_plan_fingerprint,
)


def _run():
    return {
        "run_id": "run-class-plan",
        "input_fingerprint": "fingerprint-1",
        "objectives": [{"指标编号": "I1", "观察指标": "代数式"}],
        "students": [
            {"学生编号": "D1", "模拟班级编号": "C1"},
            {"学生编号": "D2", "模拟班级编号": "C1"},
            {"学生编号": "D3", "模拟班级编号": "C2"},
        ],
    }


def _report():
    return {
        "run_id": "run-class-plan",
        "node_id": "N01",
        "classes": [
            {"class_id": "C1", "student_count": 2, "scored_record_count": 2},
            {"class_id": "C2", "student_count": 1, "scored_record_count": 0},
        ],
        "comparisons": [
            {
                "indicator_id": "I1",
                "status": "available",
                "common_material_ids": ["Q001"],
                "classes": [
                    {
                        "class_id": "C1",
                        "scored_record_count": 2,
                        "observed_student_count": 1,
                        "ratio": 0.25,
                        "common_ratio": 0.25,
                    },
                    {
                        "class_id": "C2",
                        "scored_record_count": 0,
                        "observed_student_count": 0,
                        "ratio": None,
                        "common_ratio": None,
                    },
                ],
            }
        ],
        "issues": [],
        "limitations": [],
    }


def _sources():
    return {"I1": [{"status": "verified", "stale": False, "version": 2}]}


def test_rule_plan_only_uses_classes_with_scored_records():
    rows = class_indicator_rows(_run(), _report(), "C1")
    assert [row["indicator_id"] for row in rows] == ["I1"]
    assert rows[0]["ratio"] == 0.25
    assert rows[0]["student_count"] == 2

    assert class_indicator_rows(_run(), _report(), "C2") == []


def test_rule_plan_is_evidence_bound_and_source_fingerprinted():
    plan = build_rule_plan(_run(), "C1", "N01", _report(), _sources())

    assert plan["generation_source"] == "rule"
    assert plan["status"] == "draft"
    assert len(plan["source_fingerprint"]) == 64
    assert plan["evidence_refs"]
    assert {ref["kind"] for ref in plan["evidence_refs"]} == {
        "class_indicator",
        "material",
    }
    assert plan["plan"]["teaching_objectives"]
    assert "25.0%" in " ".join(plan["plan"]["key_problems"])
    assert plan["source_versions"] == {"I1": 2}


def test_rule_plan_refuses_to_invent_content_without_scored_records():
    with pytest.raises(ValueError, match="没有有效评分记录"):
        build_rule_plan(_run(), "C2", "N01", _report(), _sources())


def test_fingerprint_changes_when_evidence_changes():
    baseline = current_class_plan_fingerprint(
        _run(), "C1", "N01", _report(), _sources()
    )
    changed = _report()
    changed["comparisons"][0]["classes"][0]["ratio"] = 0.9
    assert (
        current_class_plan_fingerprint(_run(), "C1", "N01", changed, _sources())
        != baseline
    )


def test_generated_plan_cannot_claim_teacher_acceptance():
    with pytest.raises(InvalidReview, match="审核人"):
        ClassTeachingPlan(
            plan_id="",
            scope=ClassPlanScope("run-class-plan", "C1", "N01"),
            version=1,
            status="accepted",
            generation_source="rule",
            source_fingerprint="a" * 64,
            plan=ClassPlanBody(
                teaching_objectives=["目标"],
                key_problems=["问题"],
                teaching_actions=["行动"],
                observation_points=["观察"],
                adjustment_conditions=["条件"],
            ),
            evidence_refs=({"kind": "class_indicator"},),
        )


def test_review_creates_new_version_without_overwriting_history():
    body = ClassPlanBody(
        teaching_objectives=["目标"],
        key_problems=["问题"],
        teaching_actions=["行动"],
        observation_points=["观察"],
        adjustment_conditions=["条件"],
    )
    draft = ClassTeachingPlan(
        plan_id="p1",
        scope=ClassPlanScope("run-class-plan", "C1", "N01"),
        version=1,
        status="draft",
        generation_source="rule",
        source_fingerprint="b" * 64,
        plan=body,
        evidence_refs=({"kind": "class_indicator"},),
        created_at="2026-01-01T00:00:00+00:00",
        updated_at="2026-01-01T00:00:00+00:00",
    )

    accepted = draft.reviewed("accepted", "王老师", "已核对班级证据")

    assert accepted.version == 2
    assert accepted.status == "accepted"
    assert accepted.reviewer == "王老师"
    assert draft.version == 1 and draft.status == "draft"

    with pytest.raises(InvalidReview, match="审核说明"):
        draft.reviewed("accepted", "王老师", "  ")


def test_draft_requires_evidence_refs():
    with pytest.raises(InvalidReview, match="证据"):
        ClassTeachingPlan(
            plan_id="",
            scope=ClassPlanScope("run-class-plan", "C1", "N01"),
            version=1,
            status="draft",
            generation_source="rule",
            source_fingerprint="c" * 64,
            plan=ClassPlanBody(
                teaching_objectives=["目标"],
                key_problems=["问题"],
                teaching_actions=["行动"],
                observation_points=["观察"],
                adjustment_conditions=["条件"],
            ),
            evidence_refs=(),
        )


def test_repository_persists_every_version_in_order(tmp_path):
    store = Store(tmp_path)
    store.database.create_schema_for_tests()
    with store.uow_factory() as uow:
        uow.runs.save(
            {
                "run_id": "run-class-plan",
                "created_at": "2026-01-01T00:00:00+00:00",
                "rule_version": "test",
                "quality": {},
                "objectives": [],
                "items": [],
                "students": [],
                "nodes": [],
                "responses": [],
                "metrics": [],
                "observations": [],
            }
        )

    def record(version: int, status: str) -> dict:
        return {
            "run_id": "run-class-plan",
            "class_id": "C1",
            "node_id": "N01",
            "version": version,
            "status": status,
            "generation_source": "rule",
            "source_fingerprint": "d" * 64,
            "plan": {
                "teaching_objectives": ["目标"],
                "key_problems": ["问题"],
                "teaching_actions": ["行动"],
                "observation_points": ["观察"],
                "adjustment_conditions": ["条件"],
            },
            "evidence_refs": [{"kind": "class_indicator"}],
        }

    with store.uow_factory() as uow:
        uow.class_teaching_plans.create(record(1, "draft"))
    with store.uow_factory() as uow:
        uow.class_teaching_plans.create(record(2, "accepted"))

    with store.uow_factory(immediate=False) as uow:
        plans = uow.class_teaching_plans.list("run-class-plan", "C1", "N01")
        latest = uow.class_teaching_plans.latest("run-class-plan", "C1", "N01")
        next_version = uow.class_teaching_plans.next_version(
            "run-class-plan", "C1", "N01"
        )

    assert [plan["version"] for plan in plans] == [1, 2]
    assert latest["status"] == "accepted"
    assert next_version == 3
