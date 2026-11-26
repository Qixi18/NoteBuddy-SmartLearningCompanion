"""Date-based ordering for assessment nodes; ambiguous dates stay unordered."""

from __future__ import annotations

from datetime import date


def node_date(node: dict) -> date | None:
    value = str(node.get("模拟测验日期") or "").strip()
    if len(value) != 10:
        return None
    try:
        parsed = date.fromisoformat(value)
    except ValueError:
        return None
    return parsed if parsed.isoformat() == value else None


def compare_node_dates(first: dict, second: dict) -> int | None:
    """Return -1/0/1 for dated nodes, or None when chronology is ambiguous."""
    first_date, second_date = node_date(first), node_date(second)
    if first_date is None or second_date is None:
        return None
    if first_date == second_date:
        return 0 if first.get("节点编号") == second.get("节点编号") else None
    return -1 if first_date < second_date else 1


def compare_nodes(nodes: list[dict], first_id: str, second_id: str) -> int | None:
    first = next((node for node in nodes if node.get("节点编号") == first_id), None)
    second = next((node for node in nodes if node.get("节点编号") == second_id), None)
    if first is None or second is None:
        return None
    if first_id == second_id:
        return 0
    return compare_node_dates(first, second)


def sort_nodes(nodes: list[dict]) -> tuple[list[dict], list[str]]:
    """Sort by valid date; retain source order inside ambiguous groups."""
    dated: dict[date, list[tuple[int, dict]]] = {}
    undated: list[tuple[int, dict]] = []
    for index, node in enumerate(nodes):
        parsed = node_date(node)
        if parsed is None:
            undated.append((index, node))
        else:
            dated.setdefault(parsed, []).append((index, node))

    ordered: list[dict] = []
    ambiguous_ids: list[str] = []
    for parsed in sorted(dated):
        group = dated[parsed]
        ordered.extend(node for _, node in group)
        if len(group) > 1:
            ambiguous_ids.extend(str(node.get("节点编号")) for _, node in group)
    ordered.extend(node for _, node in undated)
    ambiguous_ids.extend(str(node.get("节点编号")) for _, node in undated)
    return ordered, ambiguous_ids
