import io
import json
import os
import zipfile
from pathlib import Path
from unittest.mock import patch

from app.infrastructure.llm.deepseek_client import DeepSeekClientError
from app.services.analysis import analyze, read_bundle
from app.services.exports import package
from app.services.recommendations import deepseek_draft, draft
from app.repositories.store import Store
from app.services.cases import suggest_cases


def make_store(path: Path) -> Store:
    store = Store(path)
    store.database.create_schema_for_tests()
    return store


def persist_run(store: Store, run: dict) -> None:
    with store.uow_factory() as uow:
        uow.runs.save(run)


def sample_tables():
    return {
        "课程要求": [{"主题编号": "T01", "指标编号": "T01I1", "观察指标": "代数式"}],
        "题目与材料": [
            {"材料编号": "Q001", "主题编号": "T01", "指标编号": "T01I1", "满分": "2"}
        ],
        "模拟学生": [
            {"学生编号": "D01", "模拟班级编号": "C1"},
            {"学生编号": "D02", "模拟班级编号": "C1"},
            {"学生编号": "D03", "模拟班级编号": "C2"},
        ],
        "测验节点": [{"节点编号": "N01", "可用题目编号": "Q001"}],
        "字段说明": [],
        "作答记录": [
            {
                "记录编号": "R1",
                "学生编号": "D01",
                "材料编号": "Q001",
                "主题编号": "T01",
                "节点编号": "N01",
                "作答事件编号": "E1",
                "修订版本": "1",
                "评分状态": "已评分",
                "得分": "0",
                "满分": "2",
                "_source_line": 2,
                "解答过程": "",
                "评分点得分": "",
            },
            {
                "记录编号": "R2",
                "学生编号": "D01",
                "材料编号": "Q001",
                "主题编号": "T01",
                "节点编号": "N01",
                "作答事件编号": "E1",
                "修订版本": "2",
                "评分状态": "已评分",
                "得分": "1",
                "满分": "2",
                "_source_line": 3,
                "解答过程": "第一步",
                "评分点得分": "P1=1",
            },
            {
                "记录编号": "R3",
                "学生编号": "D01",
                "材料编号": "Q001",
                "主题编号": "T01",
                "节点编号": "N01",
                "作答事件编号": "E2",
                "修订版本": "1",
                "评分状态": "待评分",
                "得分": "",
                "满分": "2",
                "_source_line": 4,
            },
            {
                "记录编号": "R4",
                "学生编号": "D01",
                "材料编号": "Q001",
                "主题编号": "T01",
                "节点编号": "N01",
                "作答事件编号": "E3",
                "修订版本": "1",
                "评分状态": "已评分",
                "得分": "3",
                "满分": "2",
                "_source_line": 5,
            },
        ],
    }


def test_version_and_denominator():
    run = analyze(sample_tables(), {})
    assert run["quality"]["raw_rows"] == 4
    assert run["quality"]["events"] == 3
    assert run["quality"]["eligible_scored"] == 1
    assert run["quality"]["finding_counts"]["pending"] == 1
    assert run["quality"]["finding_counts"]["invalid_score"] == 1
    metric = next(m for m in run["metrics"] if m["kind"] == "student")
    assert (metric["score"], metric["maximum"], metric["record_ids"]) == (1, 2, ["R2"])
    observation = next(o for o in run["observations"] if o["student_id"] == "D01")
    assert (
        observation["selected_count"],
        observation["scored_count"],
        observation["pending_count"],
        observation["excluded_count"],
    ) == (3, 1, 1, 2)


def test_event_identity_conflict_is_excluded():
    tables = sample_tables()
    tables["作答记录"][1]["学生编号"] = "D02"
    run = analyze(tables, {})
    assert run["quality"]["finding_counts"]["event_identity_conflict"] == 2
    assert "R1" in run["quality"]["excluded_record_ids"]
    assert "R2" in run["quality"]["excluded_record_ids"]
    assert not any(r["作答事件编号"] == "E1" for r in run["responses"])


def test_csv_multiline_source_line(tmp_path: Path):
    import csv
    from app.services.analysis import TABLES

    for name, headers in TABLES.items():
        with (tmp_path / f"{name}.csv").open("w", encoding="utf-8", newline="") as file:
            writer = csv.DictWriter(
                file, fieldnames=headers + (["解答过程"] if name == "作答记录" else [])
            )
            writer.writeheader()
            if name == "作答记录":
                writer.writerow(
                    {
                        "记录编号": "R1",
                        "作答事件编号": "E1",
                        "解答过程": "第一行\n第二行",
                    }
                )
                writer.writerow({"记录编号": "R2", "作答事件编号": "E2"})
    tables, _ = read_bundle(tmp_path)
    assert [r["_source_line"] for r in tables["作答记录"]] == [3, 4]


def test_csv_requires_fields_consumed_by_statistics(tmp_path: Path):
    import csv
    from app.services.analysis import TABLES, read_bundle

    for name, required in TABLES.items():
        headers = list(required)
        if name == "作答记录":
            headers.remove("得分")
        with (tmp_path / f"{name}.csv").open("w", encoding="utf-8", newline="") as file:
            csv.writer(file).writerow(headers)
    try:
        read_bundle(tmp_path)
    except ValueError as exc:
        assert "作答记录.csv 缺少字段：得分" in str(exc)
    else:
        raise AssertionError("统计直接读取的必需字段缺失时应在导入阶段返回可读错误")


def test_non_sample_bundle_import(tmp_path: Path):
    import csv
    from app.services.analysis import TABLES

    source = tmp_path / "input"
    source.mkdir()
    for name, required in TABLES.items():
        rows = sample_tables().get(name, [])
        headers = list(
            dict.fromkeys(
                required
                + [key for row in rows for key in row if not key.startswith("_")]
            )
        )
        with (source / f"{name}.csv").open("w", encoding="utf-8", newline="") as file:
            writer = csv.DictWriter(file, fieldnames=headers, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(rows)
    store = make_store(tmp_path / "state")
    run = store.import_folder(source)
    assert run["quality"]["raw_rows"] == 4
    assert len(run["students"]) == 3
    assert len(run["objectives"]) == 1
    assert run["quality"]["eligible_scored"] == 1
    assert store.run_repository.current()["run_id"] == run["run_id"]
    repeated = store.import_folder(source)
    assert repeated["run_id"] != run["run_id"]
    assert len(store.run_repository.list_run_ids()) == 2


def test_review_and_export(tmp_path: Path):
    run = analyze(sample_tables(), {})
    store = make_store(tmp_path)
    persist_run(store, run)
    baseline = draft(run, "D01", "T01I1")
    assert baseline["evidence_record_ids"] == ["R2"]
    saved = store.save_review(
        run["run_id"],
        "D01",
        "T01I1",
        {
            "status": "edited",
            "diagnosis": "复核后诊断",
            "recommendation": "先做基础练习",
            "adjustment_condition": "完成后再测",
            "reason": "核对步骤",
            "evidence_record_ids": ["R2"],
        },
    )
    assert saved["version"] == 1
    with zipfile.ZipFile(
        io.BytesIO(package(run, store.reviews(run["run_id"]), ["D01", "D02", "D03"]))
    ) as archive:
        accepted = json.loads(archive.read("recommendations.json"))
        assert accepted[0]["recommendation"] == "先做基础练习"
        assert accepted[0]["evidence_record_ids"] == ["R2"]
        cases = json.loads(archive.read("student_cases.json"))
        assert len(cases) == 3
        assert "student_indicator" in archive.read("metrics.csv").decode("utf-8-sig")


def test_concurrent_review_versions_are_unique(tmp_path: Path):
    from concurrent.futures import ThreadPoolExecutor

    run = analyze(sample_tables(), {})
    store = make_store(tmp_path)
    persist_run(store, run)
    payload = {
        "status": "accepted",
        "diagnosis": "已核对",
        "recommendation": "做练习",
        "evidence_record_ids": ["R2"],
    }
    with ThreadPoolExecutor(max_workers=4) as pool:
        versions = list(
            pool.map(
                lambda _: store.save_review(run["run_id"], "D01", "T01I1", payload)[
                    "version"
                ],
                range(4),
            )
        )
    assert sorted(versions) == [1, 2, 3, 4]


def test_concurrent_run_snapshot_writes_use_independent_temp_files(tmp_path: Path):
    from concurrent.futures import ThreadPoolExecutor

    run = analyze(sample_tables(), {})
    store = make_store(tmp_path)
    repository = store.run_repository

    def persist(_):
        with store.uow_factory() as uow:
            uow.runs.save(run)

    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(persist, range(8)))
    assert repository.current()["run_id"] == run["run_id"]
    assert not list(tmp_path.rglob("*.tmp"))


def test_public_bundle_if_available():
    configured = os.getenv("SMART_LEARNING_TEST_DATA_DIR")
    folder = (
        Path(configured)
        if configured
        else Path(__file__).resolve().parents[4]
        / "【赛题材料】智慧学伴"
        / "赛题数据"
        / "赛题资料包"
        / "4_赛题数据"
        / "模拟学情数据"
    )
    if not folder.is_dir():
        import pytest

        pytest.skip(f"赛事 CSV fixture not available: {folder}")
    tables, files = read_bundle(folder)
    run = analyze(tables, files)
    assert run["quality"]["raw_rows"] == 806
    assert run["quality"]["events"] == 799
    assert run["quality"]["finding_counts"]["multiple_revisions"] == 7
    assert run["quality"]["finding_counts"]["invalid_score"] >= 2
    cases = suggest_cases(run)
    assert len({c["student_id"] for c in cases}) == 3
    assert {c["type"] for c in cases} == {"部分得分", "表现较好", "记录较少"}


def test_deepseek_rejects_fabricated_evidence(monkeypatch):
    run = analyze(sample_tables(), {})
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-only-key")

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *_):
            return None

        def read(self, *_):
            content = {
                "diagnosis": "需要练习",
                "recommendation": "分步提示",
                "adjustment_condition": "再次观察",
                "evidence_record_ids": ["OTHER_STUDENT_RECORD"],
            }
            return json.dumps(
                {
                    "choices": [
                        {
                            "finish_reason": "stop",
                            "message": {"content": json.dumps(content)},
                        }
                    ]
                }
            ).encode()

    with patch(
        "app.infrastructure.llm.deepseek_client.urllib.request.urlopen",
        return_value=FakeResponse(),
    ):
        try:
            deepseek_draft(run, "D01", "T01I1")
        except DeepSeekClientError as exc:
            assert "无效证据" in str(exc)
        else:
            raise AssertionError("伪造证据应被拒绝")


def test_deepseek_accepts_valid_structured_draft(monkeypatch):
    run = analyze(sample_tables(), {})
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-only-key")

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *_):
            return None

        def read(self, *_):
            content = {
                "diagnosis": "需复核第一步",
                "recommendation": "先提示数量关系，再独立作答",
                "adjustment_condition": "完成后检查同类题",
                "evidence_record_ids": ["R2"],
            }
            return json.dumps(
                {
                    "choices": [
                        {
                            "finish_reason": "stop",
                            "message": {"content": json.dumps(content)},
                        }
                    ]
                }
            ).encode()

    with patch(
        "app.infrastructure.llm.deepseek_client.urllib.request.urlopen",
        return_value=FakeResponse(),
    ):
        result = deepseek_draft(run, "D01", "T01I1")
    assert result["source"] == "deepseek"
    assert result["evidence_record_ids"] == ["R2"]
    assert result["recommendation"] == "先提示数量关系，再独立作答"
