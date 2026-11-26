"""TASK 02 班级范围：缓存键隔离、证据包过滤与请求校验。"""

from app.application.use_cases.ai_analysis import scope_key
from app.services.ai_analysis.evidence_pack_service import build_task_packets
from test_server import client_for


def _packet_run():
    return {
        "run_id": "run-class-scope",
        "objectives": [
            {"指标编号": "I1", "观察指标": "代数式"},
            {"指标编号": "I2", "观察指标": "方程"},
        ],
        "students": [
            {"学生编号": "D1", "模拟班级编号": "C1"},
            {"学生编号": "D2", "模拟班级编号": "C1"},
            {"学生编号": "D3", "模拟班级编号": "C2"},
        ],
        "nodes": [{"节点编号": "N01", "可用题目编号": "Q1,Q2"}],
        "items": [
            {"材料编号": "Q1", "指标编号": "I1", "满分": "2"},
            {"材料编号": "Q2", "指标编号": "I2", "满分": "2"},
        ],
        "raw_responses": [
            {
                "记录编号": "R1",
                "学生编号": "D1",
                "材料编号": "Q1",
                "节点编号": "N01",
                "得分": "1",
                "满分": "2",
                "评分状态": "已评分",
                "_source_line": 2,
            },
            {
                "记录编号": "R2",
                "学生编号": "D2",
                "材料编号": "Q1",
                "节点编号": "N01",
                "得分": "2",
                "满分": "2",
                "评分状态": "已评分",
                "_source_line": 3,
            },
            {
                "记录编号": "R3",
                "学生编号": "D3",
                "材料编号": "Q2",
                "节点编号": "N01",
                "得分": "0",
                "满分": "2",
                "评分状态": "已评分",
                "_source_line": 4,
            },
        ],
        "metrics": [
            {
                "key": "C1:N01:class_ratio:I1",
                "kind": "class_ratio",
                "class_id": "C1",
                "node_id": "N01",
                "indicator_id": "I1",
                "ratio": 0.75,
            },
            {
                "key": "C2:N01:class_ratio:I2",
                "kind": "class_ratio",
                "class_id": "C2",
                "node_id": "N01",
                "indicator_id": "I2",
                "ratio": 0.0,
            },
        ],
    }


def test_task02_scope_key_only_adds_class_when_requested():
    assert scope_key("task02", "N01", None, None) == "node:N01"
    assert scope_key("task02", "N01", None, None, "C1") == "node:N01|class:C1"
    assert scope_key("task03", "N01", "D1", "I1", "C1") == "node:N01|student:D1|indicator:I1"


def test_class_scoped_packets_only_include_that_class():
    packets = build_task_packets(_packet_run(), "task02", "N01", class_id="C1")

    evidence = [unit for packet in packets for unit in packet["evidence_units"]]
    assert len(evidence) == 2
    assert {unit["student"] for unit in evidence} == {"学生1", "学生2"}


def test_class_scoped_packets_drop_other_class_metrics():
    packets = build_task_packets(_packet_run(), "task02", "N01", class_id="C1")

    class_labels = {
        fact.get("class")
        for packet in packets
        for fact in packet["facts"]
        if "ratio" in fact
    }
    assert class_labels == {"班级1"}


def test_task02_preview_scope_key_separates_class_and_run_wide(tmp_path):
    client = client_for(tmp_path)

    wide = client.get("/api/ai-analysis", params={"task": "task02", "node_id": "N01"})
    scoped = client.get(
        "/api/ai-analysis", params={"task": "task02", "node_id": "N01", "class": "C1"}
    )
    assert wide.status_code == 200, wide.text
    assert scoped.status_code == 200, scoped.text
    assert wide.json()["scope_key"] == "node:N01"
    assert scoped.json()["scope_key"] == "node:N01|class:C1"
    assert scoped.json()["scope"]["class_scope"] == "指定班级"
    assert scoped.json()["source_fingerprint"] != wide.json()["source_fingerprint"]

    unknown = client.get(
        "/api/ai-analysis", params={"task": "task02", "node_id": "N01", "class": "C9"}
    )
    assert unknown.status_code == 400
    client.close()


def test_class_id_is_rejected_outside_task02(tmp_path):
    client = client_for(tmp_path)

    response = client.post(
        "/api/ai-analysis",
        json={
            "task": "task03",
            "action": "generate",
            "node_id": "N01",
            "class_id": "C1",
            "student_id": "D01",
            "indicator_id": "T01I1",
            "request_id": "class-scope-reject",
            "transmission_confirmed": True,
        },
    )

    assert response.status_code == 422
    client.close()
