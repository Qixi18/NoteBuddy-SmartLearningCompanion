import hashlib
import io
import json
import sqlite3
import sys
import zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from app.application.use_cases.save_review import SaveReview
from app.config import Settings, resolve_database_url, resolve_path
from app.domain.student.models import Student
from app.infrastructure.database.backup import backup_database, restore_database
from app.infrastructure.database.mappers import (
    assessment_item_from_row,
    material_from_row,
    objective_from_row,
    response_from_row,
    review_from_row,
    student_from_row,
    student_payload,
)
from app.infrastructure.database.models import (
    ItemRow,
    ObjectiveRow,
    ResponseRow,
    ReviewRow,
    StudentRow,
)
from app.infrastructure.database.unit_of_work import SqlAlchemyUnitOfWork
from app.infrastructure.files.local_file_storage import LocalFileStorage
from app.infrastructure.llm.deepseek_client import DeepSeekAdapter
from app.infrastructure.migration.json_to_sqlite import (
    create_verified_backup,
    discover,
)
from app.repositories.store import Store
from app.services.analysis import analyze
from app.services.task03.recommendation_service import deepseek_draft
from test_core import _task03_run_without_unrelated_invalid_record, sample_tables


def test_sqlalchemy_domain_mappers_preserve_fields_and_source_line():
    student = student_from_row(
        StudentRow(run_id="run", student_id="s1", class_id="c1", data_json="{}")
    )
    assert student == Student(student_id="s1", class_id="c1")
    assert student_payload(student) == {"学生编号": "s1", "模拟班级编号": "c1"}

    objective = objective_from_row(
        ObjectiveRow(
            run_id="run",
            indicator_id="i1",
            topic_id="t1",
            title="概念理解",
            data_json=json.dumps({"说明": "描述", "source_refs": ["课标#1"]}),
        )
    )
    assert objective.description == "描述"
    assert objective.source_refs == ("课标#1",)

    item = ItemRow(
        run_id="run",
        material_id="m1",
        item_type="题目",
        objective_ids_json='["i1"]',
        data_json=json.dumps(
            {"满分": 5, "题目内容": "题干", "材料内容": "材料", "来源": ["试卷#2"]}
        ),
    )
    assert assessment_item_from_row(item).max_score == 5
    material = material_from_row(item)
    assert material.content == "题干"
    assert material.objective_ids == ("i1",)

    response = response_from_row(
        ResponseRow(
            run_id="run",
            record_id="r1",
            event_key="event-1",
            is_selected=True,
            student_id="s1",
            material_id="m1",
            node_id="n1",
            source_line=23,
            data_json=json.dumps(
                {
                    "记录编号": "r1",
                    "作答事件编号": "event-1",
                    "学生编号": "s1",
                    "材料编号": "m1",
                    "节点编号": "n1",
                    "修订版本": 2,
                    "评分状态": "已评分",
                    "得分": 4,
                    "满分": 5,
                    "解答过程": "过程",
                }
            ),
        )
    )
    assert (response.record_id, response.revision_no, response.source_line) == (
        "r1",
        2,
        23,
    )

    review = review_from_row(
        ReviewRow(
            run_id="run",
            student_id="s1",
            indicator_id="i1",
            version=1,
            status="accepted",
            updated_at="now",
            payload_json=json.dumps(
                {"recommendation": "继续练习", "evidence_record_ids": ["r1"]}
            ),
        )
    )
    assert review.evidence_record_ids == ("r1",)


def test_data_directory_does_not_move_default_database(tmp_path):
    settings = Settings(project_root=tmp_path, data_dir=tmp_path / "legacy-data")
    assert (
        settings.database_url
        == f"sqlite:///{(tmp_path / 'data' / 'smart_learning.db').as_posix()}"
    )
    assert resolve_path("input", base=tmp_path) == (tmp_path / "input").resolve()
    assert resolve_database_url("sqlite:///custom.sqlite", base=tmp_path) == (
        f"sqlite:///{(tmp_path / 'custom.sqlite').as_posix()}"
    )


def test_configured_model_endpoint_uses_custom_url_and_key(monkeypatch):
    monkeypatch.setenv("MODEL_PROVIDER", "example")
    monkeypatch.setenv("MODEL_API_URL", "https://example.com/v1/chat/completions")
    monkeypatch.setenv("MODEL_API_KEY", "test-only-key")
    monkeypatch.setenv("MODEL_NAME", "example-model")
    config = Settings()
    assert config.model_provider == "example"
    assert config.model_name == "example-model"

    class Response:
        def __enter__(self):
            return io.BytesIO(b'{"choices": []}')

        def __exit__(self, *_args):
            return False

    def capture(request, timeout):
        assert request.full_url == config.model_api_url
        assert request.get_header("Authorization") == "Bearer test-only-key"
        assert timeout == 30
        return Response()

    monkeypatch.setattr(
        "app.infrastructure.llm.deepseek_client.urllib.request.urlopen", capture
    )
    assert DeepSeekAdapter(config.model_api_key, api_url=config.model_api_url).complete(
        {}
    ) == {"choices": []}


def test_settings_validate_and_resolve_environment_paths_independently_of_cwd(
    tmp_path, monkeypatch
):
    from app.config import PROJECT_ROOT

    other = tmp_path / "different cwd"
    other.mkdir()
    monkeypatch.chdir(other)
    monkeypatch.setenv("SMART_LEARNING_DATA_DIR", "legacy data")
    monkeypatch.setenv("SMART_LEARNING_RESOURCES_DIR", "course materials")
    config_root = tmp_path / "project root"
    config = Settings(
        project_root=config_root, database_url_override="sqlite:///state/db.sqlite"
    )
    assert config.data_dir == (config_root / "legacy data").resolve()
    assert config.resources_dir == (config_root / "course materials").resolve()
    assert (
        config.database_url
        == f"sqlite:///{(config_root / 'state/db.sqlite').as_posix()}"
    )
    assert PROJECT_ROOT.is_absolute()
    with pytest.raises(ValueError, match="PORT"):
        Settings(port=0)
    with pytest.raises(ValueError, match="SQLite"):
        Settings(database_url_override="postgresql://example/db")
    with pytest.raises(ValueError, match="DEEPSEEK_TIMEOUT"):
        Settings(deepseek_timeout_seconds=0)


def test_local_file_storage_reads_and_hashes_streamed_files(tmp_path):
    import hashlib

    path = tmp_path / "source.csv"
    path.write_bytes(b"row,1\n")
    storage = LocalFileStorage()
    assert storage.read_bytes(path) == b"row,1\n"
    assert storage.sha256(path) == hashlib.sha256(b"row,1\n").hexdigest()


def test_json_source_backup_excludes_database_and_sidecars(tmp_path, monkeypatch):
    source = tmp_path / "data"
    source.mkdir()
    (source / "current.txt").write_text("0123456789abcdef", encoding="utf-8")
    run_dir = source / "0123456789abcdef"
    run_dir.mkdir()
    (run_dir / "analysis.json").write_text('{"run_id":"0123456789abcdef"}')
    database = source / "smart_learning.db"
    backend = Path(__file__).resolve().parents[1]
    config = Config(str(backend / "alembic.ini"))
    config.set_main_option("script_location", str(backend / "alembic"))
    url = f"sqlite:///{database.as_posix()}"
    monkeypatch.setenv("SMART_LEARNING_DATABASE_URL", url)
    config.set_main_option("sqlalchemy.url", url)
    command.upgrade(config, "head")

    database_backup = tmp_path / "sqlite-backup" / "smart_learning.db"
    database_info = backup_database(f"sqlite:///{database.as_posix()}", database_backup)
    assert database_info["integrity_check"] == ["ok"]
    assert database_info["revision"] == "8a1d3c5e7f90"
    assert "analysis_runs" in database_info["tables"]

    wal = Path(f"{database}-wal")
    shm = Path(f"{database}-shm")
    wal.write_bytes(b"fake wal sidecar")
    shm.write_bytes(b"fake shm sidecar")
    source_backup = tmp_path / "json-source-backup"
    report = create_verified_backup(source, source_backup, excluded_paths=(database,))

    assert report["excluded_files"] == [
        "smart_learning.db",
        "smart_learning.db-shm",
        "smart_learning.db-wal",
    ]
    assert set(report["files"]) == {
        "current.txt",
        "0123456789abcdef/analysis.json",
    }
    assert report["file_count"] == 2
    assert not (source_backup / database.name).exists()
    assert not Path(f"{source_backup / database.name}-wal").exists()
    assert not Path(f"{source_backup / database.name}-shm").exists()
    assert (source_backup / "0123456789abcdef" / "analysis.json").is_file()


def test_deepseek_application_port_accepts_only_validated_structured_output():
    class FakeLLM:
        def complete(self, body):
            assert body["response_format"] == {"type": "json_object"}
            return {
                "choices": [
                    {
                        "finish_reason": "stop",
                        "message": {
                            "content": json.dumps(
                                {
                                    "diagnosis": "结合记录观察",
                                    "recommendation": "先分步练习",
                                    "adjustment_condition": "再次观察",
                                    "evidence_record_ids": ["证据1"],
                                }
                            )
                        },
                    }
                ]
            }

    result = deepseek_draft(
        _task03_run_without_unrelated_invalid_record(),
        "D01",
        "T01I1",
        api_key="test-only",
        client=FakeLLM(),
    )
    assert result["source"] == "deepseek"
    assert result["evidence_record_ids"] == ["R2"]


def test_save_review_use_case_uses_ports_and_rolls_back_validation_failure():
    run = analyze(sample_tables(), {})

    class FakeUow:
        def __init__(self):
            self.committed = False
            self.rolled_back = False
            self.runs = type("Runs", (), {"load": lambda _self, _run_id: run})()
            self.reviews = type(
                "Reviews",
                (),
                {
                    "list_domain": lambda *_args: [],
                    "append": lambda _self, _run_id, _key, payload: {
                        **payload,
                        "version": 1,
                    },
                },
            )()

        def __enter__(self):
            return self

        def __exit__(self, error_type, *_args):
            self.committed = error_type is None
            self.rolled_back = error_type is not None

    good = FakeUow()
    result = SaveReview(lambda: good).execute(
        run["run_id"],
        "D01",
        "T01I1",
        {
            "status": "accepted",
            "recommendation": "继续练习",
            "evidence_record_ids": ["R2"],
        },
    )
    assert result["version"] == 1 and good.committed
    bad = FakeUow()
    with pytest.raises(ValueError, match="无效记录"):
        SaveReview(lambda: bad).execute(
            run["run_id"],
            "D01",
            "T01I1",
            {
                "status": "accepted",
                "recommendation": "继续练习",
                "evidence_record_ids": ["outside"],
            },
        )
    assert bad.rolled_back and not bad.committed


def test_legacy_review_service_is_callback_adapter_without_concrete_dependencies():
    import ast

    from app.services.task03 import review_service

    calls = []

    def save_review(run_id, student_id, indicator_id, payload):
        result = {"run_id": run_id, **payload}
        calls.append((run_id, student_id, indicator_id, payload))
        return result

    payload = {"status": "accepted"}
    result = review_service.ReviewService(save_review).save(
        "run", "student", "indicator", payload
    )
    assert result == {"run_id": "run", **payload}
    assert calls == [("run", "student", "indicator", payload)]

    tree = ast.parse(Path(review_service.__file__).read_text(encoding="utf-8"))
    imported_modules = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            imported_modules.add(node.module or "")
        elif isinstance(node, ast.Import):
            imported_modules.update(alias.name for alias in node.names)
    assert not any(
        module.startswith(("app.application", "app.infrastructure", "app.repositories"))
        for module in imported_modules
    )


def test_alembic_empty_upgrade_repeat_and_consistent_restore(tmp_path, monkeypatch):
    database = tmp_path / "fresh.sqlite"
    backup = tmp_path / "backup.sqlite"
    restored = tmp_path / "restored.sqlite"
    backend = __import__("pathlib").Path(__file__).resolve().parents[1]
    config = Config(str(backend / "alembic.ini"))
    config.set_main_option("script_location", str(backend / "alembic"))
    url = f"sqlite:///{database.as_posix()}"
    monkeypatch.setenv("SMART_LEARNING_DATABASE_URL", url)
    config.set_main_option("sqlalchemy.url", url)
    command.upgrade(config, "head")
    command.upgrade(config, "head")
    store = Store(tmp_path, database_url=url)
    first_run = analyze(sample_tables(), {})
    first_run["run_id"] = "1111111111111111"
    second_run = json.loads(json.dumps(first_run))
    second_run["run_id"] = "2222222222222222"
    with store.uow_factory() as uow:
        uow.runs.save(first_run)
        uow.runs.save(second_run)
        for run in (first_run, second_run):
            uow.reviews.append(
                run["run_id"],
                "D01:T01I1",
                {
                    "status": "accepted",
                    "recommendation": "继续",
                    "evidence_record_ids": ["R2"],
                },
            )
            uow.reviews.append(
                run["run_id"],
                "D01:T01I1",
                {
                    "status": "edited",
                    "recommendation": "调整后继续",
                    "evidence_record_ids": ["R2"],
                },
            )
        snapshots = {
            run["run_id"]: uow.runs.load_snapshot(run["run_id"])
            for run in (first_run, second_run)
        }
        snapshot_hashes = {
            run_id: hashlib.sha256(text.encode("utf-8")).hexdigest()
            for run_id, text in snapshots.items()
        }
    assert store.reviews(first_run["run_id"])["D01:T01I1"][0]["node_id"] is None
    before = store.run_repository.current()
    backup_info = backup_database(url, backup)
    restore_info = restore_database(backup, restored)
    assert backup_info["revision"] == restore_info["revision"]
    assert restore_info["revision"] == "8a1d3c5e7f90"
    assert restore_info["integrity_check"] == ["ok"]
    assert restore_info["foreign_key_violations"] == 0
    assert backup_info["tables"] == restore_info["tables"]
    assert backup_info["sha256"] == restore_info["sha256"]
    assert restore_info["tables"]["analysis_runs"] == 2
    assert restore_info["tables"]["teacher_reviews"] == 4
    assert restore_info["tables"]["students"] == 2 * len(first_run["students"])
    restored_store = Store(tmp_path, database_url=f"sqlite:///{restored.as_posix()}")
    assert restored_store.run_repository.current() == before
    assert before["run_id"] == second_run["run_id"]
    assert restored_store.run_repository.list_run_ids() == [
        first_run["run_id"],
        second_run["run_id"],
    ]
    for run in (first_run, second_run):
        assert restored_store.student_repository.get_by_id(run["run_id"], "D01")
        assert (
            restored_store.run_repository.load_snapshot(run["run_id"])
            == snapshots[run["run_id"]]
        )
        assert (
            hashlib.sha256(
                restored_store.run_repository.load_snapshot(run["run_id"]).encode(
                    "utf-8"
                )
            ).hexdigest()
            == snapshot_hashes[run["run_id"]]
        )
        assert [
            row["version"] for row in restored_store.reviews(run["run_id"])["D01:T01I1"]
        ] == [1, 2]
    restored_export = restored_store.use_cases.export_package.execute(
        ["D01", "D02", "D03"]
    )
    with zipfile.ZipFile(io.BytesIO(restored_export)) as archive:
        manifest = json.loads(archive.read("manifest.json"))
        assert manifest["run_id"] == second_run["run_id"]
        assert archive.testzip() is None
    with pytest.raises(FileExistsError):
        restore_database(backup, restored)


def test_backup_restore_cli_wires_database_and_destination_paths(
    tmp_path, monkeypatch, capsys
):
    from app.cli import main

    database = tmp_path / "source.sqlite"
    backup = tmp_path / "backup.sqlite"
    restored = tmp_path / "restored.sqlite"
    backend = Path(__file__).resolve().parents[1]
    config = Config(str(backend / "alembic.ini"))
    config.set_main_option("script_location", str(backend / "alembic"))
    url = f"sqlite:///{database.as_posix()}"
    monkeypatch.setenv("SMART_LEARNING_DATABASE_URL", url)
    config.set_main_option("sqlalchemy.url", url)
    command.upgrade(config, "head")

    monkeypatch.setattr(
        sys,
        "argv",
        ["app.cli", "db-backup", "--backup-dir", str(backup)],
    )
    main()
    backup_result = json.loads(capsys.readouterr().out)
    assert Path(backup_result["path"]) == backup

    monkeypatch.setattr(
        sys,
        "argv",
        ["app.cli", "db-restore", str(backup), "--restore-to", str(restored)],
    )
    main()
    restore_result = json.loads(capsys.readouterr().out)
    assert Path(restore_result["path"]) == restored
    assert restore_result["revision"] == backup_result["revision"]
    assert restored.is_file()


def test_backup_rejects_non_application_sqlite(tmp_path):
    unknown = tmp_path / "unknown.sqlite"
    with sqlite3.connect(unknown) as connection:
        connection.execute("CREATE TABLE unrelated (value TEXT)")
    with pytest.raises(ValueError, match="受支持的应用数据库 revision"):
        backup_database(f"sqlite:///{unknown.as_posix()}", tmp_path / "copy.sqlite")


def test_migration_rejects_symlinked_run_files(tmp_path):
    source = tmp_path / "source"
    source.mkdir()
    run_id = "0123456789abcdef"
    outside = tmp_path / "outside.json"
    outside.write_text(json.dumps(_minimal_snapshot(run_id)), encoding="utf-8")
    (source / "current.txt").write_text(run_id, encoding="utf-8")
    run_dir = source / run_id
    run_dir.mkdir()
    try:
        (run_dir / "analysis.json").symlink_to(outside)
    except (OSError, NotImplementedError):
        pytest.skip("当前 Windows 环境不允许创建符号链接")
    with pytest.raises(ValueError, match="不允许符号链接"):
        discover(source)


def test_teacher_review_rejects_draft_only_status():
    from app.domain.common.exceptions import InvalidReview
    from app.domain.teaching.models import TeacherReview

    with pytest.raises(InvalidReview):
        TeacherReview("student", "indicator", "needs_review", 1)


def test_review_service_appends_across_independent_engines(tmp_path):
    # The database write lock, not a process-local mutex, must serialize writers.
    database_url = f"sqlite:///{(tmp_path / 'shared.sqlite').as_posix()}"
    seed = Store(tmp_path, database_url=database_url)
    seed.database.create_schema_for_tests()
    run = analyze(sample_tables(), {})
    with seed.uow_factory() as uow:
        uow.runs.save(run)
    payload = {
        "status": "accepted",
        "recommendation": "继续练习",
        "evidence_record_ids": ["R2"],
    }

    def append(_):
        independent = Store(tmp_path, database_url=database_url)
        try:
            return independent.save_review(run["run_id"], "D01", "T01I1", payload)[
                "version"
            ]
        finally:
            independent.database.dispose()

    with ThreadPoolExecutor(max_workers=4) as workers:
        versions = list(workers.map(append, range(8)))
    assert sorted(versions) == list(range(1, 9))
    history = seed.reviews(run["run_id"])["D01:T01I1"]
    assert [item["version"] for item in history] == list(range(1, 9))


def test_unit_of_work_binds_one_session_and_closes_on_entry_failure(tmp_path):
    store = Store(tmp_path)
    store.database.create_schema_for_tests()
    with store.uow_factory(immediate=False) as uow:
        bound = [uow.runs, uow.reviews, uow.students, uow.subjects, uow.responses]
        assert all(repository._bound_session is uow._session for repository in bound)
        shared_session = uow._session
        assert not hasattr(uow, "session")
    assert shared_session.in_transaction() is False
    run = analyze(sample_tables(), {})
    with pytest.raises(RuntimeError, match="inside a UnitOfWork"):
        store.run_repository.save(run)
    with store.uow_factory() as uow:
        uow.runs.save(run)
    with pytest.raises(RuntimeError, match="rollback check"):
        with store.uow_factory() as uow:
            uow.students.save(run["run_id"], Student("D99", "C99"))
            raise RuntimeError("rollback check")
    assert store.student_repository.get_by_id(run["run_id"], "D99") is None

    class FailingConnectionSession:
        bind = type(
            "Bind", (), {"dialect": type("Dialect", (), {"name": "sqlite"})()}
        )()

        def connection(self):
            raise RuntimeError("connection failure")

        def rollback(self):
            self.rolled_back = True

        def close(self):
            self.closed = True

    failed_session = FailingConnectionSession()
    factory = type("Factory", (), {"__call__": lambda _self: failed_session})()
    uow = SqlAlchemyUnitOfWork(factory)
    with pytest.raises(RuntimeError, match="connection failure"):
        uow.__enter__()
    assert failed_session.rolled_back and failed_session.closed
    assert uow._session is None


def test_migration_cli_refuses_existing_db_before_backup_or_write(
    tmp_path, monkeypatch
):
    from app.cli import main

    source = tmp_path / "legacy"
    run_id = "0123456789abcdef"
    run_dir = source / run_id
    run_dir.mkdir(parents=True)
    (source / "current.txt").write_text(run_id, encoding="utf-8")
    (run_dir / "analysis.json").write_text(
        json.dumps(_minimal_snapshot(run_id)), encoding="utf-8"
    )
    target = tmp_path / "existing.sqlite"
    with sqlite3.connect(target) as connection:
        connection.execute("CREATE TABLE keep_me (value TEXT)")
        connection.execute("INSERT INTO keep_me VALUES ('preserve')")
    before = target.read_bytes()
    backup_root = tmp_path / "backup"
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "app.cli",
            "migrate-json-to-sqlite",
            "--data-dir",
            str(source),
            "--database-url",
            f"sqlite:///{target.as_posix()}",
            "--backup-dir",
            str(backup_root),
        ],
    )
    with pytest.raises(ValueError, match="表结构不兼容"):
        main()
    assert target.read_bytes() == before
    reports = list(backup_root.glob("*/migration-report.json"))
    assert len(reports) == 1
    report = json.loads(reports[0].read_text(encoding="utf-8"))
    assert report["status"] == "failed"
    assert report["database_preflight"]["tables"] == ["keep_me"]
    assert not (reports[0].parent / "source").exists()


def _upgrade_migration_test_database(path, monkeypatch):
    backend = __import__("pathlib").Path(__file__).resolve().parents[1]
    url = f"sqlite:///{path.as_posix()}"
    config = Config(str(backend / "alembic.ini"))
    config.set_main_option("script_location", str(backend / "alembic"))
    config.set_main_option("sqlalchemy.url", url)
    monkeypatch.setenv("SMART_LEARNING_DATABASE_URL", url)
    command.upgrade(config, "head")
    return url


def _minimal_snapshot(run_id, **extra):
    return {
        "run_id": run_id,
        "students": [],
        "objectives": [],
        "items": [],
        "nodes": [],
        "responses": [],
        **extra,
    }


def _write_migration_source(source, snapshot, reviews=None):
    run_id = snapshot["run_id"]
    run_dir = source / run_id
    run_dir.mkdir(parents=True)
    (run_dir / "analysis.json").write_text(json.dumps(snapshot), encoding="utf-8")
    if reviews is not None:
        (run_dir / "reviews.json").write_text(json.dumps(reviews), encoding="utf-8")
    (source / "current.txt").write_text(run_id, encoding="utf-8")


@pytest.mark.parametrize(
    "missing_fields",
    [
        ("students",),
        ("objectives",),
        ("items",),
        ("nodes",),
        ("responses",),
        ("students", "responses", "items"),
    ],
)
def test_migration_discovery_requires_core_snapshot_fields(tmp_path, missing_fields):
    run_id = "0123456789abcdef"
    snapshot = _minimal_snapshot(run_id)
    for field in missing_fields:
        snapshot.pop(field)
    source = tmp_path / "legacy"
    _write_migration_source(source, snapshot)
    with pytest.raises(ValueError, match="快照缺少必需字段") as error:
        discover(source)
    for field in missing_fields:
        assert field in str(error.value)


def test_missing_core_fields_write_durable_preflight_report_without_database_mutation(
    tmp_path, monkeypatch
):
    from app.cli import main

    run_id = "0123456789abcdef"
    snapshot = _minimal_snapshot(run_id)
    del snapshot["students"]
    source = tmp_path / "legacy"
    _write_migration_source(source, snapshot)
    target = tmp_path / "existing.sqlite"
    with sqlite3.connect(target) as connection:
        connection.execute("CREATE TABLE keep_me (value TEXT)")
        connection.execute("INSERT INTO keep_me VALUES ('preserve')")
    before = target.read_bytes()
    backup_root = tmp_path / "backups"
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "app.cli",
            "migrate-json-to-sqlite",
            "--data-dir",
            str(source),
            "--database-url",
            f"sqlite:///{target.as_posix()}",
            "--backup-dir",
            str(backup_root),
        ],
    )
    with pytest.raises(ValueError, match="快照缺少必需字段.*students"):
        main()
    assert target.read_bytes() == before
    report_path = next(backup_root.glob("*/migration-report.json"))
    report = json.loads(report_path.read_text(encoding="utf-8"))
    assert report["status"] == "failed"
    assert report["last_phase"] == "preflight"
    assert "students" in report["error_message"]
    assert not (report_path.parent / "source").exists()


def _seed_migration_database(path, monkeypatch, snapshot, *, current=True, review=None):
    url = _upgrade_migration_test_database(path, monkeypatch)
    store = Store(path.parent, database_url=url)
    with store.uow_factory() as uow:
        uow.runs.save_snapshot(json.dumps(snapshot), set_current=current)
        if review is not None:
            run_id, student_id, indicator_id, version, payload = review
            uow._session.add(
                ReviewRow(
                    run_id=run_id,
                    student_id=student_id,
                    indicator_id=indicator_id,
                    version=version,
                    status=payload["status"],
                    updated_at=payload.get("updated_at", "now"),
                    payload_json=json.dumps(payload),
                )
            )
    store.database.dispose()
    return url


def _invoke_migration_cli(monkeypatch, source, target, backup_root, *flags):
    from app.cli import main

    monkeypatch.setattr(
        sys,
        "argv",
        [
            "app.cli",
            "migrate-json-to-sqlite",
            "--data-dir",
            str(source),
            "--database-url",
            f"sqlite:///{target.as_posix()}",
            "--backup-dir",
            str(backup_root),
            *flags,
        ],
    )
    main()


def test_migration_target_inspection_reports_revision_and_schema_without_mutation(
    tmp_path, monkeypatch
):
    from app.infrastructure.migration.json_to_sqlite import (
        MigrationTargetError,
        inspect_migration_target,
    )

    source_run = "0123456789abcdef"
    source_snapshot = _minimal_snapshot(source_run)
    source = tmp_path / "legacy"
    _write_migration_source(source, source_snapshot)
    runs, current = discover(source)

    malformed = tmp_path / "malformed.sqlite"
    malformed.write_bytes(b"not a sqlite database")
    before = malformed.read_bytes()
    with pytest.raises(MigrationTargetError, match="有效 SQLite") as error:
        inspect_migration_target(malformed, runs, current)
    assert error.value.details["compatible"] is False
    assert malformed.read_bytes() == before

    wrong_schema = tmp_path / "wrong-schema.sqlite"
    with sqlite3.connect(wrong_schema) as connection:
        connection.execute("CREATE TABLE keep_me (id INTEGER PRIMARY KEY)")
    before = wrong_schema.read_bytes()
    with pytest.raises(MigrationTargetError, match="表结构不兼容") as error:
        inspect_migration_target(wrong_schema, runs, current)
    assert error.value.details["table_counts"] == {"keep_me": 0}
    assert wrong_schema.read_bytes() == before

    wrong_revision = tmp_path / "wrong-revision.sqlite"
    _upgrade_migration_test_database(wrong_revision, monkeypatch)
    with sqlite3.connect(wrong_revision) as connection:
        connection.execute("UPDATE alembic_version SET version_num='old-revision'")
    before = wrong_revision.read_bytes()
    with pytest.raises(MigrationTargetError, match="revision 不兼容"):
        inspect_migration_target(wrong_revision, runs, current)
    assert wrong_revision.read_bytes() == before


def test_cli_rejects_nonempty_target_without_opt_in_and_persists_report(
    tmp_path, monkeypatch
):
    incoming_id = "0123456789abcdef"
    source = tmp_path / "legacy"
    _write_migration_source(source, _minimal_snapshot(incoming_id))
    target = tmp_path / "target.sqlite"
    _seed_migration_database(
        target, monkeypatch, _minimal_snapshot("fedcba9876543210"), current=False
    )
    before = target.read_bytes()
    backup_root = tmp_path / "backups"
    with pytest.raises(ValueError, match="allow-nonempty-database"):
        _invoke_migration_cli(
            monkeypatch,
            source,
            target,
            backup_root,
            "--confirm-existing-database",
        )
    assert target.read_bytes() == before
    report_path = next(backup_root.glob("*/migration-report.json"))
    report = json.loads(report_path.read_text(encoding="utf-8"))
    assert report["status"] == "failed"
    assert report["database_preflight"]["revision"] == "8a1d3c5e7f90"
    assert report["database_preflight"]["table_counts"]["analysis_runs"] == 1
    assert not (report_path.parent / "source").exists()


def test_cli_requires_confirmation_for_existing_compatible_empty_database(
    tmp_path, monkeypatch
):
    run_id = "0123456789abcdef"
    source = tmp_path / "legacy"
    _write_migration_source(source, _minimal_snapshot(run_id))
    target = tmp_path / "target.sqlite"
    _upgrade_migration_test_database(target, monkeypatch)
    before = target.read_bytes()
    backup_root = tmp_path / "backups"
    with pytest.raises(ValueError, match="confirm-existing-database"):
        _invoke_migration_cli(monkeypatch, source, target, backup_root)
    assert target.read_bytes() == before
    report_path = next(backup_root.glob("*/migration-report.json"))
    report = json.loads(report_path.read_text(encoding="utf-8"))
    assert report["status"] == "failed"
    assert report["database_preflight"]["compatible"] is True
    assert report["database_preflight"]["nonempty"] is False
    assert not (report_path.parent / "source").exists()


@pytest.mark.parametrize(
    "conflict_kind", ["run_snapshot", "review_version", "current_pointer"]
)
def test_cli_rejects_incoming_database_conflicts_without_mutation(
    tmp_path, monkeypatch, conflict_kind
):
    run_id = "0123456789abcdef"
    reviews = None
    review_row = None
    source_snapshot = _minimal_snapshot(run_id)
    if conflict_kind == "review_version":
        source_snapshot.update(
            students=[{"学生编号": "s1", "模拟班级编号": "c1"}],
            objectives=[{"指标编号": "i1", "主题编号": "t1"}],
            items=[{"材料编号": "m1", "指标编号": "i1"}],
        )
        incoming_record = {
            "version": 1,
            "status": "accepted",
            "recommendation": "new recommendation",
            "evidence_record_ids": [],
        }
        reviews = {"s1:i1": [incoming_record]}
        review_row = (
            run_id,
            "s1",
            "i1",
            1,
            {
                "version": 1,
                "status": "accepted",
                "recommendation": "old recommendation",
                "evidence_record_ids": [],
                "updated_at": "now",
            },
        )
        target_snapshot = source_snapshot
        target_id = run_id
        current = True
    elif conflict_kind == "run_snapshot":
        source_snapshot["tag"] = "source"
        target_snapshot = _minimal_snapshot(run_id, tag="database")
        target_id = run_id
        current = False
    else:
        target_id = "fedcba9876543210"
        target_snapshot = _minimal_snapshot(target_id)
        current = True

    source = tmp_path / "legacy"
    _write_migration_source(source, source_snapshot, reviews)
    target = tmp_path / "target.sqlite"
    _seed_migration_database(
        target,
        monkeypatch,
        target_snapshot,
        current=current,
        review=review_row,
    )
    before_db = target.read_bytes()
    before_source = {
        path.relative_to(source).as_posix(): path.read_bytes()
        for path in source.rglob("*")
        if path.is_file()
    }
    backup_root = tmp_path / "backups"
    with pytest.raises(ValueError, match="冲突"):
        _invoke_migration_cli(
            monkeypatch,
            source,
            target,
            backup_root,
            "--confirm-existing-database",
            "--allow-nonempty-database",
        )
    assert target.read_bytes() == before_db
    after_source = {
        path.relative_to(source).as_posix(): path.read_bytes()
        for path in source.rglob("*")
        if path.is_file()
    }
    assert after_source == before_source
    report_path = next(backup_root.glob("*/migration-report.json"))
    report = json.loads(report_path.read_text(encoding="utf-8"))
    assert report["status"] == "failed"
    assert conflict_kind in {
        entry["kind"] for entry in report["database_preflight"]["conflicts"]
    }
    assert not (report_path.parent / "source").exists()


def test_migration_scan_reports_excluded_entries_and_rejects_incomplete_run(tmp_path):
    source = tmp_path / "legacy"
    run_id = "abcdef0123456789"
    (source / run_id).mkdir(parents=True)
    (source / run_id / "analysis.json").write_text(
        json.dumps(_minimal_snapshot(run_id)), encoding="utf-8"
    )
    (source / "current.txt").write_text(run_id, encoding="utf-8")
    (source / "notes").mkdir()
    _, _, report = discover(source, with_report=True)
    assert report["included_runs"] == 1
    assert report["excluded_entries"] == 2
    (source / "fedcba9876543210").mkdir()
    with pytest.raises(ValueError, match="缺少 analysis.json"):
        discover(source)


def test_migration_preflight_failure_leaves_durable_report_without_writes(
    tmp_path, monkeypatch
):
    from app.cli import main

    source = tmp_path / "legacy"
    run_id = "abcdef0123456789"
    (source / run_id).mkdir(parents=True)
    (source / "current.txt").write_text(run_id, encoding="utf-8")
    target = tmp_path / "target.sqlite"
    backup_root = tmp_path / "backups"
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "app.cli",
            "migrate-json-to-sqlite",
            "--data-dir",
            str(source),
            "--database-url",
            f"sqlite:///{target.as_posix()}",
            "--backup-dir",
            str(backup_root),
        ],
    )
    with pytest.raises(ValueError, match="缺少 analysis.json"):
        main()
    reports = list(backup_root.glob("*/migration-report.json"))
    assert len(reports) == 1
    report = json.loads(reports[0].read_text(encoding="utf-8"))
    assert report["status"] == "failed"
    assert report["last_phase"] == "preflight"
    assert "缺少 analysis.json" in report["error_message"]
    assert not target.exists()
    assert not (reports[0].parent / "source").exists()


def test_migration_report_survives_failure_and_retry_completes_atomically(
    tmp_path, monkeypatch
):
    from app.cli import main

    source = tmp_path / "legacy"
    run_id = "0123456789abcdef"
    run_dir = source / run_id
    run_dir.mkdir(parents=True)
    snapshot = {
        "run_id": run_id,
        "students": [],
        "objectives": [],
        "items": [],
        "nodes": [],
        "responses": [],
    }
    snapshot_path = run_dir / "analysis.json"
    snapshot_path.write_text(json.dumps(snapshot), encoding="utf-8")
    (source / "current.txt").write_text(run_id, encoding="utf-8")
    database_dir = tmp_path / "database"
    target = database_dir / "smart.sqlite"
    backups = tmp_path / "backups"
    args = [
        "app.cli",
        "migrate-json-to-sqlite",
        "--data-dir",
        str(source),
        "--database-url",
        f"sqlite:///{target.as_posix()}",
        "--backup-dir",
        str(backups),
    ]

    def fail_after_schema(*_args, **_kwargs):
        raise RuntimeError("simulated interruption")

    with monkeypatch.context() as scoped:
        scoped.setattr(
            "app.infrastructure.migration.json_to_sqlite.migrate_json_to_sqlite",
            fail_after_schema,
        )
        monkeypatch.setattr(sys, "argv", args)
        with pytest.raises(RuntimeError, match="simulated interruption"):
            main()
    reports = list(backups.glob("*/migration-report.json"))
    assert len(reports) == 1
    interrupted = json.loads(reports[0].read_text(encoding="utf-8"))
    assert interrupted["status"] == "failed"
    assert interrupted["last_phase"] == "data_migration"
    assert interrupted["source_backup"] is not None

    monkeypatch.setattr(
        sys,
        "argv",
        args + ["--confirm-existing-database", "--allow-nonempty-database"],
    )
    main()
    final_reports = list(backups.glob("*/migration-report.json"))
    assert len(final_reports) == 2
    completed = [
        json.loads(path.read_text(encoding="utf-8"))
        for path in final_reports
        if json.loads(path.read_text(encoding="utf-8"))["status"] == "completed"
    ]
    assert len(completed) == 1
    assert completed[0]["migration"]["current_run_id"] == run_id
    target_store = Store(database_dir, database_url=f"sqlite:///{target.as_posix()}")
    assert target_store.current()["run_id"] == run_id


def test_json_migration_rolls_back_all_runs_on_mid_batch_failure(tmp_path, monkeypatch):
    from app.infrastructure.migration.json_to_sqlite import migrate_json_to_sqlite
    from app.repositories.review_repository import ReviewRepository

    source = tmp_path / "legacy"
    run_id = "0123456789abcdef"
    run_dir = source / run_id
    run_dir.mkdir(parents=True)
    (run_dir / "analysis.json").write_text(
        json.dumps(
            {
                "run_id": run_id,
                "students": [],
                "objectives": [],
                "items": [],
                "nodes": [],
                "responses": [],
            }
        ),
        encoding="utf-8",
    )
    (source / "current.txt").write_text(run_id, encoding="utf-8")
    store = Store(tmp_path / "target")
    store.database.create_schema_for_tests()

    def fail_after_run_insert(*_args, **_kwargs):
        raise RuntimeError("batch failure")

    monkeypatch.setattr(ReviewRepository, "import_history", fail_after_run_insert)
    with pytest.raises(RuntimeError, match="batch failure"):
        migrate_json_to_sqlite(source, store.uow_factory)
    assert store.run_repository.list_run_ids() == []
    with pytest.raises(FileNotFoundError):
        store.run_repository.current()
