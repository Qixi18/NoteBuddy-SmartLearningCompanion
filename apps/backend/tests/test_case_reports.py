from __future__ import annotations

import pytest
from app.services.shared.report_service import (
    build_case_report,
    build_case_reports,
    build_class_report,
)


@pytest.fixture
def report_data():
    run = {
        "run_id": "run-current",
        "students": [{"学生编号": "D01", "模拟班级编号": "C1"}],
        "items": [{"材料编号": "Q1", "指标编号": "I1", "题干或内容": "化简长表达式"}],
        "raw_responses": [
            {
                "学生编号": "D01",
                "记录编号": "R1",
                "_source_line": 12,
                "材料编号": "Q1",
                "节点编号": "N1",
                "学生最终作答": "x + 2",
                "解答过程": "合并同类项",
                "得分": "2",
                "满分": "3",
                "评分状态": "已评分",
            }
        ],
    }
    case = {
        "run_id": "run-current",
        "student_id": "D01",
        "status": "confirmed",
        "version": 2,
        "reviewer": "教师甲",
        "narrative": "教师记录的案例",
        "limitations": "单个节点的观察",
        "evidence_refs": [
            {"kind": "response", "record_id": "R1", "source_line": 12},
            {"kind": "coverage", "scope": {"node_id": "N2"}},
        ],
        "review_refs": [{"indicator_id": "I1", "node_id": "N1", "version": 3}],
    }
    review = {
        "version": 3,
        "node_id": "N1",
        "status": "edited",
        "diagnosis": "需要核对步骤",
        "recommendation": "安排短练习",
        "reason": "教师观察",
        "reviewer": "教师甲",
        "structured_plan": {
            "activity": "独立练习",
            "steps": ["先读题"],
            "practice": ["Q1"],
            "observation_points": ["过程"],
            "material_ids": ["Q1"],
        },
        "source_verification_versions": {"I1": 1},
    }
    return (
        run,
        case,
        {"D01": [case]},
        {"D01:I1": [review]},
        {"I1": [{"version": 1, "status": "verified"}]},
    )


def test_case_report_uses_confirmed_stored_evidence_and_review_snapshot(report_data):
    run, case, _, reviews, sources = report_data
    report = build_case_report(run, case, reviews, sources)
    assert report["status"] == "confirmed"
    response = next(item for item in report["evidence"] if item["kind"] == "response")
    assert (response["score"], response["maximum"], response["source_locator"]) == (
        "2",
        "3",
        "R1 · CSV 第 12 行",
    )
    assert (
        next(item for item in report["evidence"] if item["kind"] == "coverage")[
            "node_id"
        ]
        == "N2"
    )
    assert report["reviews"][0]["version"] == 3
    assert report["reviews"][0]["structured_plan"]["material_ids"] == ["Q1"]
    assert report["reviews"][0]["source_status"] == "verified"
    assert report["reviews"][0]["source_verification_versions"] == {"I1": 1}


def test_case_report_refuses_to_promote_candidates_or_other_run_cases(report_data):
    run, _, _, reviews, sources = report_data
    with pytest.raises(ValueError, match="三名不同学生"):
        build_case_reports(run, ["D01", "D01", "D01"], {}, reviews, sources)
    run_with_students = run | {
        "students": run["students"]
        + [
            {"学生编号": "D02", "模拟班级编号": "C1"},
            {"学生编号": "D03", "模拟班级编号": "C2"},
        ]
    }
    result = build_case_reports(
        run_with_students,
        ["D01", "D02", "D03"],
        {},
        reviews,
        sources,
    )
    assert result["status"] == "incomplete"
    assert all(item["status"] == "incomplete" for item in result["cases"])


def test_class_report_requires_current_run_and_node_and_reports_shared_question_differences():
    run = {"run_id": "run-current"}
    insights = {
        "run_id": "run-current",
        "node_id": "N1",
        "classes": [
            {
                "class_id": "C1",
                "student_count": 2,
                "student_ids": ["D1", "D2"],
                "scored_record_count": 3,
            }
        ],
        "comparisons": [
            {
                "indicator_id": "I1",
                "status": "available",
                "common_material_ids": ["Q1"],
                "classes": [
                    {"class_id": "C1", "common_ratio": 0.5},
                    {"class_id": "C2", "common_ratio": 0.75},
                ],
            }
        ],
        "issues": [
            {
                "indicator_id": "I1",
                "issue_id": "P1",
                "label": "符号变形",
                "by_class": [
                    {"class_id": "C1", "affected_count": 1},
                    {"class_id": "C2", "affected_count": 2},
                ],
            }
        ],
        "limitations": ["无排名"],
    }
    report = build_class_report(run, "N1", insights)
    assert report["comparisons"][0]["difference"] == pytest.approx(0.25)
    assert len(report["common_observations"]) == 1
    with pytest.raises(ValueError, match="不匹配"):
        build_class_report(run, "N2", insights)
