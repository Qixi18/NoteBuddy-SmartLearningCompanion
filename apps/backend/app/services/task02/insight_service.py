"""Create evidence-linked, deliberately narrow claims about one student scope."""

import hashlib
import json


def _claim_id(scope: dict, kind: str, text: str, refs: list[dict]) -> str:
    payload = json.dumps(
        {"scope": scope, "kind": kind, "text": text, "refs": refs},
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _reference(response: dict, description: str) -> dict:
    return {
        "evidence_id": response["evidence_id"],
        "record_id": response.get("record_id"),
        "source_line": response.get("source_line"),
        "material_id": response.get("material_id", ""),
        "description": description,
    }


def _make_claim(
    bundle: dict,
    kind: str,
    text: str,
    refs: list[dict],
    limitations: list[str],
) -> dict:
    return {
        "claim_id": _claim_id(bundle["scope"], kind, text, refs),
        "kind": kind,
        "text": text,
        "evidence_refs": refs,
        "limitations": limitations,
        "review_status": "not_reviewed",
    }


def build_student_insights(bundle: dict) -> list[dict]:
    """Return facts and verified-map observations without inferring ability labels."""
    if not bundle.get("responses"):
        coverage = bundle.get("coverage", {})
        return [
            _make_claim(
                bundle,
                "fact",
                "当前学生、指标和测验节点范围内没有作答记录，暂时无法判断表现。",
                [
                    {
                        "evidence_id": coverage.get("evidence_id", ""),
                        "record_id": None,
                        "source_line": None,
                        "material_id": "",
                        "description": "该范围的记录覆盖情况",
                    }
                ],
                ["无记录不等于未掌握；需补充可观察证据后再判断。"],
            )
        ]

    definitions = {
        (row.get("item_id"), row.get("point_id")): row
        for row in bundle.get("rubric_definitions", [])
    }
    losses: dict[str, list[dict]] = {}
    successes: dict[str, list[dict]] = {}
    claims = []
    for response in bundle["responses"]:
        if response.get("disposition") != "scored":
            continue
        observation = response.get("rubric_observation") or {}
        if observation.get("state") == "conflict":
            conflicts = observation.get("conflicts", [])
            ref = _reference(response, "总分与评分点数据存在冲突")
            claims.append(
                _make_claim(
                    bundle,
                    "fact",
                    f"记录 {response.get('record_id')} 的总分与评分点校验存在冲突，未生成步骤归因。",
                    [ref],
                    [
                        f"评分点冲突：{', '.join(conflicts) or '原因未知'}。总分仍按质量校验口径处理。"
                    ],
                )
            )
            continue
        if observation.get("state") != "valid":
            continue
        for point in observation.get("points", []):
            point_id = point.get("point_id")
            definition = definitions.get((response.get("material_id"), point_id))
            if not definition:
                continue
            try:
                earned = float(point.get("earned"))
                maximum = float(point.get("maximum"))
            except (TypeError, ValueError):
                continue
            if maximum <= 0 or not 0 <= earned <= maximum:
                continue
            description = definition.get("description", point_id)
            ref = _reference(
                response, f"{point_id}：{description}，{earned:g}/{maximum:g}分"
            )
            if earned < maximum:
                losses.setdefault(point_id, []).append(ref)
                text = (
                    f"记录 {response.get('record_id')}（材料 {response.get('material_id')}）中，"
                    f"评分点 {point_id}“{description}”记录为 {earned:g}/{maximum:g} 分。"
                )
                limitation = "这是单题、单次作答事实；不能据此推断稳定问题、原因或整个指标掌握程度。"
            else:
                successes.setdefault(point_id, []).append(ref)
                text = (
                    f"记录 {response.get('record_id')}（材料 {response.get('material_id')}）中，"
                    f"评分点 {point_id}“{description}”记录为 {earned:g}/{maximum:g} 分。"
                )
                limitation = (
                    "这只说明当前题目和节点的已观察表现，不外推到其他题目或情境。"
                )
            claims.append(_make_claim(bundle, "fact", text, [ref], [limitation]))

    source_context = bundle.get("source_context", {})
    if source_context.get("status") == "verified" and not source_context.get("stale"):
        for mapping in source_context.get("rubric_mappings", []):
            if mapping.get("status") != "verified":
                continue
            point_ids = set(mapping.get("rubric_point_ids", []))
            material_ids = set(mapping.get("material_ids", []))
            matched = [
                ref
                for point_id in point_ids
                for ref in losses.get(point_id, [])
                if ref["material_id"] in material_ids
            ]
            if len({ref["material_id"] for ref in matched}) < 2:
                continue
            examples = [
                ref for point_id in point_ids for ref in successes.get(point_id, [])
            ]
            label = (
                mapping.get("label") or mapping.get("issue_id") or "已核验评分点问题"
            )
            affected_items = sorted({ref["material_id"] for ref in matched})
            text = f"已核验映射“{label}”在不同题目 {', '.join(affected_items)} 的相关评分点上均有未得满分记录。"
            if examples:
                success_items = sorted({ref["material_id"] for ref in examples})
                text += (
                    f"同一映射范围内也有达到满分的记录（{', '.join(success_items)}）。"
                )
            claims.append(
                _make_claim(
                    bundle,
                    "rule_observation",
                    text,
                    matched + examples,
                    [
                        "该观察仅适用于当前节点、已核验评分点和列出的题目；不证明稳定能力缺陷或因果。",
                        f"映射依据：{mapping.get('evidence') or '见教师来源签核记录'}。",
                    ],
                )
            )
    return claims
