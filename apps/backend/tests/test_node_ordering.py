from app.services.shared.node_ordering import compare_nodes, sort_nodes


def test_unique_dates_sort_chronologically_without_using_node_ids():
    nodes = [
        {"节点编号": "N99", "模拟测验日期": "2026-06-17"},
        {"节点编号": "N01", "模拟测验日期": "2026-01-20"},
    ]

    ordered, ambiguous = sort_nodes(nodes)

    assert [node["节点编号"] for node in ordered] == ["N01", "N99"]
    assert ambiguous == []
    assert compare_nodes(nodes, "N01", "N99") == -1


def test_missing_or_tied_dates_are_ambiguous_not_ordered_by_identifier():
    nodes = [
        {"节点编号": "N99", "模拟测验日期": "2026-01-20"},
        {"节点编号": "N01", "模拟测验日期": "2026-01-20"},
        {"节点编号": "N02", "模拟测验日期": ""},
    ]

    ordered, ambiguous = sort_nodes(nodes)

    assert [node["节点编号"] for node in ordered] == ["N99", "N01", "N02"]
    assert ambiguous == ["N99", "N01", "N02"]
    assert compare_nodes(nodes, "N99", "N01") is None
    assert compare_nodes(nodes, "N99", "N02") is None
    assert compare_nodes(nodes, "N99", "N99") == 0


def test_same_node_remains_a_valid_scope_when_its_date_is_missing():
    assert compare_nodes([{"节点编号": "N01", "模拟测验日期": ""}], "N01", "N01") == 0
