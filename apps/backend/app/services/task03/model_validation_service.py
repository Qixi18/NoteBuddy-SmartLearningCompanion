"""Validate model-produced claims without granting review or score authority."""

from __future__ import annotations

import re

from ...application.ports.llm import LLMError
from ..ai_analysis.safety_service import inspect_student_text

_TEXT_FIELDS = ("diagnosis", "recommendation", "adjustment_condition")
_SCORE_CLAIM = re.compile(
    r"(?:得分|得了|满分|分数|评分)\s*[:：为是]?\s*(\d+(?:\.\d+)?)\s*(?:/\s*(\d+(?:\.\d+)?)\s*)?分?"
)


def validate_model_output(candidate: dict, context: dict) -> dict:
    """Return an unconfirmed draft with local evidence IDs restored.

    The model cannot set scores, confirmation state, verification state, or
    citations outside the exact context units sent for this one scope.
    """
    if not isinstance(candidate, dict):
        raise LLMError("invalid content")
    allowed_fields = {*_TEXT_FIELDS, "evidence_record_ids"}
    if set(candidate) - allowed_fields:
        raise LLMError("模型输出包含禁止的确认或评分字段")
    for field in _TEXT_FIELDS:
        if not isinstance(candidate.get(field), str) or not candidate[field].strip():
            raise LLMError(f"模型缺少 {field}")
    refs = candidate.get("evidence_record_ids")
    allowed = set(context.get("allowed_record_aliases", []))
    if (
        not isinstance(refs, list)
        or any(not isinstance(ref, str) for ref in refs)
        or len(refs) != len(set(refs))
        or not set(refs).issubset(allowed)
    ):
        raise LLMError("模型返回了无效证据引用")
    if allowed and not refs:
        raise LLMError("模型未引用证据")

    permitted_scores = set(context.get("allowed_score_tokens", []))
    for field in _TEXT_FIELDS:
        for match in _SCORE_CLAIM.finditer(candidate[field]):
            tokens = [token for token in match.groups() if token]
            if any(token not in permitted_scores for token in tokens):
                raise LLMError("模型输出包含规则证据中不存在的评分")

    safety_text = "\n".join(candidate[field] for field in _TEXT_FIELDS)
    safety_issues = inspect_student_text(safety_text)
    if safety_issues:
        raise LLMError("模型输出未通过学生内容安全检查：" + ", ".join(safety_issues))

    alias_map = context.get("record_aliases", {})
    return {
        **{field: candidate[field].strip() for field in _TEXT_FIELDS},
        "evidence_record_ids": [alias_map[ref] for ref in refs],
        "status": "needs_review",
        "verified": False,
    }
