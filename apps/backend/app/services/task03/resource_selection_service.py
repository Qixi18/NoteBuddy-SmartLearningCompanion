"""Select node-valid practice and human-verified learning resources transparently."""

import re

_PURPOSE_TERMS = {
    "remediation": ("补救", "回看", "复习", "基础", "巩固"),
    "transfer": ("迁移", "变式", "变化", "迁移观察"),
    "diagnostic": ("观察", "诊断", "检测", "核对"),
}

_REASON_DESCRIPTIONS = {
    "ai_mapping_match": "AI 映射将该材料关联到当前学习指标，仍需以来源核验结果为准",
    "verified_indicator_match": "材料已核验并关联当前学习指标",
    "target_issue_match": "材料与当前证据中已观察到的失分评分点相匹配",
    "purpose_match": "材料用途与本次教学目的相符",
    "unseen_for_transfer": "该练习尚未在当前范围观察，适合用于迁移观察",
    "observed_item_reflection_only": "该练习已观察过，仅作为回顾材料",
}


def _excluded(material_id: str, reason_code: str, reason: str) -> dict:
    return {
        "material_id": material_id,
        "reason_codes": [reason_code],
        "reason": reason,
    }


def select_resources(
    bundle: dict, insights: list[dict], catalog: list[dict], purpose: str
) -> dict:
    """Return deterministic selection reasons, keeping questions and resources apart."""
    if purpose not in _PURPOSE_TERMS:
        raise ValueError("purpose必须是remediation、transfer或diagnostic")
    scope = bundle.get("scope", {})
    indicator_id, node_id = scope.get("indicator_id"), scope.get("node_id")
    source = bundle.get("source_context", {})
    known = {
        str(item.get("material_id")): item
        for item in catalog
        if item.get("material_id")
    }
    scoped_items = {str(item.get("material_id")) for item in bundle.get("items", [])}
    verified_questions = set(source.get("material_ids", []))
    ai_mappings = source.get("ai_mappings", {})
    ai_materials = {
        material_id
        for material_id, mapping in ai_mappings.items()
        if mapping.get("status") == "usable"
    }
    resource_links = {
        str(link.get("material_id")): link
        for link in source.get("resource_links", [])
        if link.get("material_id")
    }
    observed = {
        row.get("material_id")
        for row in bundle.get("responses", [])
        if row.get("disposition") == "scored"
    }
    topic_id = source.get("topic_id", "")
    lost_points = {
        point_id
        for claim in insights
        for ref in claim.get("evidence_refs", [])
        for point_id in re.findall(r"[A-Z]+\d+P\d+", ref.get("description", ""))
    }
    target_issue_materials = set()
    if source.get("status") == "verified" and not source.get("stale"):
        for mapping in source.get("rubric_mappings", []):
            if mapping.get("status") == "verified" and lost_points.intersection(
                mapping.get("rubric_point_ids", [])
            ):
                target_issue_materials.update(mapping.get("material_ids", []))

    practice_candidates = []
    learning_candidates = []
    excluded = []
    seen_ids = set()
    for material_id in sorted(set(known) | set(resource_links)):
        item = known.get(material_id)
        if item is None:
            excluded.append(
                _excluded(
                    material_id,
                    "unknown_material",
                    "来源映射引用了当前材料目录之外的材料。",
                )
            )
            continue
        if material_id in seen_ids:
            excluded.append(
                _excluded(
                    material_id, "duplicate_material", "材料编号重复，只保留一次。"
                )
            )
            continue
        seen_ids.add(material_id)
        resource_type = item.get("resource_type") or item.get("材料类型") or ""
        item_indicator = item.get("indicator_id") or item.get("指标编号")
        item_topic = item.get("topic_id") or item.get("主题编号", "")
        is_question = resource_type == "题目"
        link = resource_links.get(material_id)
        if is_question and item_indicator != indicator_id:
            excluded.append(
                _excluded(material_id, "indicator_mismatch", "该材料不属于当前指标。")
            )
            continue
        if topic_id and item_topic and item_topic != topic_id:
            excluded.append(
                _excluded(
                    material_id, "topic_mismatch", "该材料主题与当前指标主题不一致。"
                )
            )
            continue
        if is_question:
            if material_id not in scoped_items:
                excluded.append(
                    _excluded(
                        material_id,
                        "outside_node_scope",
                        "题目不在当前指标和测验节点范围内。",
                    )
                )
                continue
            if not (
                (
                    source.get("status") == "verified"
                    and not source.get("stale")
                    and material_id in verified_questions
                )
                or material_id in ai_materials
            ):
                excluded.append(
                    _excluded(
                        material_id,
                        "source_not_verified",
                        "当前题目关系没有有效的人工来源核验。",
                    )
                )
                continue
            link = None
        else:
            if not (
                link is not None
                and link.get("status") == "verified"
                and source.get("status") == "verified"
                and not source.get("stale")
                or material_id in ai_materials
            ):
                excluded.append(
                    _excluded(
                        material_id,
                        "source_not_verified",
                        "教材或学习卡没有当前有效的人工映射。",
                    )
                )
                continue
            if (
                link is not None
                and indicator_id not in link.get("indicator_ids", [])
                and material_id not in ai_materials
            ):
                excluded.append(
                    _excluded(
                        material_id, "indicator_mismatch", "资源映射没有覆盖当前指标。"
                    )
                )
                continue
            if (
                link is not None
                and node_id not in link.get("allowed_node_ids", [])
                and material_id not in ai_materials
            ):
                excluded.append(
                    _excluded(
                        material_id,
                        "outside_node_scope",
                        "资源映射不允许用于当前测验节点。",
                    )
                )
                continue

        ai_relation = ai_mappings.get(material_id, {})
        purpose_text = str(
            (link or {}).get(
                "purpose", item.get("purpose", ai_relation.get("relation", ""))
            )
        )
        purpose_match = any(term in purpose_text for term in _PURPOSE_TERMS[purpose])
        issue_match = material_id in target_issue_materials
        unseen = material_id not in observed
        reason_codes = [
            "ai_mapping_match"
            if material_id in ai_materials
            else "verified_indicator_match"
        ]
        if issue_match:
            reason_codes.append("target_issue_match")
        if purpose_match:
            reason_codes.append("purpose_match")
        if purpose == "transfer" and unseen:
            reason_codes.append("unseen_for_transfer")
        elif purpose == "transfer" and not unseen:
            reason_codes.append("observed_item_reflection_only")
        entry = {
            "material_id": material_id,
            "resource_type": resource_type,
            "title": item.get("title") or item.get("题干或内容", ""),
            "purpose": purpose_text,
            "reason_codes": reason_codes,
            "reason": "；".join(
                _REASON_DESCRIPTIONS[code]
                for code in reason_codes
                if code in _REASON_DESCRIPTIONS
            ),
            "reason_details": [
                {"code": code, "description": _REASON_DESCRIPTIONS[code]}
                for code in reason_codes
                if code in _REASON_DESCRIPTIONS
            ],
        }
        if purpose == "transfer" and not unseen and is_question:
            excluded.append(
                _excluded(
                    material_id,
                    "already_observed",
                    "迁移观察优先使用当前节点未观察过的题目；已做题仅留作反思。",
                )
            )
            continue
        if is_question:
            practice_candidates.append(entry)
        else:
            learning_candidates.append(entry)

    practice_candidates.sort(
        key=lambda row: (
            -("target_issue_match" in row["reason_codes"]),
            -("purpose_match" in row["reason_codes"]),
            -("unseen_for_transfer" in row["reason_codes"]),
            row["material_id"],
        )
    )
    learning_candidates.sort(
        key=lambda row: (
            -("target_issue_match" in row["reason_codes"]),
            -("purpose_match" in row["reason_codes"]),
            row["material_id"],
        )
    )
    practice = practice_candidates[:2]
    resources = learning_candidates[:2]
    for row in practice_candidates[2:] + learning_candidates[2:]:
        excluded.append(
            _excluded(
                row["material_id"],
                "lower_priority_candidate",
                "存在更符合当前问题或用途的候选材料。",
            )
        )
    ready = bool(practice)
    if learning_candidates and not practice:
        reason_codes = ["no_verified_node_practice"]
    else:
        reason_codes = [] if ready else ["no_verified_candidate"]
    return {
        "status": "ready" if ready else "blocked",
        "purpose": purpose,
        "practice_items": practice,
        "learning_resources": resources,
        "excluded": excluded,
        "reason_codes": reason_codes,
    }
