"""Rules for binding imported learning resources to curriculum scopes."""

import hashlib
import json


def fingerprint_material(material: dict) -> str:
    """Hash normalized source fields while excluding parser-only metadata."""
    content = {key: value for key, value in material.items() if not key.startswith("_")}
    encoded = json.dumps(
        content,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def bind_resource_links(
    links: list[dict],
    materials: dict[str, dict],
    objective_ids: set[str],
    node_ids: set[str],
    indicator_id: str,
    verification_status: str,
) -> list[dict]:
    """Validate requested links and derive type/fingerprint from the source run."""
    ids = [link["material_id"] for link in links]
    if len(ids) != len(set(ids)):
        raise ValueError("资源映射材料编号重复")
    result = []
    for link in links:
        material_id = link["material_id"]
        material = materials.get(material_id)
        if material is None:
            raise ValueError("资源映射包含未知材料")
        indicators = link["indicator_ids"]
        if len(indicators) != len(set(indicators)):
            raise ValueError("资源映射指标编号重复")
        if indicator_id not in indicators or not set(indicators).issubset(
            objective_ids
        ):
            raise ValueError("资源映射指标范围无效")
        nodes = link["allowed_node_ids"]
        if len(nodes) != len(set(nodes)) or not set(nodes).issubset(node_ids):
            raise ValueError("资源映射测验节点无效")
        if link["status"] == "verified" and verification_status != "verified":
            raise ValueError("资源映射须随已核验来源一并确认")
        if link["status"] == "verified" and not all(
            (link["source_locator"].strip(), link["evidence"].strip())
        ):
            raise ValueError("已核验资源映射需填写定位与依据")
        result.append(
            {
                **link,
                "resource_type": str(
                    material.get("材料类型") or material.get("题目类型") or "题目"
                ),
                "content_hash": fingerprint_material(material),
            }
        )
    return result
