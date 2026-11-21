"""Generate evidence-cited, per-indicator mapping candidates with an LLM."""

from __future__ import annotations

import hashlib
import json

PROMPT_VERSION = "indicator-mapping-2026.11.1"


def _response_text(response: dict) -> str:
    try:
        return response["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise ValueError("映射模型响应结构无效") from exc


def _references(run: dict, sources, indicator_id: str) -> tuple[list[dict], str]:
    entry = next(
        (
            row
            for row in run.get("source_index", [])
            if row.get("indicator_id") == indicator_id
        ),
        None,
    )
    if entry is None:
        raise ValueError("指标编号不存在")
    refs = []
    objective = next(
        row for row in run["objectives"] if row.get("指标编号") == indicator_id
    )
    refs.append(
        {
            "ref_id": "objective",
            "source": "课程要求.csv",
            "line": objective.get("_source_line"),
            "text": objective,
        }
    )
    for index, item in enumerate(run.get("items", []), 1):
        if item.get("指标编号") == indicator_id:
            refs.append(
                {
                    "ref_id": f"item-{index}",
                    "source": "题目与材料.csv",
                    "line": item.get("_source_line"),
                    "text": item,
                }
            )
    source_check = entry.get("source_check", {})
    names = ["课程标准_2022.pdf", *source_check.get("textbook_slices", [])]
    for name in names:
        inspection = sources.inspect_pdf(run, name)
        if not inspection.get("available") or not inspection.get("page_count"):
            continue
        pages = inspection.get("text_pages", [])[:20]
        for page in sources.extract_pages(run, name, pages):
            refs.append(
                {
                    "ref_id": f"pdf-{len(refs) + 1}",
                    "source": name,
                    "page": page["page"],
                    "text": page["text"],
                }
            )
    fingerprint = hashlib.sha256(
        json.dumps(
            {"run": run["run_id"], "indicator": indicator_id, "refs": refs},
            ensure_ascii=False,
            sort_keys=True,
            default=str,
        ).encode()
    ).hexdigest()
    return refs, fingerprint


def mapping_is_current(run: dict, sources, mapping: dict) -> bool:
    """Invalidate candidates when any cited source input has changed."""
    try:
        _refs, fingerprint = _references(run, sources, mapping["indicator_id"])
    except (KeyError, ValueError, StopIteration):
        return False
    return fingerprint == mapping.get("input_fingerprint")


def generate_indicator_mapping(
    run: dict, sources, llm_client, indicator_id: str
) -> dict:
    refs, fingerprint = _references(run, sources, indicator_id)
    if llm_client is None:
        raise ValueError("未配置文本模型；没有发送映射请求")
    if not any(ref["source"].endswith(".pdf") for ref in refs):
        raise ValueError("当前指标没有可用 OCR 原文；请先显式识别来源 PDF")
    body = {
        "model": getattr(llm_client, "model", None) or "deepseek-chat",
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": '你是课程目标与测验材料映射助手。只根据给定来源生成 JSON。每条关系必须引用 ref_id 和原文 excerpt；不得补充来源中没有的教学事实。输出 {"mappings":[{"material_id":string,"relation":"assesses"|"supports","explanation":string,"evidence":[{"ref_id":string,"excerpt":string}]}]}。',
            },
            {
                "role": "user",
                "content": json.dumps(
                    {"indicator_id": indicator_id, "sources": refs}, ensure_ascii=False
                ),
            },
        ],
    }
    try:
        candidate = json.loads(_response_text(llm_client.complete(body)))
    except json.JSONDecodeError as exc:
        raise ValueError("映射模型未返回有效 JSON") from exc
    return validate_mapping_candidate(candidate, indicator_id, run, refs, fingerprint)


def validate_mapping_candidate(
    candidate: dict, indicator_id: str, run: dict, refs: list[dict], fingerprint: str
) -> dict:
    if not isinstance(candidate, dict) or not isinstance(
        candidate.get("mappings"), list
    ):
        raise ValueError("映射结果结构无效")
    known_items = {str(item.get("材料编号")) for item in run.get("items", [])}
    reference_map = {row["ref_id"]: row for row in refs}
    validated, errors = [], []
    for index, row in enumerate(candidate["mappings"]):
        if not isinstance(row, dict):
            errors.append(f"mapping_{index}:not_object")
            continue
        material_id = str(row.get("material_id", ""))
        if material_id not in known_items:
            errors.append(f"mapping_{index}:unknown_material")
            continue
        evidence = []
        for citation in row.get("evidence", []):
            local = (
                reference_map.get(citation.get("ref_id"))
                if isinstance(citation, dict)
                else None
            )
            excerpt = citation.get("excerpt", "") if isinstance(citation, dict) else ""
            local_text = (
                json.dumps(local["text"], ensure_ascii=False)
                if local and isinstance(local["text"], dict)
                else str(local.get("text", ""))
                if local
                else ""
            )
            if (
                not local
                or not isinstance(excerpt, str)
                or not excerpt.strip()
                or excerpt not in local_text
            ):
                errors.append(f"mapping_{index}:invalid_evidence")
                continue
            evidence.append(
                {
                    "ref_id": local["ref_id"],
                    "source": local["source"],
                    "page": local.get("page"),
                    "line": local.get("line"),
                    "excerpt": excerpt,
                }
            )
        if (
            row.get("relation") not in {"assesses", "supports"}
            or not row.get("explanation")
            or not evidence
        ):
            errors.append(f"mapping_{index}:insufficient_basis")
        validated.append(
            {
                "material_id": material_id,
                "indicator_id": indicator_id,
                "relation": row.get("relation"),
                "explanation": str(row.get("explanation", "")),
                "evidence": evidence,
                "status": "usable"
                if evidence and row.get("relation") in {"assesses", "supports"}
                else "needs_resolution",
            }
        )
    return {
        "indicator_id": indicator_id,
        "prompt_version": PROMPT_VERSION,
        "input_fingerprint": fingerprint,
        "mappings": validated,
        "validation_errors": errors,
        "status": "usable"
        if validated
        and all(row["status"] == "usable" for row in validated)
        and not errors
        else "needs_resolution",
    }
