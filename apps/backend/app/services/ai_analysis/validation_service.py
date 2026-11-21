"""Validate model findings against the exact evidence in a local packet."""

from __future__ import annotations

import json
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


def _source_excerpt(local: dict[str, Any], limit: int = 240) -> str:
    """Build a UI preview from trusted local evidence, never from a paraphrase."""
    if local.get("kind") == "metric" and isinstance(local.get("value"), dict):
        text = "；".join(
            f"{key}：{value}"
            for key, value in local["value"].items()
            if key != "fact_id"
        )
    else:
        text = str(local.get("text", "") or "")
    return text.strip()[:limit]


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
