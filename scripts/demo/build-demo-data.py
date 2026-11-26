"""生成标准演示数据（demo-data）。

只生成合成学生与作答，不使用任何真实学生信息。数据是有意设计的：
- C1 在 T02（方程）上偏弱，C2 在 T03（不等式）上偏弱；
- N02 相对 N01 在两个薄弱主题上有可追踪的改善；
- 含待评分、未作答、超满分与多版本修订，用于演示数据口径。

运行：python scripts/demo/build-demo-data.py
输出：demo-data/csv/*.csv、demo-data/manifest.json
"""

from __future__ import annotations

import csv
import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "demo-data"
CSV_DIR = OUT / "csv"

SEED = 20261126
CLASSES = {"C1": [f"D{i:02d}" for i in range(1, 13)], "C2": [f"D{i:02d}" for i in range(13, 25)]}

TOPICS = [
    ("T01", "代数式与整式运算", "能列出代数式并代入求值；能识别同类项、去括号并化简。", "课标第 3 章 3.2 节", "B01 第 12-18 页"),
    ("T02", "方程与方程组", "能运用等式性质解一元一次方程；能用消元法解二元一次方程组并检验。", "课标第 3 章 3.4 节", "B03 第 24-31 页"),
    ("T03", "不等式与不等式组", "能运用不等式性质求解；能在负数乘除时改变方向并求交集。", "课标第 3 章 3.5 节", "B05 第 8-15 页"),
]

INDICATORS = [
    ("T01", "I011", "列代数式与代入求值", "能表示数量关系并代入求值。"),
    ("T01", "I012", "同类项合并与去括号", "能识别同类项，正确去括号并化简。"),
    ("T01", "I013", "用整式解释具体问题", "能用整式解释具体数量关系。"),
    ("T02", "I021", "等式性质解一元一次方程", "能运用等式性质解方程并检验。"),
    ("T02", "I022", "消元法解二元一次方程组", "能选择合适的消元方式解方程组。"),
    ("T02", "I023", "列方程解决实际问题", "能根据实际限制列方程并检验解的合理性。"),
    ("T03", "I031", "不等式性质求解", "能运用不等式性质求解并说明理由。"),
    ("T03", "I032", "负数乘除变号", "能在负数乘除时正确处理不等号方向。"),
    ("T03", "I033", "解集交集与实际范围", "能求两个解集的交集并解释实际范围。"),
]


def _rubric(item_id: str, points: list[tuple[str, int]]) -> str:
    return "\n".join(f"{item_id}P{index} {text} {maximum} 分" for index, (text, maximum) in enumerate(points, 1))


ITEMS = [
    ("Q001", "T01", "I011", "填空题", "当 a=2，b=-3 时，求代数式 2a-b 的值。", "7", [("代入数值", 1), ("计算结果", 1)], 0.05),
    ("Q002", "T01", "I012", "解答题", "化简：3x+2y-5x+y，并说明合并同类项的依据。", "合并后为 -2x+3y", [("识别同类项", 1), ("正确合并", 1), ("写出依据", 1)], 0.10),
    ("Q003", "T01", "I013", "解答题", "用代数式表示：一个数的 3 倍与 5 的差。", "3n-5", [("设未知数", 1), ("列出整式", 1)], 0.05),
    ("Q004", "T02", "I021", "解答题", "解方程：2(x-3)=x+5，并检验。", "x=11", [("去括号", 1), ("移项合并", 1), ("检验", 1)], 0.18),
    ("Q005", "T02", "I022", "解答题", "解方程组：x+y=7，x-y=1。", "x=4，y=3", [("选择消元", 1), ("求得一个未知数", 1)], 0.20),
    ("Q006", "T02", "I023", "解答题", "某班买 3 支笔和 2 本本子共 19 元，笔每支 3 元，求本子单价。", "5 元", [("设未知数", 1), ("列方程", 1), ("检验", 1)], 0.22),
    ("Q007", "T03", "I031", "解答题", "解不等式：2x+1<7，并在数轴上表示解集。", "x<3", [("移项", 1), ("系数化 1", 1)], 0.15),
    ("Q008", "T03", "I032", "解答题", "解不等式：-2x>6，并说明变号理由。", "x<-3", [("正确变号", 1), ("说明理由", 1), ("表示解集", 1)], 0.28),
    ("Q009", "T03", "I033", "解答题", "求不等式组 x>1 且 x≤4 的整数解。", "2，3，4", [("求交集", 1), ("写出整数解", 1)], 0.12),
    ("Q010", "T02", "I021", "解答题", "解方程：3x-2=x+8，并检验。", "x=5", [("移项合并", 1), ("检验", 1)], 0.18),
    ("Q011", "T03", "I032", "解答题", "解不等式：-3x≥9，并说明变号理由。", "x≤-3", [("正确变号", 1), ("说明理由", 1)], 0.26),
    ("Q012", "T02", "I023", "解答题", "某班租车，4 辆小车和 2 辆大车共坐 32 人，小车每辆 5 人，求大车每辆人数。", "6 人", [("设未知数", 1), ("列方程", 1), ("检验", 1)], 0.20),
]

NODES = [
    ("N01", "第一次单元测验", "2026-09-18", "T01,T02", ["Q001", "Q002", "Q003", "Q004", "Q005", "Q006"]),
    ("N02", "第二次单元测验", "2026-10-16", "T02,T03", ["Q004", "Q005", "Q006", "Q007", "Q008", "Q009", "Q010", "Q011", "Q012"]),
]

CLASS_BIAS = {"C1": {"T02": -0.24}, "C2": {"T03": -0.26}}
NODE_BOOST = {("N02", "T02"): 0.14, ("N02", "T03"): 0.12}


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def split_points(earned: int, maxima: list[int]) -> list[int]:
    remaining = earned
    parts = []
    for maximum in maxima:
        take = min(maximum, remaining)
        parts.append(take)
        remaining -= take
    return parts


def build_rows() -> tuple[list[dict], dict[str, str], dict[str, int], dict[str, list[int]]]:
    rng = random.Random(SEED)
    ability = {student: rng.uniform(0.48, 0.92) for students in CLASSES.values() for student in students}
    item_by_id = {row[0]: row for row in ITEMS}
    rows: list[dict] = []
    record_index = 0
    for node, _, _, _, available in NODES:
        for class_id, students in CLASSES.items():
            for student in students:
                for item_id in available:
                    item = item_by_id[item_id]
                    topic = item[1]
                    difficulty = item[7]
                    bias = CLASS_BIAS.get(class_id, {}).get(topic, 0.0)
                    boost = NODE_BOOST.get((node, topic), 0.0)
                    probability = clamp(ability[student] + bias + boost - difficulty, 0.05, 1.0)
                    maximum = len(item[6])
                    earned = max(0, min(maximum, round(maximum * probability)))
                    points = split_points(earned, [point[1] for point in item[6]])
                    record_index += 1
                    rows.append(
                        {
                            "记录编号": f"R{record_index:04d}",
                            "学生编号": student,
                            "材料编号": item_id,
                            "节点编号": node,
                            "主题编号": topic,
                            "作答事件编号": f"E{record_index:04d}",
                            "修订版本": "1",
                            "评分状态": "已评分",
                            "得分": str(earned),
                            "满分": str(maximum),
                            "学生最终作答": f"作答要点：{item[5]}" if earned else "未写出有效步骤",
                            "解答过程": "；".join(
                                f"第{n}步：{point[0]}" for n, point in enumerate(item[6][: max(1, earned)], 1)
                            ),
                            "评分点得分": "；".join(
                                f"{item_id}P{n}={value}" for n, value in enumerate(points, 1)
                            ),
                        }
                    )
    return rows, ability, item_by_id, CLASSES


def inject_quality_cases(rows: list[dict], item_by_id: dict[str, tuple]) -> dict:
    pending = rows[10:16]
    for row in pending:
        row["评分状态"] = "待评分"
        row["得分"] = ""
        row["评分点得分"] = ""
        row["学生最终作答"] = ""

    unanswered = rows[40:45]
    for row in unanswered:
        row["评分状态"] = "未作答"
        row["得分"] = ""
        row["评分点得分"] = ""
        row["学生最终作答"] = ""
        row["解答过程"] = ""

    over_maximum = rows[70:72]
    for row in over_maximum:
        row["得分"] = str(int(row["满分"]) + 1)

    revised = []
    for index, row in enumerate(rows[20:24], 1):
        duplicate = dict(row)
        duplicate["记录编号"] = f"R9{index:03d}"
        duplicate["修订版本"] = "2"
        item = item_by_id[row["材料编号"]]
        maxima = [point[1] for point in item[6]]
        maximum = sum(maxima)
        earned = min(maximum, int(row["得分"] or 0) + 1)
        points = split_points(earned, maxima)
        duplicate["得分"] = str(earned)
        duplicate["评分点得分"] = "；".join(
            f"{row['材料编号']}P{position}={value}"
            for position, value in enumerate(points, 1)
        )
        revised.append(duplicate)
    rows.extend(revised)

    return {
        "pending": len(pending),
        "unanswered": len(unanswered),
        "over_maximum": len(over_maximum),
        "revised_events": len(revised),
    }


def write_csv(path: Path, header: list[str], rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=header, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def main() -> None:
    rows, ability, item_by_id, classes = build_rows()
    injected = inject_quality_cases(rows, item_by_id)

    course_rows = [
        {
            "主题编号": topic,
            "主题名称": name,
            "指标编号": indicator,
            "观察指标": indicator_name,
            "学习要求": requirement,
            "课标定位": curriculum,
            "教材定位": textbook,
        }
        for topic, name, requirement, curriculum, textbook in TOPICS
        for indicator_topic, indicator, indicator_name, indicator_requirement in INDICATORS
        if indicator_topic == topic
    ]
    item_rows = [
        {
            "材料编号": item_id,
            "主题编号": topic,
            "指标编号": indicator,
            "材料类型": item_type,
            "题干或内容": prompt,
            "答案或解析": answer,
            "满分": str(len(points)),
            "评分点": _rubric(item_id, points),
            "来源": f"演示教材 B0{topic[-1]} 单元练习",
        }
        for item_id, topic, indicator, item_type, prompt, answer, points, _ in ITEMS
    ]
    student_rows = [
        {"学生编号": student, "姓名": f"学生{student[-2:]}", "模拟班级编号": class_id}
        for class_id, students in CLASSES.items()
        for student in students
    ]
    node_rows = [
        {
            "节点编号": node,
            "节点名称": name,
            "模拟测验日期": date,
            "已教主题": taught,
            "可用题目编号": ",".join(available),
        }
        for node, name, date, taught, available in NODES
    ]
    field_rows = [
        {"数据表": "课程要求", "字段名": "主题编号", "类型": "文本", "含义": "课程主题稳定编号", "示例": "T01"},
        {"数据表": "课程要求", "字段名": "指标编号", "类型": "文本", "含义": "观察指标稳定编号", "示例": "I011"},
        {"数据表": "题目与材料", "字段名": "材料编号", "类型": "文本", "含义": "题目稳定编号", "示例": "Q001"},
        {"数据表": "模拟学生", "字段名": "学生编号", "类型": "文本", "含义": "合成学生编号", "示例": "D01"},
        {"数据表": "测验节点", "字段名": "可用题目编号", "类型": "文本", "含义": "该节点可用题目，逗号分隔", "示例": "Q001,Q002"},
        {"数据表": "作答记录", "字段名": "评分状态", "类型": "枚举", "含义": "已评分/待评分/未作答", "示例": "已评分"},
        {"数据表": "作答记录", "字段名": "评分点得分", "类型": "文本", "含义": "形如 Q001P1=1 的逐点得分", "示例": "Q001P1=1;Q001P2=0"},
    ]

    write_csv(CSV_DIR / "课程要求.csv", list(course_rows[0]), course_rows)
    write_csv(CSV_DIR / "题目与材料.csv", list(item_rows[0]), item_rows)
    write_csv(CSV_DIR / "模拟学生.csv", list(student_rows[0]), student_rows)
    write_csv(CSV_DIR / "测验节点.csv", list(node_rows[0]), node_rows)
    write_csv(CSV_DIR / "作答记录.csv", list(rows[0]), rows)
    write_csv(CSV_DIR / "字段说明.csv", list(field_rows[0]), field_rows)

    scored = [row for row in rows if row["评分状态"] == "已评分"]
    manifest = {
        "dataset": "smart-learning-demo",
        "version": "2026.11.1",
        "generator": "scripts/demo/build-demo-data.py",
        "seed": SEED,
        "synthetic": True,
        "note": "全部学生与作答均为合成数据，不含真实学生个人信息。",
        "classes": {class_id: students for class_id, students in classes.items()},
        "indicators": [{"topic_id": topic, "indicator_id": indicator, "name": name} for topic, indicator, name, _ in INDICATORS],
        "nodes": [node for node, _, _, _, _ in NODES],
        "items": [item_id for item_id, *_ in ITEMS],
        "expected": {
            "student_count": len(student_rows),
            "class_count": len(CLASSES),
            "node_count": len(NODES),
            "item_count": len(ITEMS),
            "indicator_count": len(INDICATORS),
            "raw_rows": len(rows),
            "scored_rows": len(scored),
            "pending_rows": injected["pending"],
            "unanswered_rows": injected["unanswered"],
            "over_maximum_rows": injected["over_maximum"],
            "revised_events": injected["revised_events"],
            "total_maximum": sum(int(row["满分"]) for row in scored),
            "total_score": sum(int(row["得分"]) for row in scored),
        },
        "design_notes": [
            "C1 在 T02（方程）上偏弱，C2 在 T03（不等式）上偏弱，用于演示班级共同问题。",
            "N02 相对 N01 在薄弱主题上有提升，用于演示教学调整后的复测比较。",
            "含待评分、未作答、超满分与多版本修订记录；这些记录不按 0 分处理。",
            "至少 6 名学生有足够证据可完成案例确认。",
        ],
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(manifest["expected"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
