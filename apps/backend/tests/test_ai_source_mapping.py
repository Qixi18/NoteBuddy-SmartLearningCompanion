import pytest

from app.services.task01.mapping_generation_service import (
    generate_indicator_mapping,
    mapping_is_current,
    validate_mapping_candidate,
)


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
                "evidence": [{"ref_id": "pdf-3", "excerpt": "课标原文：理解数量关系"}],
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
