"""班级教学方案 HTTP 契约：查询、生成、审核与版本历史。"""

from test_server import client_for


def _run_id(client):
    return client.get("/api/run").json()["run_id"]


def _draft(client, class_id="C1", node="N01"):
    return client.post(
        "/api/class-teaching-plans/draft",
        json={"class_id": class_id, "node_id": node, "reviewer": ""},
    )


def test_class_plan_history_is_empty_before_generation(tmp_path):
    client = client_for(tmp_path)

    response = client.get("/api/class-teaching-plans", params={"class": "C1", "node": "N01"})

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["plans"] == []
    assert payload["latest_status"] is None
    assert len(payload["current_fingerprint"]) == 64
    client.close()


def test_class_plan_draft_is_rule_generated_and_reused(tmp_path):
    client = client_for(tmp_path)

    first = _draft(client)
    assert first.status_code == 200, first.text
    draft = first.json()
    assert draft["status"] == "draft"
    assert draft["generation_source"] == "rule"
    assert draft["version"] == 1
    assert draft["reused"] is False
    assert draft["class_id"] == "C1" and draft["node_id"] == "N01"
    assert draft["evidence_refs"]
    assert draft["plan"]["teaching_objectives"]
    assert draft["plan"]["observation_points"]

    second = _draft(client)
    assert second.status_code == 200, second.text
    assert second.json()["plan_id"] == draft["plan_id"]
    assert second.json()["reused"] is True
    client.close()


def test_class_plan_review_creates_new_version_and_keeps_history(tmp_path):
    client = client_for(tmp_path)
    draft = _draft(client).json()

    review = client.post(
        f"/api/class-teaching-plans/{draft['plan_id']}/review",
        json={
            "run_id": _run_id(client),
            "status": "accepted",
            "reviewer": "王老师",
            "reason": "已核对班级诊断证据，按方案实施。",
        },
    )
    assert review.status_code == 200, review.text
    accepted = review.json()
    assert accepted["version"] == 2
    assert accepted["status"] == "accepted"
    assert accepted["reviewer"] == "王老师"

    history = client.get(
        "/api/class-teaching-plans", params={"class": "C1", "node": "N01"}
    ).json()
    assert [plan["version"] for plan in history["plans"]] == [1, 2]
    assert history["latest_status"] == "accepted"
    assert all(plan["stale"] is False for plan in history["plans"])
    client.close()


def test_class_plan_review_can_save_edited_body(tmp_path):
    client = client_for(tmp_path)
    draft = _draft(client).json()

    body = dict(draft["plan"])
    body["teaching_actions"] = ["教师改写后的教学活动。"]

    review = client.post(
        f"/api/class-teaching-plans/{draft['plan_id']}/review",
        json={
            "run_id": _run_id(client),
            "status": "edited",
            "reviewer": "李老师",
            "reason": "按本班进度调整活动顺序。",
            "plan": body,
        },
    )

    assert review.status_code == 200, review.text
    assert review.json()["plan"]["teaching_actions"] == ["教师改写后的教学活动。"]
    client.close()


def test_class_plan_rejects_unknown_class_node_and_plan(tmp_path):
    client = client_for(tmp_path)

    assert _draft(client, class_id="C9").status_code == 400
    assert _draft(client, node="N99").status_code == 400
    assert client.post(
        "/api/class-teaching-plans/missing/review",
        json={"run_id": _run_id(client), "status": "accepted", "reviewer": "王老师", "reason": "核对完成"},
    ).status_code == 400
    assert client.get(
        "/api/class-teaching-plans", params={"class": "C1"}
    ).status_code == 422
    client.close()


def test_class_plan_without_scored_evidence_is_not_invented(tmp_path):
    client = client_for(tmp_path)

    response = _draft(client, class_id="C2")

    assert response.status_code == 400
    assert "没有有效评分记录" in response.json()["error"]
    client.close()


def test_class_plan_review_validates_required_fields(tmp_path):
    client = client_for(tmp_path)
    draft = _draft(client).json()

    missing_reviewer = client.post(
        f"/api/class-teaching-plans/{draft['plan_id']}/review",
        json={"run_id": _run_id(client), "status": "accepted", "reviewer": "", "reason": "核对完成"},
    )
    assert missing_reviewer.status_code == 422

    blank_body = dict(draft["plan"])
    blank_body["key_problems"] = ["   "]
    bad_body = client.post(
        f"/api/class-teaching-plans/{draft['plan_id']}/review",
        json={
            "run_id": _run_id(client),
            "status": "edited",
            "reviewer": "王老师",
            "reason": "调整",
            "plan": blank_body,
        },
    )
    assert bad_body.status_code == 422
    client.close()


def test_class_report_can_be_scoped_to_one_class(tmp_path):
    client = client_for(tmp_path)

    response = client.get("/api/reports/class", params={"node": "N01", "class": "C1"})

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["scope"] == {"class_id": "C1"}
    assert payload["scope_mode"] == "single_class"
    assert all(item["single_class_only"] is True for item in payload["comparisons"])
    assert all(item["comparable"] is False for item in payload["comparisons"])
    assert {row["class_id"] for row in payload["classes"]} == {"C1"}
    assert all(
        {row["class_id"] for row in comparison["classes"]} <= {"C1"}
        for comparison in payload["comparisons"]
    )
    client.close()


def test_class_plan_review_rejects_stale_fingerprint(tmp_path):
    client = client_for(tmp_path)
    draft = _draft(client).json()
    run_id = _run_id(client)

    store = client.app.state.store
    with store.uow_factory() as uow:
        existing = uow.class_teaching_plans.get(draft["plan_id"])
        stale = dict(existing)
        stale["plan_id"] = ""
        stale["version"] = existing["version"] + 1
        stale["source_fingerprint"] = "0" * 64
        record = uow.class_teaching_plans.create(stale)

    response = client.post(
        f"/api/class-teaching-plans/{record['plan_id']}/review",
        json={"run_id": run_id, "status": "accepted", "reviewer": "王老师", "reason": "核对完成"},
    )
    assert response.status_code == 400
    assert "已过期" in response.json()["error"]
    client.close()


def test_class_plan_review_rejects_superseded_version(tmp_path):
    client = client_for(tmp_path)
    draft = _draft(client).json()
    run_id = _run_id(client)

    accepted = client.post(
        f"/api/class-teaching-plans/{draft['plan_id']}/review",
        json={"run_id": run_id, "status": "accepted", "reviewer": "王老师", "reason": "核对完成"},
    )
    assert accepted.status_code == 200, accepted.text

    again = client.post(
        f"/api/class-teaching-plans/{draft['plan_id']}/review",
        json={"run_id": run_id, "status": "accepted", "reviewer": "王老师", "reason": "再次审核"},
    )
    assert again.status_code == 400
    assert "取代" in again.json()["error"]
    client.close()


def test_class_plan_review_rejects_wrong_run(tmp_path):
    client = client_for(tmp_path)
    draft = _draft(client).json()

    response = client.post(
        f"/api/class-teaching-plans/{draft['plan_id']}/review",
        json={"run_id": "other-run", "status": "accepted", "reviewer": "王老师", "reason": "核对完成"},
    )
    assert response.status_code == 400
    assert "运行" in response.json()["error"]
    client.close()
