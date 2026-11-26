"""演示数据集：导入兼容性、质量口径与班级方案闭环可用性。"""

import json
from pathlib import Path

from app.repositories.store import Store

ROOT = Path(__file__).resolve().parents[3]
DEMO = ROOT / "demo-data"


def _store(tmp_path) -> Store:
    store = Store(tmp_path)
    store.database.create_schema_for_tests()
    return store


def test_demo_bundle_imports_with_expected_quality_counts(tmp_path):
    manifest = json.loads((DEMO / "manifest.json").read_text(encoding="utf-8"))
    expected = manifest["expected"]
    store = _store(tmp_path)

    result = store.import_folder(DEMO / "csv")
    quality = result["quality"]
    findings = quality.get("finding_counts", {})

    assert len(result["students"]) == expected["student_count"]
    assert len(result["items"]) == expected["item_count"]
    assert len(result["nodes"]) == expected["node_count"]
    assert len(result["objectives"]) == expected["indicator_count"]
    assert quality["raw_rows"] == expected["raw_rows"]
    assert findings.get("pending", 0) == expected["pending_rows"]
    assert findings.get("unanswered", 0) == expected["unanswered_rows"]
    assert findings.get("invalid_score", 0) == expected["over_maximum_rows"]
    assert findings.get("multiple_revisions", 0) == expected["revised_events"]
    assert quality["eligible_scored"] > 0
    store.database.dispose()


def test_demo_data_marks_problem_and_unanswered_records_as_not_scored(tmp_path):
    store = _store(tmp_path)

    result = store.import_folder(DEMO / "csv")
    counts = result["quality"]["disposition_counts"]

    assert counts.get("pending", 0) > 0
    assert counts.get("unanswered", 0) > 0
    assert counts.get("excluded", 0) > 0
    store.database.dispose()


def test_demo_data_supports_class_plan_closed_loop(tmp_path):
    store = _store(tmp_path)
    store.import_folder(DEMO / "csv")
    draft = store.use_cases.class_teaching_plans.draft("C1", "N01")
    assert draft["status"] == "draft"
    assert draft["evidence_refs"]
    accepted = store.use_cases.class_teaching_plans.review(
        draft["plan_id"],
        {"status": "accepted", "reviewer": "演示教师", "reason": "演示数据已核对"},
    )
    history = store.use_cases.class_teaching_plans.list("C1", "N01")
    assert [plan["status"] for plan in history["plans"]] == ["draft", "accepted"]
    assert accepted["version"] == 2
    store.database.dispose()


def test_demo_sources_are_present_for_current_indicator(tmp_path):
    sources = DEMO / "sources"
    pdfs = sorted(path.name for path in sources.glob("*.pdf"))
    assert pdfs, "演示数据需要至少两份来源 PDF"
    assert all((sources / name).stat().st_size > 0 for name in pdfs)
