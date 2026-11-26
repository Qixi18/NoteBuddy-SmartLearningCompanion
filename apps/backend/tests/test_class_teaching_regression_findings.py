"""Exploratory regression checks for the class-teaching acceptance findings."""

from test_server import client_for


def test_ai_analysis_reference_is_stable_for_generation_review_and_listing(tmp_path):
    client = client_for(tmp_path)
    run_id = client.get("/api/run").json()["run_id"]
    app = client.app.state.use_cases.ai_analysis
    original_preview = app.preview
    app.preview = lambda *args, **kwargs: {
        "analysis": {"analysis_id": "analysis-123", "status": "complete", "findings": [{"claim": "supported"}]},
        "stale": False,
        "source_fingerprint": "f" * 64,
    }
    draft = client.post("/api/class-teaching-plans/draft", json={"class_id": "C1", "node_id": "N01"})
    assert draft.status_code == 200, draft.text
    plan = draft.json()
    assert plan["generation_source"] == "ai"
    reviewed = client.post(
        f"/api/class-teaching-plans/{plan['plan_id']}/review",
        json={"run_id": run_id, "status": "accepted", "reviewer": "QA", "reason": "checked"},
    )
    assert reviewed.status_code == 200, reviewed.text
    history = client.get("/api/class-teaching-plans", params={"class": "C1", "node": "N01"})
    assert history.status_code == 200, history.text
    assert all(item["stale"] is False for item in history.json()["plans"])
    app.preview = original_preview
    client.close()


def test_latest_accepted_plan_is_rejected_after_data_changes(tmp_path):
    client = client_for(tmp_path)
    run_id = client.get("/api/run").json()["run_id"]
    draft_response = client.post(
        "/api/class-teaching-plans/draft",
        json={"class_id": "C1", "node_id": "N01"},
    )
    assert draft_response.status_code == 200, draft_response.text
    draft = draft_response.json()
    review = client.post(
        f"/api/class-teaching-plans/{draft['plan_id']}/review",
        json={"run_id": run_id, "status": "accepted", "reviewer": "QA", "reason": "review"},
    )
    assert review.status_code == 200, review.text

    # Simulate a source change after review without mutating the immutable run snapshot.
    client.app.state.use_cases.class_teaching_plans.current_fingerprint = lambda *_: "0" * 64

    response = client.post(
        "/api/class-teaching-adjustments",
        json={
            "run_id": run_id,
            "class_id": "C1",
            "node_id": "N01",
            "plan_id": review.json()["plan_id"],
            "planned_activity": "test stale plan guard",
        },
    )

    assert response.status_code == 400
    assert "过期" in response.json()["error"]
    client.close()


def test_reviewed_plan_text_change_cannot_be_marked_accepted(tmp_path):
    client = client_for(tmp_path)
    draft = client.post("/api/class-teaching-plans/draft", json={"class_id": "C1", "node_id": "N01"}).json()
    body = dict(draft["plan"])
    body["teaching_actions"] = ["教师已改写正文"]
    response = client.post(
        f"/api/class-teaching-plans/{draft['plan_id']}/review",
        json={"run_id": client.get("/api/run").json()["run_id"], "status": "accepted", "reviewer": "QA", "reason": "review", "plan": body},
    )
    assert response.status_code == 400
    assert "教师修改" in response.json()["error"]
    client.close()
