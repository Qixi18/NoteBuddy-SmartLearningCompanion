from __future__ import annotations

import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "competition_evaluator", ROOT / "scripts" / "evaluate_competition.py"
)
assert SPEC and SPEC.loader
evaluator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(evaluator)
DATA_SPEC = importlib.util.spec_from_file_location(
    "independent_data_checker", ROOT / "scripts" / "independent_data_check.py"
)
assert DATA_SPEC and DATA_SPEC.loader
data_checker = importlib.util.module_from_spec(DATA_SPEC)
DATA_SPEC.loader.exec_module(data_checker)


def fixture_data() -> tuple[dict, dict]:
    folder = ROOT / "tests" / "fixtures" / "competition"
    return json.loads(
        (folder / "manifest.json").read_text(encoding="utf-8")
    ), json.loads((folder / "candidate-reference.json").read_text(encoding="utf-8"))


def test_synthetic_frozen_set_has_36_range_cases_and_edge_cases() -> None:
    manifest, candidate = fixture_data()
    cases = evaluator.validate_manifest(manifest)
    assert len([case for case in cases if case["case_id"].startswith("R")]) == 36
    assert len(cases) == 45
    report = evaluator.run_evaluation(manifest, candidate)
    assert report["summary"] == {
        "total": 45,
        "passed": 45,
        "failed": 0,
        "missing": 0,
        "unknown_candidate_cases": 0,
        "subject_matter_review": "required",
    }
    assert report["dataset_kind"] == "synthetic"


def test_frozen_case_digest_rejects_manifest_edits() -> None:
    manifest, _ = fixture_data()
    manifest["cases"][0]["expected"]["allowed_material_ids"].append("MAT-UNREVIEWED")
    try:
        evaluator.validate_manifest(manifest)
    except evaluator.EvaluationError as exc:
        assert "cases_sha256 mismatch" in str(exc)
    else:
        raise AssertionError("changed frozen cases must be rejected")


def test_scope_evidence_and_material_leaks_fail_case() -> None:
    manifest, candidate = fixture_data()
    row = candidate["cases"]["R01"]
    row["scope"] = {**row["scope"], "student_id": "SYN-OTHER"}
    row["evidence_ids"].append("EV-OTHER-STUDENT")
    row["material_ids"].append("MAT-NOT-APPROVED")
    report = evaluator.run_evaluation(manifest, candidate)
    result = next(item for item in report["results"] if item["case_id"] == "R01")
    assert result["status"] == "fail"
    assert len(result["failures"]) == 3


def test_missing_required_evidence_and_forbidden_claim_fail() -> None:
    manifest, candidate = fixture_data()
    candidate["cases"]["E04"]["evidence_ids"] = []
    candidate["cases"]["E04"]["claim_ids"].append("CLAIM-MASTERY")
    result = next(
        item
        for item in evaluator.run_evaluation(manifest, candidate)["results"]
        if item["case_id"] == "E04"
    )
    assert result["status"] == "fail"
    assert any("required evidence missing" in issue for issue in result["failures"])
    assert any("prohibited claim present" in issue for issue in result["failures"])


def test_missing_and_unknown_candidate_cases_are_reported() -> None:
    manifest, candidate = fixture_data()
    del candidate["cases"]["R02"]
    candidate["cases"]["NOT-IN-MANIFEST"] = {}
    report = evaluator.run_evaluation(manifest, candidate)
    assert report["summary"]["missing"] == 1
    assert report["summary"]["unknown_candidate_cases"] == 1
    assert report["summary"]["failed"] == 1


def _write_source_fixture(folder: Path, rows: list[dict[str, str]]) -> None:
    import csv

    tables = {
        "课程要求": (["指标编号"], [{"指标编号": "T01I1"}]),
        "题目与材料": (
            ["材料编号", "主题编号", "指标编号", "满分"],
            [{"材料编号": "Q001", "主题编号": "T01", "指标编号": "T01I1", "满分": "3"}],
        ),
        "模拟学生": (
            ["学生编号", "模拟班级编号"],
            [
                {"学生编号": student, "模拟班级编号": "C1"}
                for student in sorted({row["学生编号"] for row in rows})
            ],
        ),
        "测验节点": (
            ["节点编号", "可用题目编号"],
            [{"节点编号": "N01", "可用题目编号": "Q001"}],
        ),
        "作答记录": (
            [
                "记录编号",
                "学生编号",
                "材料编号",
                "节点编号",
                "主题编号",
                "作答事件编号",
                "修订版本",
                "评分状态",
                "得分",
                "满分",
            ],
            rows,
        ),
        "字段说明": (
            ["数据表", "字段名"],
            [{"数据表": "作答记录", "字段名": "记录编号"}],
        ),
    }
    folder.mkdir(parents=True, exist_ok=True)
    for name, (fields, values) in tables.items():
        with (folder / f"{name}.csv").open(
            "w", newline="", encoding="utf-8-sig"
        ) as stream:
            writer = csv.DictWriter(stream, fieldnames=fields)
            writer.writeheader()
            writer.writerows(rows if name == "作答记录" else values)


def _response(
    record: str, student: str, event: str, version: int, status: str, score: str
) -> dict[str, str]:
    return {
        "记录编号": record,
        "学生编号": student,
        "材料编号": "Q001",
        "节点编号": "N01",
        "主题编号": "T01",
        "作答事件编号": event,
        "修订版本": str(version),
        "评分状态": status,
        "得分": score,
        "满分": "3" if status == "已评分" else "",
    }


def test_independent_recalculation_is_order_invariant_and_keeps_old_versions_out(
    tmp_path: Path,
) -> None:
    rows = [
        _response("DR01", "D01", "EV01", 1, "已评分", "0"),
        _response("DR02", "D01", "EV01", 2, "已评分", "3"),
        _response("DR03", "D02", "EV02", 1, "已评分", "1"),
        _response("DR04", "D03", "EV03", 1, "待评分", ""),
        _response("DR05", "D04", "EV04", 1, "未作答", ""),
    ]
    first, second = tmp_path / "first", tmp_path / "second"
    _write_source_fixture(first, rows)
    _write_source_fixture(second, list(reversed(rows)))
    result_a, result_b = (
        data_checker.recalculate(first),
        data_checker.recalculate(second),
    )
    for key in (
        "disposition_counts",
        "scored_record_count",
        "scored_points",
        "scored_maximum",
        "student_totals",
    ):
        assert result_a[key] == result_b[key]
    assert result_a["disposition_counts"] == {
        "pending": 1,
        "scored": 2,
        "superseded": 1,
        "unanswered": 1,
    }
    assert result_a["student_totals"]["D01"] == {"score": 3, "maximum": 3, "records": 1}


def test_replacing_student_ids_preserves_aggregate_and_other_student_facts(
    tmp_path: Path,
) -> None:
    rows = [
        _response("DR01", "D01", "EV01", 1, "已评分", "3"),
        _response("DR02", "D02", "EV02", 1, "已评分", "1"),
    ]
    original, changed = tmp_path / "original", tmp_path / "changed"
    _write_source_fixture(original, rows)
    renamed = [
        {
            **row,
            "学生编号": f"X{row['学生编号'][1:]}",
            "记录编号": f"X{row['记录编号'][2:]}",
        }
        for row in rows
    ]
    _write_source_fixture(changed, renamed)
    baseline = data_checker.recalculate(original)
    renamed_result = data_checker.recalculate(changed)
    assert baseline["scored_points"] == renamed_result["scored_points"]
    assert baseline["scored_maximum"] == renamed_result["scored_maximum"]
    assert baseline["student_totals"]["D01"] == {"score": 3, "maximum": 3, "records": 1}
    changed_other = [
        {**row, "得分": "0"} if row["学生编号"] == "D02" else row for row in rows
    ]
    isolated = tmp_path / "other-student-changed"
    _write_source_fixture(isolated, changed_other)
    isolated_result = data_checker.recalculate(isolated)
    assert isolated_result["student_totals"]["D01"] == baseline["student_totals"]["D01"]
