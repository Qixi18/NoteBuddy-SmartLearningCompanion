"""班级教学方案的规则生成、来源指纹与过期判断。

只使用真实班级诊断报告中的数据：没有有效评分记录时不生成方案，也不补造数字。
模型服务不可用时，规则方案仍可完整走完生成 → 教师审核 → 版本保存。
"""

from __future__ import annotations

import hashlib
import json

PLAN_TEMPLATE_VERSION = "1"


def _percent(value: float | None) -> str:
    return "无可比数据" if value is None else f"{value * 100:.1f}%"


def _objective_name(run: dict, indicator_id: str) -> str:
    for row in run.get("objectives", []):
        if row.get("指标编号") == indicator_id:
            name = row.get("观察指标") or row.get("指标名称") or row.get("名称")
            if name:
                return str(name)
    return indicator_id


def _class_student_count(report: dict, class_id: str) -> int:
    for row in report.get("classes", []):
        if row.get("class_id") == class_id:
            return int(row.get("student_count") or 0)
    return 0


def class_indicator_rows(
    run: dict, report: dict, class_id: str, *, limit: int = 3
) -> list[dict]:
    """取当前班级在本次测验下、有有效评分记录的指标，按得分率从低到高排序。"""
    student_count = _class_student_count(report, class_id)
    rows: list[dict] = []
    for comparison in report.get("comparisons", []):
        class_row = next(
            (
                row
                for row in comparison.get("classes", [])
                if row.get("class_id") == class_id
            ),
            None,
        )
        if class_row is None or not class_row.get("scored_record_count"):
            continue
        rows.append(
            {
                "indicator_id": comparison.get("indicator_id", ""),
                "indicator_name": _objective_name(run, comparison.get("indicator_id", "")),
                "ratio": class_row.get("ratio"),
                "common_ratio": class_row.get("common_ratio"),
                "common_material_ids": list(comparison.get("common_material_ids") or []),
                "common_status": comparison.get("status", ""),
                "scored_record_count": int(class_row.get("scored_record_count") or 0),
                "observed_student_count": int(class_row.get("observed_student_count") or 0),
                "student_count": student_count,
            }
        )
    rows.sort(key=lambda row: (row["ratio"] is None, row["ratio"] or 0.0))
    return rows[:limit]


def source_versions_for(run: dict, sources: dict | None, indicator_ids: list[str]) -> dict:
    """每个指标当前来源核验版本；未核验的指标不虚构版本号。"""
    versions: dict[str, int] = {}
    for indicator_id in indicator_ids:
        history = (sources or {}).get(indicator_id, [])
        if not history:
            continue
        latest = history[-1]
        if latest.get("status") == "verified" and not latest.get("stale"):
            versions[indicator_id] = int(latest.get("version") or 0)
    return versions


def class_plan_fingerprint(
    run: dict,
    class_id: str,
    node_id: str,
    rows: list[dict],
    source_versions: dict,
    analysis_id: str = "",
) -> str:
    payload = {
        "run_id": run.get("run_id", ""),
        "input_fingerprint": run.get("input_fingerprint"),
        "class_id": class_id,
        "node_id": node_id,
        "template_version": PLAN_TEMPLATE_VERSION,
        "analysis_id": analysis_id,
        "indicators": [
            {
                "indicator_id": row["indicator_id"],
                "ratio": row["ratio"],
                "common_ratio": row["common_ratio"],
                "scored_record_count": row["scored_record_count"],
                "observed_student_count": row["observed_student_count"],
                "student_count": row["student_count"],
                "common_material_ids": row["common_material_ids"],
            }
            for row in rows
        ],
        "source_versions": source_versions,
    }
    return hashlib.sha256(
        json.dumps(payload, ensure_ascii=False, sort_keys=True, default=str).encode("utf-8")
    ).hexdigest()


def build_plan_body(run: dict, class_id: str, node_id: str, rows: list[dict]) -> dict:
    objectives: list[str] = []
    problems: list[str] = []
    actions: list[str] = []
    differentiated: list[str] = []
    resources: list[str] = []
    observations: list[str] = []
    conditions: list[str] = []

    for row in rows:
        name = row["indicator_name"]
        ratio = row["ratio"]
        pct = _percent(ratio)
        target = f"{name}（{row['indicator_id']}）"
        objectives.append(
            f"提升「{target}」的班级整体掌握水平：当前全题集得分率 {pct}，本方案以共同问题为抓手安排一次集中教学。"
        )
        coverage = (
            f"有效评分 {row['scored_record_count']} 条，覆盖 "
            f"{row['observed_student_count']}/{row['student_count']} 名学生"
            if row["student_count"]
            else f"有效评分 {row['scored_record_count']} 条"
        )
        problems.append(
            f"「{target}」当前测验范围内 {coverage}，全题集得分率 {pct}；"
            "只描述本次记录范围内的表现，不代表稳定能力等级或班级排名。"
        )
        materials = row["common_material_ids"]
        practice = "、".join(materials) if materials else "本班本次已作答的同指标题目"
        actions.append(
            f"以 {practice} 为题组，按「典型错误归类 → 教师示范一步 → 学生复述方法 → 独立重做同型题」四步推进，"
            f"每个环节留出即时反馈。"
        )
        if row["student_count"] and row["observed_student_count"] < row["student_count"]:
            missing = row["student_count"] - row["observed_student_count"]
            differentiated.append(
                f"对本次没有有效评分记录的 {missing} 名学生先安排同题观察或补做，再决定是否进入同一练习；"
                "缺失记录不视为未掌握。"
            )
        if materials:
            resources.append(f"「{name}」共同题目：{'、'.join(materials)}")
        else:
            resources.append(
                f"「{name}」本次没有跨班共同题目，使用本班已作答的同指标题目组织重练。"
            )
        observations.append(
            f"复测时只比较「{target}」同一指标、同一题组的得分率是否高于本次 {pct}，并记录有效评分条数。"
        )
        if ratio is None:
            conditions.append(f"「{target}」当前缺少有效评分，先补充观察再决定教学强度。")
        else:
            higher = min(ratio + 0.1, 1.0)
            conditions.append(
                f"若「{target}」复测得分率仍低于 {pct}，缩小到单一评分点重新讲解；"
                f"达到或超过 {_percent(higher)} 则转入迁移应用题。"
            )

    return {
        "teaching_objectives": objectives,
        "key_problems": problems,
        "teaching_actions": actions,
        "differentiated_actions": differentiated,
        "resource_recommendations": resources,
        "observation_points": observations,
        "adjustment_conditions": conditions,
    }


def build_evidence_refs(class_id: str, node_id: str, rows: list[dict]) -> list[dict]:
    refs: list[dict] = []
    for row in rows:
        refs.append(
            {
                "kind": "class_indicator",
                "class_id": class_id,
                "node_id": node_id,
                "indicator_id": row["indicator_id"],
                "indicator_name": row["indicator_name"],
                "ratio": row["ratio"],
                "common_ratio": row["common_ratio"],
                "scored_record_count": row["scored_record_count"],
                "observed_student_count": row["observed_student_count"],
                "student_count": row["student_count"],
                "common_material_ids": list(row["common_material_ids"]),
            }
        )
        for material_id in row["common_material_ids"]:
            refs.append(
                {
                    "kind": "material",
                    "class_id": class_id,
                    "node_id": node_id,
                    "indicator_id": row["indicator_id"],
                    "material_id": material_id,
                }
            )
    return refs


def build_issue_evidence_refs(
    issues: list[dict] | None, class_id: str, node_id: str
) -> list[dict]:
    """把已核验共性问题及其原始作答记录纳入方案证据（记录级可追溯）。"""
    refs: list[dict] = []
    for issue in issues or []:
        for row in issue.get("by_class", []):
            if row.get("class_id") != class_id or not row.get("affected_count"):
                continue
            refs.append(
                {
                    "kind": "class_issue",
                    "class_id": class_id,
                    "node_id": node_id,
                    "indicator_id": issue.get("indicator_id", ""),
                    "issue_id": issue.get("issue_id", ""),
                    "label": issue.get("label", ""),
                    "affected_count": row.get("affected_count", 0),
                    "observed_student_count": row.get("observed_student_count", 0),
                }
            )
            for evidence in row.get("evidence_refs", []):
                refs.append(
                    {
                        "kind": "response",
                        "class_id": class_id,
                        "node_id": node_id,
                        "indicator_id": issue.get("indicator_id", ""),
                        "record_id": evidence.get("record_id"),
                        "source_line": evidence.get("source_line"),
                        "material_id": evidence.get("material_id"),
                    }
                )
    return refs


def _ai_reference_lines(findings: list[dict] | None) -> list[str]:
    lines: list[str] = []
    for finding in findings or []:
        claim = str(finding.get("claim") or "").strip()
        if not claim:
            continue
        support = str(finding.get("support_level") or "").strip()
        suffix = f"（支持程度 {support}）" if support else ""
        lines.append(f"AI 参考观察，需教师核对{suffix}：{claim}")
        if len(lines) >= 3:
            break
    return lines


def build_rule_plan(
    run: dict,
    class_id: str,
    node_id: str,
    report: dict,
    sources: dict | None,
    *,
    issues: list[dict] | None = None,
    ai_findings: list[dict] | None = None,
    ai_analysis_id: str = "",
    ai_fingerprint: str = "",
) -> dict:
    """生成班级方案草稿。没有有效证据时直接报错，不生成空话方案。

    - 当前班级证据构成方案主体（规则）；
    - 若存在当前指纹一致的班级 AI 分析，则把其结论作为「AI 参考观察」写入方案，
      并标记 generation_source=ai、记录 analysis_id；
    - 已核验共性问题及其原始作答记录进入 evidence_refs，保证记录级可追溯。
    """
    rows = class_indicator_rows(run, report, class_id)
    if not rows:
        raise ValueError(
            "当前班级在该测验节点没有有效评分记录，无法生成有依据的班级教学方案。"
            "请先在班级诊断页确认数据范围。"
        )
    source_versions = source_versions_for(
        run, sources, [row["indicator_id"] for row in rows]
    )
    body = build_plan_body(run, class_id, node_id, rows)
    ai_lines = _ai_reference_lines(ai_findings)
    if ai_lines:
        body["key_problems"] = [*body["key_problems"], *ai_lines]
    evidence_refs = build_evidence_refs(class_id, node_id, rows)
    evidence_refs.extend(build_issue_evidence_refs(issues, class_id, node_id))
    if ai_analysis_id:
        evidence_refs.append(
            {
                "kind": "ai_analysis",
                "class_id": class_id,
                "node_id": node_id,
                "analysis_id": ai_analysis_id,
                "source_fingerprint": ai_fingerprint,
            }
        )
    return {
        "run_id": run["run_id"],
        "class_id": class_id,
        "node_id": node_id,
        "status": "draft",
        "generation_source": "ai" if ai_lines else "rule",
        "source_fingerprint": class_plan_fingerprint(
            run, class_id, node_id, rows, source_versions, ai_analysis_id
        ),
        "analysis_id": ai_analysis_id,
        "reviewer": "",
        "review_reason": "",
        "plan": body,
        "evidence_refs": evidence_refs,
        "source_versions": source_versions,
    }


def current_class_plan_fingerprint(
    run: dict,
    class_id: str,
    node_id: str,
    report: dict,
    sources: dict | None,
    analysis_id: str = "",
) -> str:
    rows = class_indicator_rows(run, report, class_id)
    source_versions = source_versions_for(
        run, sources, [row["indicator_id"] for row in rows]
    )
    return class_plan_fingerprint(
        run, class_id, node_id, rows, source_versions, analysis_id
    )
