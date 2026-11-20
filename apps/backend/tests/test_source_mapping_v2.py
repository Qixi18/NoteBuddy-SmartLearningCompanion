import pytest
from app.domain.subject.source_mapping import bind_resource_links, fingerprint_material


def test_resource_link_type_and_fingerprint_come_from_material_source():
    material = {
        "材料编号": "LC01",
        "指标编号": "",
        "材料类型": "学习卡",
        "内容": "回忆提示",
        "_source_line": 7,
    }
    link = {
        "material_id": "LC01",
        "purpose": "独立回忆",
        "indicator_ids": ["T01I1"],
        "allowed_node_ids": ["N01"],
        "source_locator": "学习卡第 2 面",
        "evidence": "提示内容覆盖该指标",
        "status": "verified",
        "resource_type": "伪造类型",
        "content_hash": "伪造指纹",
    }

    bound = bind_resource_links(
        [link], {"LC01": material}, {"T01I1"}, {"N01"}, "T01I1", "verified"
    )[0]

    assert bound["resource_type"] == "学习卡"
    assert bound["content_hash"] == fingerprint_material(material)
    assert bound["content_hash"] != "伪造指纹"
    assert "指标编号" not in material or not material["指标编号"]


def test_resource_link_rejects_unknown_scope_and_requires_human_signoff():
    material = {"材料编号": "TB01", "材料类型": "教材"}
    link = {
        "material_id": "TB01",
        "purpose": "概念复习",
        "indicator_ids": ["T01I1"],
        "allowed_node_ids": ["N99"],
        "source_locator": "教材第 12 页",
        "evidence": "本页解释目标概念",
        "status": "verified",
    }

    with pytest.raises(ValueError, match="节点"):
        bind_resource_links(
            [link], {"TB01": material}, {"T01I1"}, {"N01"}, "T01I1", "verified"
        )
    link["allowed_node_ids"] = ["N01"]
    with pytest.raises(ValueError, match="来源一并确认"):
        bind_resource_links(
            [link], {"TB01": material}, {"T01I1"}, {"N01"}, "T01I1", "pending"
        )
