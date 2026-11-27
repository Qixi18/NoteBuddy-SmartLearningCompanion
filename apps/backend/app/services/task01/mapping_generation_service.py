"""Generate evidence-cited, per-indicator mapping candidates with an LLM."""

from __future__ import annotations

import hashlib
import json
import re

from .machine_verification_service import (
    CURRICULUM_FILE,
    indicator_keywords,
    page_match,
)

PROMPT_VERSION = "indicator-mapping-2026.11.2"
# 每份教材切片最多取多少页原文作为映射输入（按关键词相关度排序后截断）。
MAX_SLICE_PAGES = 6


def _response_text(response: dict) -> str:
    try:
        return response["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise ValueError("映射模型响应结构无效") from exc


def _curriculum_target_pages(objective: dict, source_check: dict) -> list[int]:
    """课标必须读到的页：CSV 登记的文件页，必要时带上前后一页供模型理解上下文。"""
    target = None
    locator = str(objective.get("课标文件页／正文页", "") or "")
    match = re.match(r"\s*(\d+)", locator)
    if match:
        target = int(match.group(1))
    elif isinstance(source_check.get("curriculum_file_page"), int):
        target = source_check["curriculum_file_page"]
    if target is None:
        return []
    return [page for page in (target - 1, target, target + 1) if page >= 1]


def _slice_pages(sources, run: dict, name: str, keywords: list[str]) -> list[int]:
    """按关键词相关度挑选切片页，而不是永远只看文件最前面 20 页。"""
    inspection = sources.inspect_pdf(run, name)
    text_pages = list(inspection.get("text_pages") or [])
    if not text_pages:
        return []
    extracted = sources.extract_pages(run, name, text_pages[:20])
    scored = [
        (len(page_match(str(page.get("text", "")), keywords)["matched"]), page["page"])
        for page in extracted
    ]
    scored.sort(key=lambda item: (-item[0], item[1]))
    chosen = [page for score, page in scored if score > 0][:MAX_SLICE_PAGES]
    if not chosen:
        chosen = text_pages[:2]
    return sorted(chosen)


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
    names = [CURRICULUM_FILE, *source_check.get("textbook_slices", [])]
    keywords = indicator_keywords(str(objective.get("观察指标", "")))
    for name in names:
        inspection = sources.inspect_pdf(run, name)
        if not inspection.get("available") or not inspection.get("page_count"):
            continue
        if name == CURRICULUM_FILE:
            # 关键修正：课标只读登记页与其相邻页，而不是文件最前面 20 个有文本页。
            pages = _curriculum_target_pages(objective, source_check)
        else:
            pages = _slice_pages(sources, run, name, keywords)
        for page in sources.extract_pages(run, name, pages or []):
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


def build_mapping_preview(
    run: dict, sources, provider: str, model: str, indicator_ids: list[str]
) -> dict:
    """Describe exactly what a confirmed mapping request will send to a model."""
    input_fingerprints = []
    source_ranges: dict[str, dict[str, set[int]]] = {}
    input_bytes = 0
    for indicator_id in indicator_ids:
        refs, fingerprint = _references(run, sources, indicator_id)
        input_fingerprints.append((indicator_id, fingerprint))
        input_bytes += len(
            json.dumps(refs, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        )
        for ref in refs:
            ranges = source_ranges.setdefault(
                ref["source"], {"pages": set(), "lines": set()}
            )
            if isinstance(ref.get("page"), int):
                ranges["pages"].add(ref["page"])
            if isinstance(ref.get("line"), int):
                ranges["lines"].add(ref["line"])
    fingerprint = hashlib.sha256(
        json.dumps(
            {"run_id": run.get("run_id"), "inputs": input_fingerprints},
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest()
    source_files = []
    for name, ranges in sorted(source_ranges.items()):
        source_file = {"name": name}
        if ranges["pages"]:
            source_file["pages"] = sorted(ranges["pages"])
        if ranges["lines"]:
            source_file["lines"] = sorted(ranges["lines"])
        source_files.append(source_file)
    return {
        "run_id": run.get("run_id", ""),
        "indicator_ids": indicator_ids,
        "provider": provider,
        "model": model,
        "billing_unit": "input_output_tokens",
        "cache_behavior": "each_request_is_billable",
        "source_files": source_files,
        "source_count": len(source_ranges),
        "input_bytes": input_bytes,
        "fingerprint": fingerprint,
    }


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
                "content": (
                    "你是课程目标与测验材料映射助手。只根据给定来源生成 JSON。"
                    "每条关系必须引用 ref_id 和原文 excerpt；不得补充来源中没有的教学事实，"
                    "不得编造页码或材料编号。输出 "
                    '{"mappings":[{"material_id":string,"relation":"assesses"|"supports",'
                    '"explanation":string,"evidence":[{"ref_id":string,"excerpt":string}]}],'
                    '"curriculum_evidence":[{"ref_id":string,"excerpt":string}],'
                    '"textbook_evidence":[{"ref_id":string,"excerpt":string}],'
                    '"limitations":[string]}。'
                    "curriculum_evidence 只能引用课程标准 PDF 的页，textbook_evidence 只能引用教材切片页；"
                    "找不到依据时留空数组并在 limitations 说明。"
                ),
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


def _validate_evidence_list(
    rows, reference_map: dict, allowed_source, label: str
) -> tuple[list[dict], list[str]]:
    """校验模型给出的课标/教材证据：ref_id 必须真实存在，excerpt 必须能在原文中找到。"""
    validated: list[dict] = []
    errors: list[str] = []
    for index, row in enumerate(rows if isinstance(rows, list) else []):
        if not isinstance(row, dict):
            errors.append(f"{label}_{index}:not_object")
            continue
        local = reference_map.get(row.get("ref_id"))
        excerpt = row.get("excerpt", "")
        if not local or not isinstance(excerpt, str) or not excerpt.strip():
            errors.append(f"{label}_{index}:invalid_evidence")
            continue
        if not allowed_source(local.get("source", "")):
            errors.append(f"{label}_{index}:wrong_source")
            continue
        local_text = str(local.get("text", ""))
        if excerpt not in local_text:
            errors.append(f"{label}_{index}:excerpt_not_found")
            continue
        validated.append(
            {
                "ref_id": local["ref_id"],
                "source": local["source"],
                "page": local.get("page"),
                "line": local.get("line"),
                "excerpt": excerpt,
            }
        )
    return validated, errors


def validate_mapping_candidate(
    candidate: dict, indicator_id: str, run: dict, refs: list[dict], fingerprint: str
) -> dict:
    if not isinstance(candidate, dict) or not isinstance(
        candidate.get("mappings"), list
    ):
        raise ValueError("映射结果结构无效")
    item_ref_by_material = {
        str(item.get("材料编号")): f"item-{index}"
        for index, item in enumerate(run.get("items", []), 1)
        if item.get("指标编号") == indicator_id and item.get("材料编号")
    }
    known_items = {
        str(item.get("材料编号"))
        for item in run.get("items", [])
        if item.get("材料编号")
    }
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
        expected_item_ref = item_ref_by_material.get(material_id)
        if expected_item_ref is None:
            errors.append(f"mapping_{index}:indicator_mismatch")
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
        item_link_evidence = any(
            citation["ref_id"] == expected_item_ref for citation in evidence
        )
        if not item_link_evidence:
            errors.append(f"mapping_{index}:item_link_evidence_missing")
        if (
            row.get("relation") not in {"assesses", "supports"}
            or not row.get("explanation")
            or not evidence
        ):
            errors.append(f"mapping_{index}:insufficient_basis")
        relation_valid = (
            item_link_evidence
            and bool(evidence)
            and row.get("relation") in {"assesses", "supports"}
            and bool(str(row.get("explanation", "")).strip())
        )
        validated.append(
            {
                "material_id": material_id,
                "indicator_id": indicator_id,
                "relation": row.get("relation"),
                "explanation": str(row.get("explanation", "")),
                "evidence": evidence,
                "relationship_check": {
                    "status": "passed" if relation_valid else "needs_resolution",
                    "method": "official_indicator_item_binding",
                    "detail": "材料编号和指标关联来自当前运行 CSV，且关系引用了该题目行。",
                },
                "status": "usable" if relation_valid else "needs_resolution",
            }
        )
    curriculum_evidence, curriculum_errors = _validate_evidence_list(
        candidate.get("curriculum_evidence"),
        reference_map,
        lambda source: source == CURRICULUM_FILE,
        "curriculum_evidence",
    )
    textbook_evidence, textbook_errors = _validate_evidence_list(
        candidate.get("textbook_evidence"),
        reference_map,
        lambda source: source.endswith(".pdf") and source != CURRICULUM_FILE,
        "textbook_evidence",
    )
    limitations = [
        str(item).strip()
        for item in (candidate.get("limitations") or [])
        if str(item).strip()
    ][:10]
    return {
        "indicator_id": indicator_id,
        "prompt_version": PROMPT_VERSION,
        "input_fingerprint": fingerprint,
        "mappings": validated,
        # 模型只能提出带引用的候选证据；是否成立由后端核验与教师签核决定。
        "curriculum_evidence": curriculum_evidence,
        "textbook_evidence": textbook_evidence,
        "limitations": limitations,
        "evidence_errors": curriculum_errors + textbook_errors,
        "evidence_status": "complete"
        if curriculum_evidence and textbook_evidence and not (curriculum_errors + textbook_errors)
        else "partial",
        "validation_errors": errors,
        "status": "usable"
        if validated
        and all(row["status"] == "usable" for row in validated)
        and not errors
        else "needs_resolution",
    }
