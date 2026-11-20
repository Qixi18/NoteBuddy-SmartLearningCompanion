import json

import pytest
from app.services.ai_analysis.evidence_pack_service import build_task_packets
from app.services.ai_analysis.validation_service import validate_packet_output


@pytest.fixture
def run_snapshot():
    return {
        "run_id": "RUN-1",
        "objectives": [
            {
                "主题编号": "T01",
                "指标编号": "I01",
                "观察指标": "能解释等式性质",
                "课标文件页／正文页": "第12页",
            }
        ],
        "students": [
            {"学生编号": "S01", "模拟班级编号": "C01"},
            {"学生编号": "S02", "模拟班级编号": "C01"},
        ],
        "items": [
            {
                "材料编号": "Q01",
                "指标编号": "I01",
                "题干或内容": "解方程 2x=6",
                "评分点": "Q01P1 移项",
                "满分": "2",
            }
        ],
        "nodes": [{"节点编号": "N01", "可用题目编号": "Q01", "已教及测量主题": "T01"}],
        "responses": [
            {
                "记录编号": "R01",
                "学生编号": "S01",
                "材料编号": "Q01",
                "指标编号": "I01",
                "节点编号": "N01",
                "得分": "1",
                "满分": "2",
                "评分状态": "已评分",
                "解答过程": "先两边同时除以2",
                "_source_line": 2,
            },
            {
                "记录编号": "R02",
                "学生编号": "S02",
                "材料编号": "Q01",
                "指标编号": "I01",
                "节点编号": "N01",
                "得分": "2",
                "满分": "2",
                "评分状态": "已评分",
                "解答过程": "x=3",
                "_source_line": 3,
            },
        ],
        "raw_responses": [
            {
                "记录编号": "R01",
                "学生编号": "S01",
                "材料编号": "Q01",
                "指标编号": "I01",
                "节点编号": "N01",
                "得分": "1",
                "满分": "2",
                "评分状态": "已评分",
                "解答过程": "先两边同时除以2",
                "_source_line": 2,
            },
            {
                "记录编号": "R02",
                "学生编号": "S02",
                "材料编号": "Q01",
                "指标编号": "I01",
                "节点编号": "N01",
                "得分": "2",
                "满分": "2",
                "评分状态": "已评分",
                "解答过程": "x=3",
                "_source_line": 3,
            },
            {
                "记录编号": "R03",
                "学生编号": "S02",
                "材料编号": "Q01",
                "指标编号": "I01",
                "节点编号": "N01",
                "得分": "",
                "满分": "2",
                "评分状态": "待评分",
                "解答过程": "有待评分的记录",
                "_source_line": 4,
            },
        ],
        "metrics": [
            {
                "kind": "class_node_indicator",
                "key": "C01:N01:I01",
                "score": 3,
                "maximum": 4,
                "count": 2,
            }
        ],
        "observations": [
            {
                "student_id": "S01",
                "indicator_id": "I01",
                "node_id": "N01",
                "state": "scored",
            },
            {
                "student_id": "S02",
                "indicator_id": "I01",
                "node_id": "N01",
                "state": "scored",
            },
        ],
        "quality": {
            "raw_rows": 3,
            "eligible_scored": 2,
            "record_dispositions": [
                {"record_id": "R01", "source_line": 2, "disposition": "scored"},
                {"record_id": "R02", "source_line": 3, "disposition": "scored"},
                {"record_id": "R03", "source_line": 4, "disposition": "pending"},
            ],
            "findings": [],
        },
        "source_index": [
            {"indicator_id": "I01", "topic_id": "T01", "verification": "pending"}
        ],
    }


def test_task02_packet_covers_node_records_without_leaking_local_ids(run_snapshot):
    packets = build_task_packets(run_snapshot, "task02", node_id="N01")

    assert len(packets) == 1
    packet = packets[0]
    serialized = json.dumps(packet, ensure_ascii=False)
    assert packet["coverage"]["raw_records_total"] == 3
    assert packet["coverage"]["raw_records_included"] == 3
    assert packet["evidence_units"][0]["source_line"] == 2
    assert "S01" not in serialized
    assert "R01" not in serialized
    assert "I01" not in serialized
    assert packet["facts"][0]["fact_id"] == "fact1"
    quality = next(
        fact for fact in packet["facts"] if fact["kind"] == "quality_coverage"
    )
    assert quality["raw_rows"] == 3
    assert quality["eligible_scored"] == 2
    assert quality["dispositions"] == {"scored": 2, "pending": 1}


def test_ai_output_requires_exact_scoped_evidence_excerpt(run_snapshot):
    packet = build_task_packets(run_snapshot, "task02", node_id="N01")[0]
    alias = packet["evidence_units"][0]["evidence_id"]

    validated = validate_packet_output(
        {
            "findings": [
                {
                    "category": "student_work",
                    "claim": "有学生展示了等式变形步骤。",
                    "interpretation": "可进一步观察运算依据。",
                    "support_level": "limited",
                    "limitations": "仅代表当前节点的记录。",
                    "next_step": "检查同类题的迁移表现。",
                    "evidence_refs": [{"ref": alias, "excerpt": "先两边同时除以2"}],
                }
            ]
        },
        packet,
    )

    assert validated["findings"][0]["evidence_refs"][0]["record_id"] == "R01"
    assert validated["findings"][0]["evidence_refs"][0]["source_line"] == 2


def test_ai_output_rejects_an_excerpt_not_present_in_current_scope(run_snapshot):
    packet = build_task_packets(run_snapshot, "task02", node_id="N01")[0]

    with pytest.raises(ValueError, match="excerpt"):
        validate_packet_output(
            {
                "findings": [
                    {
                        "category": "student_work",
                        "claim": "未经证实的结论。",
                        "interpretation": "解释。",
                        "support_level": "supported",
                        "limitations": "限制。",
                        "next_step": "下一步。",
                        "evidence_refs": [
                            {"ref": "evidence1", "excerpt": "这段话没有出现在作答中"}
                        ],
                    }
                ]
            },
            packet,
        )


def test_ai_output_rejects_unverified_fact_excerpt(run_snapshot):
    packet = build_task_packets(run_snapshot, "task01")[0]

    with pytest.raises(ValueError, match="excerpt"):
        validate_packet_output(
            {
                "findings": [
                    {
                        "category": "curriculum",
                        "claim": "课标包含此要求。",
                        "interpretation": "解释。",
                        "support_level": "limited",
                        "limitations": "来源待核验。",
                        "evidence_refs": [
                            {"ref": "fact1", "excerpt": "不存在于当前目标的文字"}
                        ],
                    }
                ]
            },
            packet,
        )


def test_local_identifier_in_raw_text_is_redacted_and_alias_excerpt_validates(
    run_snapshot,
):
    run_snapshot["responses"][0]["解答过程"] = "记录 R01 对应题目 Q01"
    run_snapshot["raw_responses"][0]["解答过程"] = "记录 R01 对应题目 Q01"
    packet = build_task_packets(run_snapshot, "task02", node_id="N01")[0]
    unit = packet["evidence_units"][0]

    assert "R01" not in json.dumps(packet, ensure_ascii=False)
    assert "Q01" not in json.dumps(packet, ensure_ascii=False)
    validated = validate_packet_output(
        {
            "findings": [
                {
                    "category": "student_work",
                    "claim": "作答中出现题目引用。",
                    "interpretation": "应核验该步骤对应材料。",
                    "support_level": "limited",
                    "limitations": "仅限当前节点。",
                    "evidence_refs": [
                        {
                            "ref": unit["evidence_id"],
                            "excerpt": "记录 evidence1 对应题目 题目1",
                        }
                    ],
                }
            ]
        },
        packet,
    )
    assert validated["findings"][0]["evidence_refs"][0]["record_id"] == "R01"


def test_task03_requires_a_single_valid_node(run_snapshot):
    with pytest.raises(ValueError):
        build_task_packets(run_snapshot, "task03")


def test_analysis_service_sends_only_prompt_safe_packet_and_validates_findings(
    run_snapshot,
):
    from app.services.ai_analysis.analysis_service import analyze_packets

    packet = build_task_packets(run_snapshot, "task02", node_id="N01")[0]
    response = {
        "choices": [
            {
                "finish_reason": "stop",
                "message": {
                    "content": json.dumps(
                        {
                            "findings": [
                                {
                                    "category": "student_work",
                                    "claim": "当前节点记录展示了除法步骤。",
                                    "interpretation": "可查看该思路在其他题目中的表现。",
                                    "support_level": "supported",
                                    "limitations": "样本仅来自当前测验节点。",
                                    "next_step": "比较不同题目的解题过程。",
                                    "evidence_refs": [
                                        {
                                            "ref": "evidence1",
                                            "excerpt": "先两边同时除以2",
                                        }
                                    ],
                                }
                            ]
                        },
                        ensure_ascii=False,
                    )
                },
            }
        ]
    }

    class Client:
        def complete(self, body):
            self.body = body
            return response

    client = Client()
    result = analyze_packets([packet], client, "mock-model")

    sent = client.body["messages"][1]["content"]
    assert "R01" not in sent and "S01" not in sent
    assert result["status"] == "complete"
    assert result["findings"][0]["evidence_refs"][0]["record_id"] == "R01"


def test_analysis_service_marks_invalid_model_packet_failed(run_snapshot):
    from app.services.ai_analysis.analysis_service import analyze_packets

    packet = build_task_packets(run_snapshot, "task02", node_id="N01")[0]

    class Client:
        def complete(self, body):
            return {"choices": []}

    result = analyze_packets([packet], Client(), "mock-model")

    assert result["status"] == "failed"
    assert result["coverage"]["failed_packet_ids"] == [packet["packet_id"]]


def test_analysis_service_counts_raw_coverage_once_across_chunks(run_snapshot):
    from app.services.ai_analysis.analysis_service import analyze_packets

    packets = build_task_packets(run_snapshot, "task02", node_id="N01", max_chars=1)

    class Client:
        def complete(self, body):
            return {
                "choices": [
                    {
                        "finish_reason": "stop",
                        "message": {"content": '{"findings": []}'},
                    }
                ]
            }

    result = analyze_packets(packets, Client(), "mock-model")

    assert len(packets) == 3
    assert result["coverage"]["raw_records_total"] == 3
    assert result["coverage"]["raw_records_included"] == 3


def test_analysis_service_names_findings_by_packet_to_avoid_collisions(run_snapshot):
    from app.services.ai_analysis.analysis_service import analyze_packets

    packets = build_task_packets(run_snapshot, "task02", node_id="N01", max_chars=1)

    class Client:
        def complete(self, body):
            return {
                "choices": [
                    {
                        "finish_reason": "stop",
                        "message": {
                            "content": json.dumps(
                                {
                                    "findings": [
                                        {
                                            "category": "pattern",
                                            "claim": "有确定性统计事实。",
                                            "interpretation": "需结合当前范围理解。",
                                            "support_level": "limited",
                                            "limitations": "仅当前节点。",
                                            "evidence_refs": [
                                                {
                                                    "ref": "fact1",
                                                    "excerpt": "class_node_indicator",
                                                }
                                            ],
                                        }
                                    ]
                                },
                                ensure_ascii=False,
                            )
                        },
                    }
                ]
            }

    result = analyze_packets(packets, Client(), "mock-model")

    ids = [finding["finding_id"] for finding in result["findings"]]
    assert len(ids) == 3
    assert len(set(ids)) == 3
