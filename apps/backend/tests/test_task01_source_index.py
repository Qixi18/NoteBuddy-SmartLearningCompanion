"""Focused TASK01 tests for source-map integrity and status propagation."""

import json

from app.services.task01.source_index_service import build_source_index


def test_source_index_preserves_theme_notes_and_verifies_explicit_valid_locator(
    tmp_path,
):
    checks = {
        "T01": {
            "curriculum_file_page": 62,
            "curriculum_check": "主题定位说明",
            "textbook_slices": ["B05.pdf"],
        },
        "indicator_checks": {
            "T01I1": {
                "topic_id": "T01",
                "status": "verified",
                "curriculum_locator": "课标 PDF 第 62 页",
                "reviewer": "学科复核人",
                "checked_at": "2026-11-16",
            }
        },
    }
    (tmp_path / "source_checks.json").write_text(
        json.dumps(checks, ensure_ascii=False), encoding="utf-8"
    )
    objectives = [
        {
            "主题编号": "T01",
            "指标编号": "T01I1",
            "课标文件页／正文页": "62/55",
            "教材正文页": "68",
        }
    ]

    index, loaded_checks = build_source_index(objectives, tmp_path)

    assert loaded_checks == checks
    assert index[0]["verification"] == "verified"
    assert index[0]["indicator_check"]["curriculum_locator"] == "课标 PDF 第 62 页"
    assert index[0]["source_check"] == checks["T01"]
    assert index[0]["integrity_issues"] == []


def test_unknown_or_invalid_indicator_mappings_stay_pending_or_invalid(tmp_path):
    checks = {
        "T01": {"textbook_check": "主题材料说明"},
        "indicator_checks": {
            "T01I2": {
                "topic_id": "T02",
                "status": "verified",
                "textbook_locator": "教材第 70 页",
                "reviewer": "复核人",
                "checked_at": "2026-11-16",
            },
            "T01I3": {
                "topic_id": "T01",
                "status": "verified",
                "textbook_locator": "   ",
                "reviewer": "复核人",
                "checked_at": "2026-11-16",
            },
        },
    }
    (tmp_path / "source_checks.json").write_text(
        json.dumps(checks, ensure_ascii=False), encoding="utf-8"
    )
    objectives = [
        {"主题编号": "T01", "指标编号": indicator_id}
        for indicator_id in ("T01I1", "T01I2", "T01I3", "T01I4")
    ]

    index, _ = build_source_index(objectives, tmp_path)

    assert [entry["verification"] for entry in index] == [
        "pending",
        "invalid",
        "invalid",
        "pending",
    ]
    assert "topic_id_missing_or_mismatched" in index[1]["integrity_issues"]
    assert "textbook_locator_invalid" in index[2]["integrity_issues"]
    assert index[0]["indicator_check"] == {}
    assert index[3]["indicator_check"] == {}


def test_duplicate_indicator_ids_are_reported_as_invalid(tmp_path):
    (tmp_path / "source_checks.json").write_text(
        json.dumps({"T01": {}}), encoding="utf-8"
    )
    objectives = [
        {"主题编号": "T01", "指标编号": "T01I1"},
        {"主题编号": "T01", "指标编号": "T01I1"},
    ]

    index, _ = build_source_index(objectives, tmp_path)

    assert [entry["verification"] for entry in index] == ["invalid", "invalid"]
    assert all("duplicate_indicator_id" in entry["integrity_issues"] for entry in index)


def test_verified_map_with_unknown_material_or_rubric_reference_is_invalid(tmp_path):
    checks = {
        "T01": {},
        "indicator_checks": {
            "T01I1": {
                "topic_id": "T01",
                "status": "verified",
                "textbook_locator": "教材第 68 页",
                "reviewer": "复核人",
                "checked_at": "2026-11-16",
                "material_ids": ["Q999"],
                "rubric_mappings": [
                    {
                        "issue_id": "ISSUE-1",
                        "status": "verified",
                        "rubric_point_ids": ["Q001P9"],
                    }
                ],
            }
        },
    }
    (tmp_path / "source_checks.json").write_text(
        json.dumps(checks, ensure_ascii=False), encoding="utf-8"
    )

    index, _ = build_source_index(
        [{"主题编号": "T01", "指标编号": "T01I1"}],
        tmp_path,
        [{"材料编号": "Q001", "评分点": "Q001P1 计算 1分"}],
    )

    assert index[0]["verification"] == "invalid"
    assert "unknown_material_ids_reference" in index[0]["integrity_issues"]
    assert "unknown_rubric_point_reference" in index[0]["integrity_issues"]
