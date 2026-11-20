from __future__ import annotations

import copy
import hashlib
import io
import json
import zipfile

from app.services.analysis import analyze
from app.services.exports import package
from app.services.shared import release_service


def release_state():
    run = {
        "run_id": "run-1",
        "students": [{"学生编号": f"D{i}"} for i in range(1, 4)],
        "files": {"作答记录.csv": "sha256"},
    }
    case_ids = ["D1", "D2", "D3"]
    cases = {}
    reviews = {}
    sources = {
        "I1": [
            {"version": 2, "status": "verified", "stale": False, "material_ids": ["Q1"]}
        ]
    }
    for student_id in case_ids:
        reference = {
            "kind": "response",
            "evidence_id": f"ev-{student_id}",
            "record_id": f"R-{student_id}",
            "source_line": 10,
            "scope": {
                "run_id": "run-1",
                "student_id": student_id,
                "indicator_id": "I1",
                "node_id": "N1",
            },
        }
        cases[student_id] = [
            {
                "run_id": "run-1",
                "student_id": student_id,
                "status": "confirmed",
                "version": 1,
                "evidence_refs": [reference],
                "review_refs": [{"indicator_id": "I1", "node_id": "N1", "version": 2}],
            }
        ]
        reviews[f"{student_id}:I1"] = [
            {
                "version": 2,
                "node_id": "N1",
                "status": "edited",
                "reason": "教师复核",
                "structured_plan": {
                    "material_ids": ["Q1"],
                    "activity": "教师引导短练习",
                    "steps": ["学生独立完成"],
                    "practice": ["Q1"],
                    "observation_points": ["记录步骤"],
                },
                "source_verification_versions": {"I1": 2},
            }
        ]
    report = {
        "cases": {
            "run_id": "run-1",
            "status": "ready",
            "cases": [{"student_id": student_id} for student_id in case_ids],
        },
        "class": {"run_id": "run-1", "node_id": "N1", "status": "ready"},
    }
    return run, sources, cases, reviews, report, case_ids


def test_release_blocks_invalid_selection_stale_sources_and_missing_class_report(
    monkeypatch,
):
    monkeypatch.setattr(
        release_service, "validate_evidence_references", lambda run, refs: refs
    )
    run, sources, cases, reviews, report, case_ids = release_state()
    stale_sources = copy.deepcopy(sources)
    stale_sources["I1"][0]["stale"] = True
    missing_class = copy.deepcopy(report)
    missing_class["class"]["status"] = "incomplete"
    checks = release_service.check_release(
        run, stale_sources, cases, reviews, missing_class, case_ids, node_id="N1"
    )
    by_id = {item["id"]: item for item in checks}
    assert by_id["source_signoffs"]["status"] == "blocked"
    assert by_id["class_report"]["status"] == "blocked"
    invalid = release_service.check_release(
        run, sources, cases, reviews, report, ["D1", "D1", "unknown"], node_id="N1"
    )
    assert (
        next(item for item in invalid if item["id"] == "case_selection")["status"]
        == "blocked"
    )


def test_release_keeps_open_human_evaluation_visible_and_fingerprint_binds_snapshots(
    monkeypatch,
):
    monkeypatch.setattr(
        release_service, "validate_evidence_references", lambda run, refs: refs
    )
    run, sources, cases, reviews, report, case_ids = release_state()
    checks = release_service.check_release(
        run,
        sources,
        cases,
        reviews,
        report,
        case_ids,
        node_id="N1",
        reviewer="内容负责人",
        content_reviewed=True,
    )
    by_id = {item["id"]: item for item in checks}
    assert all(
        by_id[key]["status"] == "passed"
        for key in (
            "case_selection",
            "confirmed_cases",
            "evidence_references",
            "teacher_reviews",
            "source_signoffs",
            "case_report",
            "class_report",
            "human_content_review",
        )
    )
    assert by_id["independent_evaluation"]["status"] == "not_checked"
    first = release_service.release_fingerprint(
        run, sources, cases, reviews, report, case_ids, "N1", checks, "内容负责人", True
    )
    changed_reviews = copy.deepcopy(reviews)
    changed_reviews["D1:I1"][0]["version"] = 3
    second = release_service.release_fingerprint(
        run,
        sources,
        cases,
        changed_reviews,
        report,
        case_ids,
        "N1",
        checks,
        "内容负责人",
        True,
    )
    assert first != second


def test_release_blocks_unknown_or_forged_evidence_references(monkeypatch):
    def reject_reference(run, refs):
        raise ValueError("作答证据已过期或引用来源不匹配")

    monkeypatch.setattr(
        release_service, "validate_evidence_references", reject_reference
    )
    run, sources, cases, reviews, report, case_ids = release_state()
    checks = release_service.check_release(
        run, sources, cases, reviews, report, case_ids, node_id="N1"
    )
    evidence_check = next(
        item for item in checks if item["id"] == "evidence_references"
    )
    assert evidence_check["status"] == "blocked"
    assert "引用来源不匹配" in evidence_check["detail"]


def test_release_blocks_incomplete_diagnostic_plans_and_unreviewed_v2_hints(
    monkeypatch,
):
    monkeypatch.setattr(
        release_service, "validate_evidence_references", lambda run, refs: refs
    )
    run, sources, cases, reviews, report, case_ids = release_state()
    reviews["D1:I1"][0]["structured_plan"] = {
        "material_ids": [],
        "activity": "",
        "steps": [],
        "practice": [],
        "observation_points": [],
    }
    checks = release_service.check_release(
        run, sources, cases, reviews, report, case_ids, node_id="N1"
    )
    assert (
        next(item for item in checks if item["id"] == "teacher_reviews")["status"]
        == "blocked"
    )

    reviews["D1:I1"][0]["teaching_plan_v2"] = {
        "goal": "完成诊断任务",
        "steps": [{"step": "独立作答"}],
        "hints": [],
        "observation_points": ["记录过程"],
        "material_ids": [],
    }
    checks = release_service.check_release(
        run, sources, cases, reviews, report, case_ids, node_id="N1"
    )
    assert (
        next(item for item in checks if item["id"] == "teacher_reviews")["status"]
        == "blocked"
    )


def test_submission_package_adds_release_checks_reports_schema_and_html_without_losing_legacy_files():
    run = analyze(
        {
            "课程要求": [{"主题编号": "T1", "指标编号": "I1", "观察指标": "数量关系"}],
            "题目与材料": [
                {"材料编号": "Q1", "主题编号": "T1", "指标编号": "I1", "满分": "2"}
            ],
            "模拟学生": [
                {"学生编号": f"D{i}", "模拟班级编号": "C1"} for i in range(1, 4)
            ],
            "测验节点": [{"节点编号": "N1", "可用题目编号": "Q1"}],
            "作答记录": [],
            "字段说明": [],
        },
        {},
    )
    checks = [
        {
            "id": "independent_evaluation",
            "label": "赛事独立验收",
            "status": "not_checked",
            "category": "human",
            "detail": "待赛事数据到达",
        }
    ]
    reports = {
        "cases": {"run_id": run["run_id"], "status": "ready", "cases": []},
        "class": {
            "run_id": run["run_id"],
            "node_id": "N1",
            "status": "ready",
            "classes": [],
            "comparisons": [],
            "common_observations": [],
            "limitations": [],
        },
    }
    submission = {
        "checks": checks,
        "reports": reports,
        "fingerprint": "a" * 64,
        "reviewer": "教师甲",
        "content_reviewed": True,
        "release_status": "ready_with_open_checks",
    }
    archive_bytes = package(run, {}, ["D1", "D2", "D3"], submission=submission)
    with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
        names = set(archive.namelist())
        assert {
            "manifest.json",
            "release_checks.json",
            "case_reports.json",
            "class_report.json",
            "submission.schema.json",
            "submission-report.html",
            "data_quality.json",
            "checksums.json",
        }.issubset(names)
        manifest = json.loads(archive.read("manifest.json"))
        assert manifest["package_type"] == "competition_submission"
        assert manifest["schema_version"] == "2.0"
        assert manifest["release_status"] == "ready_with_open_checks"
        assert (
            json.loads(archive.read("release_checks.json"))[0]["status"]
            == "not_checked"
        )
        checksums = json.loads(archive.read("checksums.json"))
        assert set(checksums) == names - {"checksums.json"}
        for name, expected in checksums.items():
            assert hashlib.sha256(archive.read(name)).hexdigest() == expected
        assert archive.testzip() is None
