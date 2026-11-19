"""Suggest three auditable, node-scoped case candidates without class-wide claims."""

from __future__ import annotations

import re


def _current_node(nodes: list[dict]) -> dict | None:
    if not nodes:
        return None
    dated = [node for node in nodes if node.get("模拟测验日期")]
    if dated:
        return max(dated, key=lambda node: str(node["模拟测验日期"]))
    return nodes[-1]


def suggest_cases(run: dict) -> list[dict]:
    students = run.get("students", [])
    if len(students) < 3:
        return []

    node = _current_node(run.get("nodes", []))
    node_id = node.get("节点编号") if node else None
    available_items = set(
        re.findall(r"[A-Z]+\d+", (node or {}).get("可用题目编号", ""))
    )
    eligible_ids = {
        record_id
        for metric in run.get("metrics", [])
        if metric.get("kind") == "student"
        for record_id in metric.get("record_ids", [])
    }
    current_rows = [
        row
        for row in run.get("responses", [])
        if row.get("节点编号") == node_id
        and row.get("记录编号") in eligible_ids
        and row.get("材料编号") in available_items
    ]
    by_student = {student["学生编号"]: [] for student in students}
    for row in current_rows:
        by_student.setdefault(row["学生编号"], []).append(row)

    student_order = [student["学生编号"] for student in students]
    class_by_student = {
        student["学生编号"]: student.get("模拟班级编号", "未知班级")
        for student in students
    }
    partial_rows = {
        student_id: [
            row
            for row in rows
            if row.get("解答过程") and 0 < float(row["得分"]) < float(row["满分"])
        ]
        for student_id, rows in by_student.items()
    }
    if any(partial_rows.values()):
        first = max(
            student_order,
            key=lambda sid: (len(partial_rows.get(sid, [])), sid),
        )
    else:
        first = min(
            student_order,
            key=lambda sid: (-len(by_student.get(sid, [])), sid),
        )

    def ratio(student_id: str) -> float | None:
        rows = by_student.get(student_id, [])
        maximum = sum(float(row["满分"]) for row in rows)
        return (
            sum(float(row["得分"]) for row in rows) / maximum if maximum > 0 else None
        )

    remaining = [sid for sid in student_order if sid != first]
    other_class = [
        sid for sid in remaining if class_by_student[sid] != class_by_student[first]
    ]
    second_pool = other_class or remaining
    second = max(
        second_pool,
        key=lambda sid: (ratio(sid) if ratio(sid) is not None else -1, sid),
    )
    remaining.remove(second)
    represented_classes = {class_by_student[first], class_by_student[second]}
    uncovered_class_candidates = [
        sid for sid in remaining if class_by_student[sid] not in represented_classes
    ]
    third_pool = uncovered_class_candidates or remaining
    third = min(
        third_pool,
        key=lambda sid: (len(by_student.get(sid, [])), sid),
    )

    selected_classes = {class_by_student[sid] for sid in (first, second, third)}
    all_classes = set(class_by_student.values())
    missing_classes = sorted(all_classes - selected_classes)
    class_coverage = f"案例组覆盖 {len(selected_classes)}/{len(all_classes)} 个班级" + (
        f"；未覆盖班级：{'、'.join(missing_classes)}"
        if missing_classes
        else "；已覆盖名单中的全部班级"
    )
    available_count = len(available_items)

    def sample_note(student_id: str) -> str:
        rows = by_student.get(student_id, [])
        item_count = len({row["材料编号"] for row in rows})
        return (
            f"样本覆盖：当前节点 {len(rows)} 条有效已评分事件，涉及 {item_count}/{available_count} 道可用题；"
            "这是现有 CSV 的证据覆盖，不是个人完成率或全班代表性。"
        )

    if partial_rows.get(first):
        first_reason = f"当前节点有 {len(partial_rows[first])} 条带过程的有效部分得分记录，作为部分得分复核候选。"
    else:
        first_reason = "当前节点没有可核实的带过程部分得分证据；此位仅是待人工核验候选，不能据此宣称发现部分得分案例。"

    if by_student.get(second):
        second_reason = (
            f"在当前节点已有有效评分记录的候选中，得分率相对较高（{ratio(second):.1%}）；"
            "只描述可见样本，不代表全班排名或掌握结论。"
        )
    else:
        second_reason = (
            "当前节点没有有效评分证据，无法比较表现；此位仅是待人工补证候选。"
        )

    third_reason = (
        f"当前节点有 {len(by_student.get(third, []))} 条有效已评分事件，作为证据较少的补充观察候选；"
        "无记录不等于未掌握。"
    )

    cases = []
    for student_id, case_type, reason in (
        (first, "部分得分", first_reason),
        (second, "表现较好", second_reason),
        (third, "记录较少", third_reason),
    ):
        rows = by_student.get(student_id, [])
        evidence_rows = (
            partial_rows.get(student_id, [])
            if case_type == "部分得分" and partial_rows.get(student_id)
            else rows
        )
        cases.append(
            {
                "student_id": student_id,
                "class_id": class_by_student[student_id],
                "type": case_type,
                "reason": (
                    f"节点 {node_id or '未知'}；{reason} {sample_note(student_id)} "
                    f"{class_coverage}。候选案例需人工复核，不代表全班。"
                ),
                "evidence_record_ids": [row["记录编号"] for row in evidence_rows],
            }
        )
    return cases
