"""Validate model findings against the exact evidence in a local packet."""

from __future__ import annotations

import json
import re
from typing import Any

from .evidence_pack_service import EvidencePacket

_SUPPORT_LEVELS = {"supported", "limited", "conflicting", "unavailable"}
_FINDING_FIELDS = {
    "category",
    "claim",
    "interpretation",
    "support_level",
    "limitations",
    "next_step",
    "evidence_refs",
}

# 摘要里使用的教师语言字段标签（覆盖证据包事实中的常见键）。
_FIELD_LABELS = {
    "indicator": "观察指标",
    "topic": "主题",
    "curriculum_locator": "课标定位",
    "textbook_locator": "教材定位",
    "source_status": "来源状态",
    "score": "得分",
    "maximum": "满分",
    "ratio": "得分率",
    "count": "记录数",
    "score_status": "评分状态",
    "disposition": "处置",
    "raw_rows": "原始记录数",
    "eligible_scored": "有效评分数",
    "student_count": "学生数",
    "dispositions": "处置分布",
    "prompt": "题干",
    "rubric": "评分点",
    "material_type": "材料类型",
    "status": "状态",
    "state": "状态",
}
_PREFERRED_ORDER = (
    "indicator",
    "topic",
    "score",
    "maximum",
    "ratio",
    "count",
    "curriculum_locator",
    "textbook_locator",
    "source_status",
    "raw_rows",
    "eligible_scored",
    "student_count",
    "dispositions",
    "prompt",
    "rubric",
)
# 处置/状态键名的教师语言映射（dispositions 等字典的键）。
_STATE_LABELS = {
    "scored": "已评分",
    "pending": "待评分",
    "unanswered": "未作答",
    "excluded": "已排除",
    "superseded": "旧版本替代",
    "verified": "已核验",
}
# 特定字段取值的教师语言映射。
_VALUE_LABELS = {
    "source_status": {"pending": "待核验", "verified": "已核验", "missing": "未找到"},
    "score_status": {"scored": "已评分", "pending": "待评分"},
}


def _format_value(key: str, value: Any) -> str:
    if key == "ratio" and isinstance(value, (int, float)):
        return f"{value * 100:.1f}%"
    if isinstance(value, str):
        value_map = _VALUE_LABELS.get(key, {})
        if value in value_map:
            return value_map[value]
        if value in _STATE_LABELS:
            return _STATE_LABELS[value]
    return str(value)


def _labeled_preview(data: dict[str, Any]) -> str:
    """Render trusted fact data as teacher-language key：value pairs."""
    excluded = {"fact_id", "kind", "materials", "verified_pdf_sources"}
    ordered = [key for key in _PREFERRED_ORDER if key in data]
    ordered += [
        key
        for key in data
        if key not in ordered
        and key not in excluded
        and not isinstance(data[key], (dict, list))
    ]
    parts = []
    for key in ordered:
        value = data[key]
        if key == "dispositions" and isinstance(value, dict):
            inner = "，".join(
                f"{_STATE_LABELS.get(str(state), str(state))} {count}"
                for state, count in sorted(value.items(), key=lambda item: str(item[0]))
            )
            parts.append(f"{_FIELD_LABELS.get(key, key)}：{inner}")
            continue
        if isinstance(value, (dict, list)) or value == "":
            continue
        parts.append(f"{_FIELD_LABELS.get(key, key)}：{_format_value(key, value)}")
    return "；".join(parts)


def _source_excerpt(local: dict[str, Any], limit: int = 240) -> str:
    """Build a UI preview from trusted local evidence, never from a paraphrase."""
    if local.get("kind") == "metric" and isinstance(local.get("value"), dict):
        text = _labeled_preview(local["value"])
    else:
        text = str(local.get("text", "") or "")
        stripped = text.strip()
        if stripped.startswith("{") and stripped.endswith("}"):
            try:
                parsed = json.loads(stripped)
            except json.JSONDecodeError:
                parsed = None
            if isinstance(parsed, dict):
                text = _labeled_preview(parsed)
    return text.strip()[:limit]


# 面向教师的语言检查：模型正文不得出现内部编号、字段名、英文术语、
# 原始 JSON 片段或小数形式的比率；命中即视为需要重写的输出。
_CLARITY_PATTERNS = (
    (re.compile(r"\bfact\d+\b", re.IGNORECASE), "内部编号 factN"),
    (re.compile(r"\bevidence\d+\b", re.IGNORECASE), "内部编号 evidenceN"),
    (
        re.compile(
            r"curriculum_locator|textbook_locator|source_status|verified_pdf_sources"
            r"|evidence_units|evidence_refs|rubric_mapping|packet_id|raw_rows"
            r"|eligible_scored|student_count|item_score|fact_id"
            r"|class_node_indicator|student_node_indicator|quality_coverage|source_page",
            re.IGNORECASE,
        ),
        "内部字段名",
    ),
    (
        re.compile(r"\brubric\b|\bpacket\b|\bcoverage\b|\bmetrics\b", re.IGNORECASE),
        "英文内部术语",
    ),
    (re.compile(r"\"[A-Za-z_]+\"[:：]"), "原始 JSON 片段"),
    (re.compile(r"得分率[为约是]?\s*0?\.\d+"), "小数形式的得分率"),
)


def find_teacher_language_issues(text: str) -> list[str]:
    """Return the categories of teacher-language violations found in text."""
    issues = []
    for pattern, label in _CLARITY_PATTERNS:
        if pattern.search(text):
            issues.append(label)
    return issues


def validate_packet_output(candidate: dict[str, Any], packet: EvidencePacket) -> dict:
    """Reject invented fields/citations and restore local source references."""
    if not isinstance(candidate, dict) or set(candidate) != {"findings"}:
        raise ValueError("模型输出结构无效")
    findings = candidate["findings"]
    if not isinstance(findings, list):
        raise TypeError("模型 findings 必须是列表")
    validated = []
    for index, finding in enumerate(findings, 1):
        if not isinstance(finding, dict) or set(finding) - _FINDING_FIELDS:
            raise ValueError("模型 finding 含有未知字段")
        for field in ("category", "claim", "interpretation", "limitations"):
            if not isinstance(finding.get(field), str) or not finding[field].strip():
                raise ValueError(f"模型 finding 缺少 {field}")
        prose = "；".join(
            str(finding.get(field, ""))
            for field in ("category", "claim", "interpretation", "limitations", "next_step")
        )
        issues = find_teacher_language_issues(prose)
        if issues:
            raise ValueError(
                "模型输出使用了非教师语言（" + "、".join(issues) + "），需要重写"
            )
        level = finding.get("support_level")
        if level not in _SUPPORT_LEVELS:
            raise ValueError("模型 support_level 无效")
        refs = finding.get("evidence_refs")
        if not isinstance(refs, list):
            raise TypeError("模型 evidence_refs 必须是列表")
        restored = []
        for ref in refs:
            if not isinstance(ref, dict) or set(ref) - {"ref", "excerpt"} or "ref" not in ref:
                raise ValueError("模型 evidence_ref 结构无效")
            alias = ref.get("ref")
            excerpt = ref.get("excerpt")
            local = packet.reference_map.get(alias)
            if not local:
                raise ValueError("模型引用了当前范围以外的证据")
            if local.get("kind") == "response":
                if (
                    not isinstance(excerpt, str)
                    or not excerpt.strip()
                    or excerpt not in local.get("text", "")
                ):
                    excerpt = _source_excerpt(local)
            elif not isinstance(excerpt, str) or excerpt not in local.get("text", ""):
                excerpt = _source_excerpt(local)
            restored.append(
                {
                    **local,
                    "excerpt": excerpt.strip(),
                    "alias": alias,
                }
            )
        if level != "unavailable" and not restored:
            raise ValueError("有证据支持的 finding 必须引用证据")
        next_step = finding.get("next_step", "")
        if not isinstance(next_step, str):
            raise TypeError("模型 next_step 必须是文本")
        validated.append(
            {
                "finding_id": f"finding{index}",
                "category": finding["category"].strip(),
                "claim": finding["claim"].strip(),
                "interpretation": finding["interpretation"].strip(),
                "support_level": level,
                "limitations": finding["limitations"].strip(),
                "next_step": next_step.strip(),
                "evidence_refs": restored,
            }
        )
    return {"findings": validated}
