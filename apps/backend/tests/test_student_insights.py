from app.services.task02.insight_service import build_student_insights
from test_server import client_for


def _response(record_id, item_id, point, earned, state="valid", line=10):
    return {
        "kind": "response",
        "evidence_id": f"evidence:{record_id}",
        "record_id": record_id,
        "event_id": f"event:{record_id}",
        "source_line": line,
        "student_id": "D01",
        "indicator_id": "T01I1",
        "node_id": "N01",
        "material_id": item_id,
        "state": "scored",
        "score": "1",
        "maximum": "2",
        "disposition": "scored",
        "rubric_observation": {
            "state": state,
            "points": [{"point_id": point, "earned": earned, "maximum": 1}],
            "conflicts": ["point_total_differs_from_score"]
            if state == "conflict"
            else [],
        },
    }


def _bundle(responses, mappings=None):
    return {
        "scope": {
            "run_id": "run-1",
            "student_id": "D01",
            "indicator_id": "T01I1",
            "node_id": "N01",
        },
        "responses": responses,
        "items": [
            {"material_id": f"Q00{i}", "prompt": f"题目{i}", "maximum": "2"}
            for i in range(1, 5)
        ],
        "rubric_definitions": [
            {
                "point_id": "Q001P1",
                "item_id": "Q001",
                "description": "列出同类项",
                "maximum": 1,
            },
            {
                "point_id": "Q002P1",
                "item_id": "Q002",
                "description": "列出同类项",
                "maximum": 1,
            },
            {
                "point_id": "Q003P1",
                "item_id": "Q003",
                "description": "列出同类项",
                "maximum": 1,
            },
        ],
        "coverage": {
            "expected_material_ids": ["Q001", "Q002", "Q003"],
            "observed_material_ids": sorted({row["material_id"] for row in responses}),
            "unobserved_material_ids": [],
            "record_count": len(responses),
            "unknown_reason": "no_response_records_in_scope" if not responses else None,
            "evidence_id": "coverage:scope-1",
        },
        "source_context": {
            "status": "verified" if mappings else "pending",
            "stale": False,
            "rubric_mappings": mappings or [],
        },
        "fingerprint": "bundle-1",
    }


def test_single_point_loss_is_local_fact_and_not_repeated_problem():
    bundle = _bundle([_response("R1", "Q001", "Q001P1", 0)])

    claims = build_student_insights(bundle)

    assert len(claims) == 1
    assert claims[0]["kind"] == "fact"
    assert "Q001" in claims[0]["text"]
    assert "Q001P1" in claims[0]["text"]
    assert not any(claim["kind"] == "rule_observation" for claim in claims)
    assert claims[0]["limitations"]


def test_two_similar_losses_need_verified_mapping_and_keep_success_counterexample():
    responses = [
        _response("R1", "Q001", "Q001P1", 0, line=10),
        _response("R2", "Q002", "Q002P1", 0, line=11),
        _response("R3", "Q003", "Q003P1", 1, line=12),
    ]
    unmapped = build_student_insights(_bundle(responses))
    assert not any(claim["kind"] == "rule_observation" for claim in unmapped)

    mapping = {
        "issue_id": "combine_like_terms",
        "label": "同类项识别",
        "rubric_point_ids": ["Q001P1", "Q002P1", "Q003P1"],
        "material_ids": ["Q001", "Q002", "Q003"],
        "status": "verified",
    }
    mapped = build_student_insights(_bundle(responses, [mapping]))
    repeated = next(claim for claim in mapped if claim["kind"] == "rule_observation")
    assert {ref["record_id"] for ref in repeated["evidence_refs"]} >= {"R1", "R2"}
    assert "Q003" in repeated["text"]
    assert repeated["limitations"]


def test_conflict_blocks_point_attribution_and_no_records_are_not_weakness():
    conflict = build_student_insights(
        _bundle([_response("R1", "Q001", "Q001P1", 0, state="conflict")])
    )
    assert len(conflict) == 1
    assert "冲突" in conflict[0]["text"]
    assert "point_total_differs_from_score" in conflict[0]["limitations"][0]

    empty_bundle = _bundle([])
    empty = build_student_insights(empty_bundle)
    assert len(empty) == 1
    assert empty[0]["kind"] == "fact"
    assert "无法判断" in empty[0]["text"]
    assert "薄弱" not in empty[0]["text"]
    assert empty[0]["evidence_refs"][0]["evidence_id"] == "coverage:scope-1"


def test_student_insights_endpoint_returns_scoped_claims(tmp_path):
    client = client_for(tmp_path)

    response = client.get(
        "/api/student-insights",
        params={"student": "D01", "indicator": "T01I1", "node": "N01"},
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["scope"] == {
        "run_id": payload["scope"]["run_id"],
        "student_id": "D01",
        "indicator_id": "T01I1",
        "node_id": "N01",
    }
    assert payload["bundle_fingerprint"]
    assert all(claim["review_status"] == "not_reviewed" for claim in payload["claims"])
    client.close()
