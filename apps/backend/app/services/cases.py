"""从公开或独立数据中提出三种可核查的案例候选。"""
from __future__ import annotations

from collections import Counter
from statistics import median


def suggest_cases(run: dict) -> list[dict]:
    students = [r["学生编号"] for r in run["students"]]
    if len(students) < 3:
        return []
    eligible = {rid for m in run["metrics"] if m["kind"] == "student" for rid in m["record_ids"]}
    partial = Counter()
    partial_records = {}
    for row in run["responses"]:
        if row["记录编号"] not in eligible or not row.get("解答过程"):
            continue
        try:
            score, maximum = float(row["得分"]), float(row["满分"])
        except ValueError:
            continue
        if 0 < score < maximum:
            partial[row["学生编号"]] += 1
            partial_records.setdefault(row["学生编号"], []).append(row["记录编号"])
    first = max(students, key=lambda sid: (partial[sid], sid))
    by_student = {m["key"]: m for m in run["metrics"] if m["kind"] == "student"}
    class_by_student = {r["学生编号"]: r["模拟班级编号"] for r in run["students"]}
    remaining = [sid for sid in students if sid != first]
    typical_count = median((m["count"] for m in by_student.values())) if by_student else 0
    sufficiently_observed = [sid for sid in remaining if (by_student.get(sid) or {}).get("count", 0) >= typical_count]
    cross_class = [sid for sid in sufficiently_observed if class_by_student[sid] != class_by_student[first]]
    second = max(cross_class or sufficiently_observed or remaining,
                 key=lambda sid: ((by_student.get(sid) or {}).get("ratio") or -1,
                                  (by_student.get(sid) or {}).get("count") or 0, sid))
    remaining.remove(second)
    third = min(remaining, key=lambda sid: ((by_student.get(sid) or {}).get("count") or 0, sid))
    return [
        {"student_id": first, "type": "部分得分", "reason": f"有 {partial[first]} 条带过程的有效部分得分记录，适合复核具体步骤。",
         "evidence_record_ids": partial_records.get(first, [])},
        {"student_id": second, "type": "表现较好", "reason": "在已有有效评分记录中得分率较高，适合设计变式或迁移任务。",
         "evidence_record_ids": (by_student.get(second) or {}).get("record_ids", [])},
        {"student_id": third, "type": "记录较少", "reason": "有效评分记录较少，适合展示信息不足时的补充观察。",
         "evidence_record_ids": (by_student.get(third) or {}).get("record_ids", [])},
    ]
