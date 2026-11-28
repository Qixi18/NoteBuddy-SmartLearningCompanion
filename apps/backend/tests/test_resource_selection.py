from app.services.task03.resource_selection_service import select_resources


def _bundle():
    return {
        "scope": {
            "run_id": "run-1",
            "student_id": "D01",
            "indicator_id": "I1",
            "node_id": "N01",
        },
        "items": [
            {"material_id": "Q1", "prompt": "题一", "rubric": "Q1P1 合并同类项 1分"},
            {"material_id": "Q2", "prompt": "题二", "rubric": "Q2P1 合并同类项 1分"},
        ],
        "responses": [
            {"material_id": "Q1", "disposition": "scored", "record_id": "R1"}
        ],
        "source_context": {
            "status": "verified",
            "stale": False,
            "topic_id": "T1",
            "material_ids": ["Q1", "Q2"],
            "resource_links": [
                {
                    "material_id": "TB1",
                    "status": "verified",
                    "indicator_ids": ["I1"],
                    "allowed_node_ids": ["N01"],
                    "purpose": "补救概念",
                },
                {
                    "material_id": "LC1",
                    "status": "pending",
                    "indicator_ids": ["I1"],
                    "allowed_node_ids": ["N01"],
                    "purpose": "迁移练习",
                },
                {
                    "material_id": "TB2",
                    "status": "verified",
                    "indicator_ids": ["I1"],
                    "allowed_node_ids": ["N02"],
                    "purpose": "迁移练习",
                },
                {
                    "material_id": "TB3",
                    "status": "verified",
                    "indicator_ids": ["I2"],
                    "allowed_node_ids": ["N01"],
                    "purpose": "补救其他指标",
                },
            ],
            "rubric_mappings": [
                {
                    "issue_id": "same-step",
                    "status": "verified",
                    "rubric_point_ids": ["Q1P1", "Q2P1"],
                    "material_ids": ["Q1", "Q2"],
                }
            ],
        },
    }


def _catalog():
    return [
        {
            "material_id": "Q1",
            "resource_type": "题目",
            "indicator_id": "I1",
            "topic_id": "T1",
            "available_node_ids": ["N01"],
        },
        {
            "material_id": "Q2",
            "resource_type": "题目",
            "indicator_id": "I1",
            "topic_id": "T1",
            "available_node_ids": ["N01"],
        },
        {
            "material_id": "Q3",
            "resource_type": "题目",
            "indicator_id": "I1",
            "topic_id": "T1",
            "available_node_ids": ["N02"],
        },
        {
            "material_id": "TB1",
            "resource_type": "教材",
            "indicator_id": "",
            "topic_id": "T1",
        },
        {
            "material_id": "LC1",
            "resource_type": "学习卡",
            "indicator_id": "I1",
            "topic_id": "T1",
        },
        {
            "material_id": "TB2",
            "resource_type": "教材",
            "indicator_id": "I1",
            "topic_id": "T1",
        },
        {
            "material_id": "TB3",
            "resource_type": "教材",
            "indicator_id": "I2",
            "topic_id": "T2",
        },
        {
            "material_id": "TB4",
            "resource_type": "教材",
            "indicator_id": "I1",
            "topic_id": "T9",
        },
    ]


def _insights():
    return [
        {
            "kind": "rule_observation",
            "text": "同类项步骤有失分",
            "evidence_refs": [{"description": "Q1P1：合并同类项"}],
        }
    ]


def test_filters_out_of_scope_unverified_topic_conflict_and_unknown_materials():
    bundle = _bundle()
    bundle["source_context"]["resource_links"].append(
        {
            "material_id": "MISSING",
            "status": "verified",
            "indicator_ids": ["I1"],
            "allowed_node_ids": ["N01"],
        }
    )
    bundle["source_context"]["resource_links"].append(
        {
            "material_id": "TB4",
            "status": "verified",
            "indicator_ids": ["I1"],
            "allowed_node_ids": ["N01"],
        }
    )

    result = select_resources(bundle, _insights(), _catalog(), "remediation")

    excluded = {row["material_id"]: row["reason_codes"] for row in result["excluded"]}
    assert "outside_node_scope" in excluded["Q3"]
    assert "source_not_verified" in excluded["LC1"]
    assert "outside_node_scope" in excluded["TB2"]
    assert "unknown_material" in excluded["MISSING"]
    assert "topic_mismatch" in excluded["TB4"]
    assert all(
        row["material_id"] not in {"Q3", "LC1", "TB2", "MISSING", "TB4"}
        for row in result["practice_items"] + result["learning_resources"]
    )


def test_transfer_prefers_unseen_practice_and_is_stable_with_separate_resources():
    first = select_resources(_bundle(), _insights(), _catalog(), "transfer")
    second = select_resources(_bundle(), _insights(), _catalog(), "transfer")

    assert first == second
    assert first["status"] == "ready"
    assert [row["material_id"] for row in first["practice_items"]] == ["Q2"]
    assert "unseen_for_transfer" in first["practice_items"][0]["reason_codes"]
    assert [row["material_id"] for row in first["learning_resources"]] == ["TB1"]
    assert first["practice_items"][0]["resource_type"] == "题目"
    assert first["learning_resources"][0]["resource_type"] == "教材"


def test_purpose_changes_explanations_without_changing_scope_or_verification_rules():
    remediation = select_resources(_bundle(), _insights(), _catalog(), "remediation")
    diagnostic = select_resources(_bundle(), _insights(), _catalog(), "diagnostic")
    transfer = select_resources(_bundle(), _insights(), _catalog(), "transfer")

    assert "purpose_match" in remediation["learning_resources"][0]["reason_codes"]
    assert "purpose_match" not in diagnostic["learning_resources"][0]["reason_codes"]
    assert [row["material_id"] for row in transfer["practice_items"]] == ["Q2"]
    assert all(
        row["material_id"] in {"Q1", "Q2"}
        for result in (remediation, diagnostic, transfer)
        for row in result["practice_items"]
    )


def test_unverified_or_missing_catalog_candidates_block_instead_of_guessing():
    bundle = _bundle()
    bundle["source_context"]["status"] = "pending"
    bundle["source_context"]["material_ids"] = []
    bundle["source_context"]["resource_links"] = []

    result = select_resources(bundle, [], _catalog(), "diagnostic")

    assert result["status"] == "blocked"
    assert result["practice_items"] == []
    assert result["learning_resources"] == []
    assert "no_verified_candidate" in result["reason_codes"]


def test_current_usable_ai_mapping_can_supply_candidate_without_legacy_signoff():
    bundle = _bundle()
    bundle["source_context"].update(
        status="pending",
        material_ids=[],
        resource_links=[],
        ai_mappings={
            "Q2": {"status": "usable", "relation": "assesses"},
            "TB1": {"status": "usable", "relation": "supports"},
        },
    )
    result = select_resources(bundle, [], _catalog(), "transfer")
    assert [row["material_id"] for row in result["practice_items"]] == ["Q2"]
    assert [row["material_id"] for row in result["learning_resources"]] == ["TB1"]
    assert "ai_mapping_match" in result["practice_items"][0]["reason_codes"]


def test_learning_material_without_node_practice_is_blocked_for_plan_generation():
    bundle = _bundle()
    bundle["items"] = []
    result = select_resources(bundle, [], _catalog(), "diagnostic")

    assert result["status"] == "blocked"
    assert [row["material_id"] for row in result["learning_resources"]] == ["TB1"]
    assert "no_verified_node_practice" in result["reason_codes"]


def test_transfer_without_unseen_practice_names_the_concrete_blocker():
    bundle = _bundle()
    bundle["responses"] = [
        {"material_id": "Q1", "disposition": "scored", "record_id": "R1"},
        {"material_id": "Q2", "disposition": "scored", "record_id": "R2"},
    ]

    result = select_resources(bundle, [], _catalog(), "transfer")

    assert result["status"] == "blocked"
    assert result["practice_items"] == []
    assert "no_unseen_practice_for_transfer" in result["reason_codes"]
    assert any(
        row["material_id"] == "Q2" and "already_observed" in row["reason_codes"]
        for row in result["excluded"]
    )


def test_recommendation_reasons_are_teacher_readable_and_hide_sort_tiebreaks():
    result = select_resources(_bundle(), _insights(), _catalog(), "remediation")

    question = result["practice_items"][0]
    assert "stable_id_tiebreak" not in question["reason_codes"]
    assert question["reason_details"]
    assert all(row["description"] for row in question["reason_details"])


def test_selected_materials_expose_only_recorded_locator_facts():
    catalog = _catalog()
    for row in catalog:
        if row["material_id"] == "Q1":
            row.update(source_file="演示教材 B01 单元练习", locator="B01 第 12-18 页")
            row["node_ids"] = ["N01"]
    bundle = _bundle()
    bundle["source_context"]["resource_links"][0]["source_locator"] = (
        "B01 第 12-18 页 概念回顾"
    )

    result = select_resources(bundle, _insights(), catalog, "remediation")

    question = next(row for row in result["practice_items"] if row["material_id"] == "Q1")
    assert question["source_file"] == "演示教材 B01 单元练习"
    assert question["locator"] == "B01 第 12-18 页"
    assert question["source_verified"] is True
    assert question["indicator_id"] == "I1"
    assert question["node_ids"] == ["N01"]

    resource = result["learning_resources"][0]
    assert resource["material_id"] == "TB1"
    assert resource["source_file"] == "B01 第 12-18 页 概念回顾"
    assert resource["source_verified"] is True
    assert resource["node_ids"] == ["N01"]


def test_locator_fields_stay_empty_when_imported_data_does_not_record_them():
    result = select_resources(_bundle(), _insights(), _catalog(), "remediation")

    for row in result["practice_items"] + result["learning_resources"]:
        assert row["source_file"] == ""
        assert row["locator"] == ""
        assert row["source_verified"] is True
