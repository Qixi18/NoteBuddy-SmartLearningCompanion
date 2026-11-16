import hashlib
import json

import pytest
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError

from app.domain import (
    Evidence,
    Response,
    ResponseRevision,
    ReviewStatus,
    ScoringStatus,
    TeacherReview,
)
from app.domain.common.exceptions import InvalidEvidence, InvalidReview, InvalidScore
from app.infrastructure.migration.json_to_sqlite import (
    create_verified_backup,
    migrate_json_to_sqlite,
)
from app.repositories.store import Store
from test_core import sample_tables
from app.services.analysis import analyze


def ready_store(path):
    store = Store(path)
    store.database.create_schema_for_tests()
    return store


def persist_run(store, run):
    with store.uow_factory() as uow:
        uow.runs.save(run)


def test_domain_response_score_revision_evidence_and_review_rules():
    scored = Response(
        "R1",
        "E1",
        "S1",
        "M1",
        "N1",
        1,
        ScoringStatus.SCORED,
        1,
        2,
        source_file="作答记录.csv",
        source_line=2,
    )
    pending = Response(
        "R2",
        "E1",
        "S1",
        "M1",
        "N1",
        2,
        ScoringStatus.PENDING,
        None,
        2,
        source_file="作答记录.csv",
        source_line=3,
    )
    assert scored.ratio == 0.5
    assert pending.ratio is None
    assert ResponseRevision("E1", (scored, pending)).unique_highest() == pending
    with pytest.raises(InvalidScore):
        Response("R3", "E3", "S1", "M1", "N1", 1, ScoringStatus.SCORED, 3, 2)
    with pytest.raises(InvalidScore):
        Response("R4", "E4", "S1", "M1", "N1", 1, ScoringStatus.SCORED, float("nan"), 2)
    with pytest.raises(InvalidScore):
        Response("R5", "E5", "S1", "M1", "N1", 1, ScoringStatus.SCORED, 1, float("inf"))
    with pytest.raises(InvalidEvidence):
        Evidence("S1", "I1", "R1", "M1", "source.csv", 0, 1, 2)
    review = TeacherReview("S1", "I1", ReviewStatus.ACCEPTED, 1)
    review.validate_next(None)
    with pytest.raises(InvalidReview):
        TeacherReview("S1", "I1", ReviewStatus.EDITED, 1).validate_next(review)
    with pytest.raises(InvalidReview):
        TeacherReview("S1", "I1", ReviewStatus.EDITED, 2).validate_next(review)


def test_database_has_normalized_run_scoped_rows_and_enforces_foreign_keys(tmp_path):
    store = ready_store(tmp_path)
    run = analyze(sample_tables(), {})
    persist_run(store, run)
    assert store.run_repository.current()["run_id"] == run["run_id"]
    assert store.student_repository.get_by_id(run["run_id"], "D01").class_id == "C1"
    assert (
        store.subject_repository.get_objective(run["run_id"], "T01I1").topic_id == "T01"
    )
    item = store.subject_repository.get_assessment_item(run["run_id"], "Q001")
    assert item is not None and item.max_score == 2 and item.objective_ids == ("T01I1",)
    materials = store.subject_repository.list_materials_for_objective(
        run["run_id"], "T01I1"
    )
    assert [material.material_id for material in materials] == ["Q001"]
    response = store.response_repository.get_by_id(run["run_id"], "R2")
    assert response is not None and response.ratio == 0.5
    assert response.source_file == "作答记录.csv" and response.source_line == 3
    assert set(inspect(store.database.engine).get_table_names()) >= {
        "analysis_runs",
        "classes",
        "students",
        "learning_objectives",
        "learning_items",
        "learning_item_objectives",
        "assessment_nodes",
        "response_events",
        "responses",
        "teacher_reviews",
        "app_state",
    }
    with store.database.engine.connect() as connection:
        assert connection.execute(text("PRAGMA foreign_keys")).scalar_one() == 1
    with pytest.raises(IntegrityError):
        with store.database.session() as session, session.begin():
            session.execute(
                text(
                    "INSERT INTO classes (run_id, class_id, name) VALUES ('missing', 'C1', 'C1')"
                )
            )


def test_database_review_history_appends_consecutive_versions(tmp_path):
    store = ready_store(tmp_path)
    run = analyze(sample_tables(), {})
    persist_run(store, run)
    payload = {
        "status": "accepted",
        "recommendation": "继续练习",
        "evidence_record_ids": ["R2"],
    }
    with store.uow_factory() as uow:
        first = uow.reviews.append(run["run_id"], "D01:T01I1", payload)
    with store.uow_factory() as uow:
        second = uow.reviews.append(run["run_id"], "D01:T01I1", payload)
    assert [item["version"] for item in store.reviews(run["run_id"])["D01:T01I1"]] == [
        1,
        2,
    ]
    assert [
        item.version
        for item in store.review_repository.list_domain(run["run_id"], "D01", "T01I1")
    ] == [1, 2]
    assert first["updated_at"] != "" and second["updated_at"] != ""


def test_json_migration_is_idempotent_lossless_and_restores_current(tmp_path):
    data_dir = tmp_path / "legacy"
    data_dir.mkdir()
    old = {
        "run_id": "0123456789abcdef",
        "created_at": "2026-01-01T00:00:00Z",
        "rule_version": "1",
        "students": [{"学生编号": "S1", "模拟班级编号": "C1"}],
        "objectives": [{"指标编号": "I1", "主题编号": "T1", "观察指标": "目标"}],
        "items": [{"材料编号": "M1", "指标编号": "I1"}],
        "nodes": [],
        "raw_responses": [
            {
                "记录编号": "R1",
                "学生编号": "S1",
                "材料编号": "M1",
                "作答事件编号": "E1",
                "_source_line": 2,
            }
        ],
        "responses": [
            {
                "记录编号": "R1",
                "学生编号": "S1",
                "材料编号": "M1",
                "作答事件编号": "E1",
                "_source_line": 2,
            }
        ],
        "metrics": [],
        "quality": {},
    }
    raw = json.dumps(old, ensure_ascii=False, indent=2)
    run_dir = data_dir / old["run_id"]
    run_dir.mkdir()
    snapshot_path = run_dir / "analysis.json"
    snapshot_path.write_text(raw, encoding="utf-8")
    raw = snapshot_path.read_bytes().decode("utf-8")
    review = {
        "S1:I1": [
            {
                "status": "accepted",
                "version": 1,
                "updated_at": "t1",
                "evidence_record_ids": [],
            }
        ]
    }
    (run_dir / "reviews.json").write_text(
        json.dumps(review, ensure_ascii=False), encoding="utf-8"
    )
    (data_dir / "current.txt").write_text(old["run_id"], encoding="utf-8")
    original_hash = hashlib.sha256(snapshot_path.read_bytes()).hexdigest()
    backup = create_verified_backup(data_dir, tmp_path / "backup")
    assert backup["file_count"] == 3

    store = ready_store(tmp_path / "database")
    first = migrate_json_to_sqlite(data_dir, store.uow_factory)
    second = migrate_json_to_sqlite(data_dir, store.uow_factory)
    assert first["runs"] == 1 and first["reviews"] == 1
    assert second["new_reviews_inserted"] == 0
    assert store.run_repository.current()["observations"] == []
    with store.database.session() as session:
        from app.infrastructure.database.models import AnalysisRunRow

        stored = session.get(AnalysisRunRow, old["run_id"]).snapshot_json
        assert stored == raw
        assert "observations" not in json.loads(stored)
    assert hashlib.sha256(snapshot_path.read_bytes()).hexdigest() == original_hash
