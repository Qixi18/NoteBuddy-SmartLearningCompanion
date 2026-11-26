"""Propose 必要联系 (prerequisite link) candidates for teacher judgment.

教师判断层 v1：学习顺序属于教学判断，系统只提出可解释的候选，不自动写入。
候选依据完全来自运行内数据——课程要求的指标顺序与测验节点的已教范围——
教师勾选认可后以教师署名保存为签核新版本。
"""

from __future__ import annotations

import re

from ..shared.node_ordering import sort_nodes


def _sorted_nodes(run: dict) -> list[dict]:
    nodes = [
        node
        for node in run.get("nodes", [])
        if node.get("节点编号")
    ]
    ordered, _ = sort_nodes(nodes)
    return ordered


def _topics_in_teaching_order(run: dict, nodes: list[dict]) -> list[str]:
    """主题按"首次被测验节点覆盖"的顺序排列（节点按日期排序）。"""
    order: list[str] = []
    for node in nodes:
        taught = re.split(r"[、，,;\s]+", str(node.get("已教及测量主题", "")))
        for topic in taught:
            topic = topic.strip()
            if topic and topic not in order:
                order.append(topic)
    return order


def _node_evidence_for_topic(topic_id: str, nodes: list[dict]) -> str:
    parts = []
    for node in nodes:
        taught = re.split(r"[、，,;\s]+", str(node.get("已教及测量主题", "")))
        if topic_id in taught:
            date = str(node.get("模拟测验日期") or "")
            date_label = f"{date} " if date else ""
            parts.append(f"{node['节点编号']}（{date_label}已教 {topic_id}）")
    return "；".join(parts) if parts else "教学顺序按课程要求排列"


def build_knowledge_link_candidates(
    run: dict, indicator_id: str
) -> list[dict[str, str]]:
    """Return prerequisite candidates for one indicator (teacher judgment layer).

    规则 v1（全部可解释）：
    1. 同主题内：课程要求顺序里紧邻的前一项指标作为前置候选；
    2. 跨主题：教学顺序中前一个主题的末位指标作为前置候选；
    每条候选的依据注明来源（课程要求顺序或节点已教范围）。
    """
    objectives = run.get("objectives", [])
    index = next(
        (position for position, row in enumerate(objectives) if row.get("指标编号") == indicator_id),
        None,
    )
    if index is None:
        raise ValueError("指标编号不存在")
    objective = objectives[index]
    topic_id = str(objective.get("主题编号", ""))

    nodes = _sorted_nodes(run)
    _, ambiguous_node_ids = sort_nodes(nodes)
    topic_order = _topics_in_teaching_order(run, nodes)
    labels = {
        row.get("指标编号"): str(row.get("观察指标", ""))
        for row in objectives
    }

    candidates: list[dict[str, str]] = []

    # 规则 1：同主题紧邻前置
    if index > 0 and str(objectives[index - 1].get("主题编号", "")) == topic_id:
        previous = objectives[index - 1]
        candidates.append(
            {
                "target_indicator_id": str(previous["指标编号"]),
                "target_label": labels.get(previous["指标编号"], ""),
                "relation": "前置知识",
                "evidence": "课程要求顺序：同主题内该要求排列在前",
                "rule": "same_topic_previous",
            }
        )

    # 规则 2：教学顺序中前一个主题的末位指标
    if not ambiguous_node_ids and topic_id in topic_order:
        topic_position = topic_order.index(topic_id)
        if topic_position > 0:
            previous_topic = topic_order[topic_position - 1]
            previous_indicators = [
                row
                for row in objectives
                if str(row.get("主题编号", "")) == previous_topic
            ]
            if previous_indicators:
                previous = previous_indicators[-1]
                if str(previous["指标编号"]) != indicator_id:
                    candidates.append(
                        {
                            "target_indicator_id": str(previous["指标编号"]),
                            "target_label": labels.get(previous["指标编号"], ""),
                            "relation": "前置知识",
                            "evidence": (
                                f"教学顺序：{previous_topic} 先于 {topic_id} 教学"
                                f"（{_node_evidence_for_topic(topic_id, nodes)}）"
                            ),
                            "rule": "topic_teaching_order",
                        }
                    )
    return candidates
