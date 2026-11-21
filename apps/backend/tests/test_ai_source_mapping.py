import pytest

from app.services.task01.mapping_generation_service import (
    _references,
    generate_indicator_mapping,
    mapping_is_current,
    validate_mapping_candidate,
    build_mapping_preview,
)
from app.application.use_cases.workbench import _current_ai_mappings


class SourceService:
    def __init__(self, text="课标原文：理解数量关系"):
        self.text = text

    def inspect_pdf(self, _run, _name):
        return {"available": True, "page_count": 1, "text_pages": [0]}

    def extract_pages(self, _run, _name, _pages):
        return [{"page": 1, "text": self.text}]


class Model:
    model = "fake-model"

    def __init__(self, candidate):
        self.candidate = candidate

    def complete(self, _body):
        import json

        return {
            "choices": [
                {"message": {"content": json.dumps(self.candidate, ensure_ascii=False)}}
            ]
        }


@pytest.fixture
def run():
    return {
        "run_id": "run-1",
        "objectives": [
            {"指标编号": "T01I1", "主题编号": "T01", "观察指标": "理解数量关系"}
        ],
        "items": [{"材料编号": "Q01", "指标编号": "T01I1", "题干或内容": "列式计算"}],
        "source_index": [
            {"indicator_id": "T01I1", "source_check": {"textbook_slices": []}}
        ],
    }


def test_mapping_candidate_requires_exact_source_excerpt(run):
    candidate = {
        "mappings": [
            {
                "material_id": "Q01",
                "relation": "assesses",
                "explanation": "对应指标",
                "evidence": [
                    {"ref_id": "pdf-3", "excerpt": "课标原文：理解数量关系"},
                    {"ref_id": "item-1", "excerpt": "列式计算"},
                ],
            }
        ]
    }
    result = generate_indicator_mapping(run, SourceService(), Model(candidate), "T01I1")
    assert result["status"] == "usable"
    assert result["mappings"][0]["evidence"][0]["page"] == 1
    assert mapping_is_current(run, SourceService(), result)
    assert not mapping_is_current(run, SourceService("教材已变化"), result)


def test_mapping_candidate_rejects_fabricated_excerpt(run):
    refs = [
        {
            "ref_id": "pdf-3",
            "source": "课程标准_2022.pdf",
            "page": 1,
            "text": "课标原文",
        }
    ]
    result = validate_mapping_candidate(
        {
            "mappings": [
                {
                    "material_id": "Q01",
                    "relation": "assesses",
                    "explanation": "对应指标",
                    "evidence": [{"ref_id": "pdf-3", "excerpt": "模型编造的原文"}],
                }
            ]
        },
        "T01I1",
        run,
        refs,
        "fingerprint",
    )
    assert result["status"] == "needs_resolution"
    assert "mapping_0:invalid_evidence" in result["validation_errors"]


def test_mapping_candidate_rejects_material_linked_to_another_indicator(run):
    run["objectives"].append(
        {"指标编号": "T01I2", "主题编号": "T01", "观察指标": "理解单位"}
    )
    run["items"].append(
        {"材料编号": "Q02", "指标编号": "T01I2", "题干或内容": "换算单位"}
    )
    result = validate_mapping_candidate(
        {
            "mappings": [
                {
                    "material_id": "Q02",
                    "relation": "assesses",
                    "explanation": "对应当前指标",
                    "evidence": [
                        {"ref_id": "pdf-3", "excerpt": "课标原文：理解数量关系"}
                    ],
                }
            ]
        },
        "T01I1",
        run,
        [
            {
                "ref_id": "pdf-3",
                "source": "课程标准_2022.pdf",
                "page": 1,
                "text": "课标原文：理解数量关系",
            }
        ],
        "fingerprint",
    )

    assert result["status"] == "needs_resolution"
    assert result["mappings"] == []
    assert "mapping_0:indicator_mismatch" in result["validation_errors"]


def test_usable_mapping_must_quote_its_official_indicator_item_row(run):
    result = validate_mapping_candidate(
        {
            "mappings": [
                {
                    "material_id": "Q01",
                    "relation": "assesses",
                    "explanation": "对应指标",
                    "evidence": [
                        {"ref_id": "pdf-3", "excerpt": "课标原文：理解数量关系"}
                    ],
                }
            ]
        },
        "T01I1",
        run,
        [
            {
                "ref_id": "pdf-3",
                "source": "课程标准_2022.pdf",
                "page": 1,
                "text": "课标原文：理解数量关系",
            }
        ],
        "fingerprint",
    )

    assert result["status"] == "needs_resolution"
    assert result["mappings"][0]["status"] == "needs_resolution"
    assert "mapping_0:item_link_evidence_missing" in result["validation_errors"]


def test_valid_mapping_remains_available_when_another_row_needs_resolution(run):
    result = validate_mapping_candidate(
        {
            "mappings": [
                {
                    "material_id": "Q01",
                    "relation": "assesses",
                    "explanation": "引用了题目行",
                    "evidence": [{"ref_id": "item-1", "excerpt": "列式计算"}],
                },
                {
                    "material_id": "Q01",
                    "relation": "assesses",
                    "explanation": "缺少题目行引用",
                    "evidence": [{"ref_id": "pdf-3", "excerpt": "课标原文"}],
                },
            ]
        },
        "T01I1",
        run,
        [
            {
                "ref_id": "item-1",
                "source": "题目与材料.csv",
                "line": 2,
                "text": {"材料编号": "Q01", "题干或内容": "列式计算"},
            },
            {
                "ref_id": "pdf-3",
                "source": "课程标准_2022.pdf",
                "page": 1,
                "text": "课标原文",
            },
        ],
        "fingerprint",
    )

    available = _current_ai_mappings(
        run,
        {
            "T01I1": [
                {
                    **result,
                    "input_fingerprint": _references(run, SourceService(), "T01I1")[1],
                }
            ]
        },
        SourceService(),
        "T01I1",
    )

    assert result["status"] == "needs_resolution"
    assert set(available) == {"Q01"}


def test_mapping_preview_discloses_exact_source_ranges_and_is_input_bound(run):
    run["objectives"][0]["_source_line"] = 2
    run["items"][0]["_source_line"] = 3
    preview = build_mapping_preview(
        run, SourceService(), "deepseek", "deepseek-chat", ["T01I1"]
    )
    assert preview["provider"] == "deepseek"
    assert preview["model"] == "deepseek-chat"
    assert preview["billing_unit"] == "input_output_tokens"
    assert preview["cache_behavior"] == "each_request_is_billable"
    assert preview["source_files"] == [
        {"name": "课程标准_2022.pdf", "pages": [1]},
        {"name": "课程要求.csv", "lines": [2]},
        {"name": "题目与材料.csv", "lines": [3]},
    ]
    run["objectives"][0]["观察指标"] = "新的指标说明"
    changed = build_mapping_preview(
        run, SourceService(), "deepseek", "deepseek-chat", ["T01I1"]
    )
    assert changed["fingerprint"] != preview["fingerprint"]
