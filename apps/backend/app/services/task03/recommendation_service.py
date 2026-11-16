"""确定性建议基线与可选的 DeepSeek 草稿。"""

from __future__ import annotations

import json
import os
import re

from ...config import settings
from ...infrastructure.llm.deepseek_client import DeepSeekClientError, complete


def _evidence(
    run: dict, student_id: str, indicator_id: str
) -> tuple[dict | None, list]:
    key = f"{student_id}:{indicator_id}"
    metric = next(
        (
            m
            for m in run["metrics"]
            if m["kind"] == "student_indicator" and m["key"] == key
        ),
        None,
    )
    item_ids = {r["材料编号"] for r in run["items"] if r["指标编号"] == indicator_id}
    records = [
        r
        for r in run["responses"]
        if r["学生编号"] == student_id and r["材料编号"] in item_ids
    ]
    return metric, records


def draft(run: dict, student_id: str, indicator_id: str) -> dict:
    metric, records = _evidence(run, student_id, indicator_id)
    objective = next(
        (r for r in run["objectives"] if r["指标编号"] == indicator_id), None
    )
    if objective is None:
        raise ValueError("指标不存在")
    if student_id not in {r["学生编号"] for r in run["students"]}:
        raise ValueError("学生不存在")
    materials = [
        r
        for r in run["items"]
        if r["指标编号"] == indicator_id and r.get("材料类型") == "题目"
    ]
    item_id = materials[0]["材料编号"] if materials else None
    material_name = (
        f"题目 {item_id}" if item_id else f"指标 {indicator_id} 对应教材内容"
    )
    eligible_ids = set(metric["record_ids"]) if metric else set()
    missing_points = sorted(
        {
            point
            for row in records
            if row["记录编号"] in eligible_ids
            for point, score in re.findall(
                r"([A-Z]+\d+P\d+)\s*=\s*([0-9]+(?:\.[0-9]+)?)",
                row.get("评分点得分", ""),
            )
            if float(score) == 0
        }
    )
    if metric is None:
        diagnosis = "该指标暂无有效已评分记录，不能判断是否掌握。"
        recommendation = f"先安排 {material_name} 作为诊断练习，记录独立作答过程，再决定讲解与巩固顺序。"
        condition = "获得可评分的作答后重新分析。"
    elif metric["ratio"] < 0.6:
        diagnosis = f"该指标现有有效记录得分 {metric['score']}/{metric['maximum']}；需结合具体失分步骤复核。"
        recommendation = f"先回看对应教材示例，再做 {material_name}；先提示数量关系或关键运算步骤，最后让学生自行核对。"
        condition = (
            "若独立完成基础题，再安排变式；若仍在同一步骤失分，继续针对该步骤讲解。"
        )
    else:
        diagnosis = f"该指标现有有效记录得分 {metric['score']}/{metric['maximum']}；表现范围仅限已有题目。"
        recommendation = f"以 {material_name} 为起点安排同指标变式或情境迁移题，要求学生解释方法并核对结果。"
        condition = "若变式失分，回到对应概念或步骤进行观察。"
    if missing_points:
        diagnosis += " 评分点记录中需复核：" + "、".join(missing_points) + "。"
    return {
        "student_id": student_id,
        "indicator_id": indicator_id,
        "objective": objective["观察指标"],
        "diagnosis": diagnosis,
        "recommendation": recommendation,
        "adjustment_condition": condition,
        "material_ids": [item_id] if item_id else [],
        "score_points_to_review": missing_points,
        "observation_point": "观察学生能否独立说明关键步骤、核对结果，并记录提示后表现。",
        "evidence_record_ids": metric["record_ids"] if metric else [],
        "observed_record_ids": [r["记录编号"] for r in records],
        "source": "rule",
        "status": "needs_review",
        "prompt_version": None,
        "model": None,
    }


def deepseek_draft(
    run: dict,
    student_id: str,
    indicator_id: str,
    api_key: str | None = None,
    model: str | None = None,
) -> dict:
    baseline = draft(run, student_id, indicator_id)
    key = (
        api_key
        if api_key is not None
        else settings.deepseek_api_key or os.getenv("DEEPSEEK_API_KEY", "")
    )
    if not key:
        raise ValueError("未配置 DEEPSEEK_API_KEY")
    selected_model = model or os.getenv("DEEPSEEK_MODEL", settings.deepseek_model)
    metric, records = _evidence(run, student_id, indicator_id)
    allowed = set(baseline["evidence_record_ids"])
    evidence = [
        {
            "record_id": r["记录编号"],
            "item_id": r["材料编号"],
            "score": r["得分"],
            "maximum": r["满分"],
            "steps": r["解答过程"],
            "rubric_scores": r["评分点得分"],
        }
        for r in records
        if r["记录编号"] in allowed
    ]
    body = {
        "model": selected_model,
        "response_format": {"type": "json_object"},
        "max_tokens": 1200,
        "messages": [
            {
                "role": "system",
                "content": "你是七年级数学教学助手。只根据输入证据提出诊断和分步学习建议；不得虚构记录或直接给出练习答案。返回JSON对象，字段为diagnosis、recommendation、adjustment_condition、evidence_record_ids。",
            },
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "objective": baseline["objective"],
                        "baseline": baseline,
                        "metric": metric,
                        "evidence": evidence,
                    },
                    ensure_ascii=False,
                ),
            },
        ],
    }
    output = complete(body, key, timeout=30)
    choices = output.get("choices")
    if (
        not isinstance(choices, list)
        or not choices
        or not isinstance(choices[0], dict)
        or not isinstance(choices[0].get("message"), dict)
    ):
        raise DeepSeekClientError("invalid response")
    choice = choices[0]
    if (
        choice.get("finish_reason") != "stop"
        or not str(choice["message"].get("content") or "").strip()
    ):
        raise DeepSeekClientError("incomplete response")
    try:
        candidate = json.loads(choice["message"]["content"])
    except (TypeError, json.JSONDecodeError) as exc:
        raise DeepSeekClientError("invalid content") from exc
    if not isinstance(candidate, dict):
        raise DeepSeekClientError("invalid content")
    cited = candidate.get("evidence_record_ids", [])
    if (
        not isinstance(cited, list)
        or any(not isinstance(record_id, str) for record_id in cited)
        or not set(cited).issubset(allowed)
    ):
        raise DeepSeekClientError("模型返回了无效证据引用")
    if allowed and not cited:
        raise DeepSeekClientError("模型未引用证据")
    for field in ("diagnosis", "recommendation", "adjustment_condition"):
        if not isinstance(candidate.get(field), str) or not candidate[field].strip():
            raise DeepSeekClientError(f"模型缺少 {field}")
    return {
        **baseline,
        **{
            field: candidate[field]
            for field in ("diagnosis", "recommendation", "adjustment_condition")
        },
        "evidence_record_ids": cited,
        "source": "deepseek",
        "model": body["model"],
        "prompt_version": "1",
    }
