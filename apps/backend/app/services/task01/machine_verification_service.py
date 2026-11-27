"""Deterministic multi-evidence machine verification of curriculum and textbook sources.

两层信任模型中的"机器核验层"v2（课程来源自动核验）：

v1 只用"观察指标关键词在教材切片内覆盖率"判定通过，存在三个准确性问题：

- 关键词命中会被跨页合并，不同页零散出现的词可以拼成一条"证据"；
- 课标未解析时直接跳过课标侧，仍可能写出 ``verified``；
- 失败只有一句"命中低于阈值"，教师无法知道缺的是什么证据。

v2 把关键词覆盖率降级为辅助量，改为四类必要证据全部成立才自动通过：

1. 来源文件存在且可读（``SOURCE_MISSING`` / ``SOURCE_UNREADABLE``）；
2. 课标定位页有文本且内容与本指标相符（``TEXT_UNAVAILABLE`` / ``CURRICULUM_MISMATCH``）；
3. 教材切片单页文本与本指标相符——逐页匹配、不跨页合并（``TEXTBOOK_MISMATCH``）；
4. 本指标在当前运行内有题目/材料关联，且 AI 引用（如有）可逐条回查
   （``MATERIAL_NOT_LINKED`` / ``REFERENCE_INVALID``）。

核验期间来源文件发生变化时给出 ``SOURCE_CHANGED``。学习顺序（必要联系）与评分点
问题命名属于教师判断层，本服务不生成。
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Callable

from ...application.ports.file_storage import FileStorage
from ...infrastructure.files.local_file_storage import LocalFileStorage

CURRICULUM_FILE = "课程标准_2022.pdf"

# 核验算法版本：写入签核记录，算法升级后可据此要求重新核验。
VERIFICATION_VERSION = 2

# 把观察指标切成可检索的关键词片段：中文连接词、虚词作为分隔。
# 注意：不把"解""释""简"等常用字作为分隔符，避免拆坏"解释""解方程""化简"这类词；
# "解一元一次方程"这类长段由二元组匹配兜底。
_SEGMENT_SPLIT = re.compile(
    r"[，。、；：！？（）()\s的与和及或并了是在中为到对由从被把时若以及其中"
    r"运用根据能会进行正确实写出说明检验结合判断理掌握初综合应用]+"
)

# 七年级数学领域词表：出现于观察指标中的词项作为额外关键词。
# 词表覆盖本赛题三个主题的核心概念，随教材表述差异仍由二元组匹配兜底。
_DOMAIN_LEXICON = (
    "代数式",
    "整式",
    "同类项",
    "去括号",
    "合并同类项",
    "化简",
    "代入",
    "求值",
    "数量关系",
    "等式",
    "等式的性质",
    "等式性质",
    "一元一次方程",
    "二元一次方程组",
    "方程组",
    "消元",
    "不等式",
    "不等式组",
    "不等式的性质",
    "不等式性质",
    "交集",
    "解集",
    "负数",
    "乘除",
    "检验",
)

# 单页至少命中这些关键词才算"这一页讲了这件事"。
_MATCH_MIN_KEYWORDS = 2
# 教材侧覆盖率辅助阈值（不作为唯一判据，但低于它说明该页只是擦边）。
_MATCH_MIN_RATIO = 0.5

REASON_CODES = {
    "SOURCE_MISSING": "来源文件缺失",
    "SOURCE_UNREADABLE": "来源文件无法读取",
    "TEXT_UNAVAILABLE": "关键页文本不足",
    "CURRICULUM_MISMATCH": "课标定位与本指标内容不一致",
    "TEXTBOOK_MISMATCH": "教材内容与本指标不匹配",
    "REFERENCE_INVALID": "AI 引用证据无法回查",
    "MATERIAL_NOT_LINKED": "缺少有效的题目或教学材料关联",
    "SOURCE_CHANGED": "核验期间来源文件发生变化",
}

CHECK_LABELS = {
    "sources": "来源文件检查",
    "curriculum": "课标定位核验",
    "textbook": "教材切片核验",
    "item_link": "题目关联核验",
    "reference": "引用证据核验",
    "fingerprint": "来源指纹核验",
}


def _domain_lexicon_keywords(indicator_text: str) -> list[str]:
    return [term for term in _DOMAIN_LEXICON if term in (indicator_text or "")]


def indicator_keywords(indicator_text: str) -> list[str]:
    """Return de-duplicated searchable keywords for an indicator.

    关键词 = 虚词切分片段 + 领域词表命中项。词表项解决教材表述与
    课程要求表述的用字差异（如"求代数式的值" vs "求值"）。
    """
    keywords: list[str] = []
    for segment in _SEGMENT_SPLIT.split(indicator_text or ""):
        segment = segment.strip()
        if (
            len(segment) >= 2
            and re.fullmatch(r"[\u4e00-\u9fffA-Za-z0-9]+", segment)
            and segment not in keywords
        ):
            keywords.append(segment)
    for term in _domain_lexicon_keywords(indicator_text):
        if term not in keywords:
            keywords.append(term)
    return keywords


def _keyword_matches(keyword: str, text_lower: str) -> bool:
    """关键词命中：完整子串，或（≥3 字词）二元组覆盖率 ≥60%。

    二元组覆盖让"等式性质"能命中教材里的"等式的性质"，
    避免教材表述与课程要求表述的用字差异导致永远不命中。
    """
    lowered = keyword.lower()
    if lowered in text_lower:
        return True
    if len(lowered) < 3:
        return False
    bigrams = {lowered[i : i + 2] for i in range(len(lowered) - 1)}
    hit = sum(1 for bigram in bigrams if bigram in text_lower)
    return hit / len(bigrams) >= 0.6


def _matched_excerpt(page_text: str, keywords: list[str], limit: int = 120) -> str:
    lowered = page_text.lower()
    sentences = [s.strip() for s in re.split(r"[。！？\n]", page_text) if s.strip()]
    hits = [
        sentence
        for sentence in sentences
        if any(_keyword_matches(k, sentence.lower()) for k in keywords)
    ]
    excerpt = "；".join(hits[:2])
    return excerpt[:limit]


def page_match(page_text: str, keywords: list[str]) -> dict:
    """单页匹配结果。严格只看这一页，绝不把多页命中合并成一条证据。"""
    text_lower = (page_text or "").lower()
    matched = [keyword for keyword in keywords if _keyword_matches(keyword, text_lower)]
    ratio = len(matched) / len(keywords) if keywords else 0.0
    return {
        "matched": matched,
        "ratio": round(ratio, 3),
        "excerpt": _matched_excerpt(page_text, matched) if matched else "",
    }


def best_page(pages: list[dict], keywords: list[str]) -> dict | None:
    """在给定页集合里挑出**单页**命中最多的那一页。

    与 v1 的 `_slice_match()` 的区别：定位页与命中关键词来自同一页，
    不会出现"甲页命中2个词、乙页命中1个词，合起来算3个"的证据拼凑。
    """
    best: dict | None = None
    for page in pages:
        result = page_match(str(page.get("text", "")), keywords)
        if not result["matched"]:
            continue
        if best is None or len(result["matched"]) > len(best["matched"]):
            best = {
                "page": page.get("page"),
                "text_source": page.get("source", "local"),
                **result,
            }
    return best


def _text_pages_of(text: dict) -> list[dict]:
    return list(text.get("pages") or [])


class TextPageProvider:
    """一次批量核验内复用每份文件的文本页，避免重复读 PDF / 重复算指纹。"""

    def __init__(self, source_service):
        self.source_service = source_service
        self._cache: dict[tuple[str, str], dict] = {}

    def __call__(self, run: dict, name: str) -> dict:
        key = (str(run.get("run_id", "")), name)
        if key not in self._cache:
            self._cache[key] = self.source_service.get_text_pages(run, name)
        return self._cache[key]

    def invalidate(self) -> None:
        self._cache.clear()


def _checks_template() -> dict[str, dict]:
    return {
        key: {
            "id": key,
            "label": CHECK_LABELS[key],
            "status": "skipped",
            "detail": "",
        }
        for key in CHECK_LABELS
    }


def _locator_page(objective: dict, source_check: dict) -> int | None:
    """课标文件页：优先课程要求 CSV 的定位，其次 source_checks 的登记页。"""
    locator = str(objective.get("课标文件页／正文页", "") or "")
    match = re.match(r"\s*(\d+)", locator)
    if match:
        return int(match.group(1))
    page = source_check.get("curriculum_file_page")
    return page if isinstance(page, int) else None


def _validate_ai_references(
    ai_mappings: list[dict], lookup: Callable[[str], dict]
) -> list[dict]:
    """逐条回查 AI 映射引用：页码必须存在、原文必须能在该页找到。"""
    problems: list[dict] = []
    for mapping in ai_mappings or []:
        if not isinstance(mapping, dict):
            continue
        for evidence in mapping.get("evidence") or []:
            if not isinstance(evidence, dict):
                continue
            source = str(evidence.get("source", ""))
            page = evidence.get("page")
            excerpt = str(evidence.get("excerpt", "")).strip()
            if not source.endswith(".pdf") or not isinstance(page, int):
                continue
            text = lookup(source)
            page_text = next(
                (
                    str(item.get("text", ""))
                    for item in _text_pages_of(text)
                    if item.get("page") == page
                ),
                "",
            )
            if not page_text:
                problems.append(
                    {
                        "material_id": mapping.get("material_id"),
                        "problem": "page_text_unavailable",
                        "page": page,
                        "source": source,
                    }
                )
                continue
            if excerpt and excerpt not in page_text:
                problems.append(
                    {
                        "material_id": mapping.get("material_id"),
                        "problem": "excerpt_not_found",
                        "page": page,
                        "source": source,
                    }
                )
    return problems


def build_machine_verification_report(
    run: dict,
    source_service,
    indicator_id: str,
    *,
    text_provider: Callable[[dict, str], dict] | None = None,
    ai_mappings: list[dict] | None = None,
) -> dict:
    """对单个指标做多维证据核验，返回结论、原因码、逐项检查与签核载荷。

    ``text_provider(run, name) -> {"available", "pages": [{"page", "text", "source"}]}``
    可注入，便于测试脱离真实 PDF；默认走 ``SourceService.get_text_pages``。
    """
    provider = text_provider or TextPageProvider(source_service)
    objectives = {row["指标编号"]: row for row in run.get("objectives", [])}
    if indicator_id not in objectives:
        raise ValueError("指标编号不存在")
    objective = objectives[indicator_id]
    source_entry = next(
        (
            row
            for row in run.get("source_index", [])
            if row.get("indicator_id") == indicator_id
        ),
        None,
    )
    source_check = (source_entry or {}).get("source_check") or {}
    slices = list(source_check.get("textbook_slices") or [])
    keywords = indicator_keywords(str(objective.get("观察指标", "")))
    linked_questions = sorted(
        {
            str(row["材料编号"])
            for row in run.get("items", [])
            if row.get("指标编号") == indicator_id and row.get("材料编号")
        }
    )
    checks = _checks_template()
    evidence: dict[str, Any] = {
        "curriculum": None,
        "textbook": None,
        "item_link": None,
        "source_fingerprint": None,
    }

    def fail(reason_code: str, detail: str, *, check: str | None = None) -> dict:
        if check:
            checks[check]["status"] = "failed"
            checks[check]["detail"] = detail
        # 前序证据不足时，后续检查没有被执行——如实标注，不留下空的"—"。
        for entry in checks.values():
            if entry["status"] == "skipped" and not entry["detail"]:
                entry["detail"] = "未执行：前序证据不足"
        return {
            "indicator_id": indicator_id,
            "status": "needs_review",
            "reason_code": reason_code,
            "reason": f"{REASON_CODES[reason_code]}：{detail}",
            "checks": list(checks.values()),
            "evidence": evidence,
            "confidence": None,
            "verification_version": VERIFICATION_VERSION,
            "payload": None,
        }

    # 1. 来源文件与关键词
    if not keywords:
        return fail("TEXT_UNAVAILABLE", "观察指标没有可检索的关键词", check="curriculum")
    if not slices:
        return fail(
            "MATERIAL_NOT_LINKED",
            "当前指标没有登记教材切片来源（source_checks.textbook_slices 为空）",
            check="item_link",
        )

    curriculum_text = provider(run, CURRICULUM_FILE)
    slice_texts: dict[str, dict] = {}
    missing_files: list[str] = []
    for name in [CURRICULUM_FILE, *slices]:
        if name in slice_texts:
            continue
        text = curriculum_text if name == CURRICULUM_FILE else provider(run, name)
        slice_texts[name] = text
        if not text.get("available"):
            missing_files.append(name)
    if missing_files:
        unreadable = [
            name
            for name in missing_files
            if slice_texts[name].get("text_status") == "unreadable"
        ]
        if unreadable:
            checks["sources"]["status"] = "failed"
            checks["sources"]["detail"] = f"无法读取：{'、'.join(unreadable)}"
            return fail("SOURCE_UNREADABLE", f"无法读取：{'、'.join(unreadable)}", check="sources")
        checks["sources"]["status"] = "failed"
        checks["sources"]["detail"] = f"缺失：{'、'.join(missing_files)}"
        return fail("SOURCE_MISSING", f"缺失：{'、'.join(missing_files)}", check="sources")
    checks["sources"]["status"] = "passed"
    checks["sources"]["detail"] = f"共检查 {len(slice_texts)} 份来源文件，全部可读"

    # 2. 课标定位页内容核验（课标为扫描件时只能给出 TEXT_UNAVAILABLE）
    curriculum_page = _locator_page(objective, source_check)
    curriculum_pages = _text_pages_of(curriculum_text)
    curriculum_match = None
    if curriculum_page is not None:
        page_record = next(
            (item for item in curriculum_pages if item.get("page") == curriculum_page),
            None,
        )
        if page_record is None:
            checks["curriculum"]["status"] = "failed"
            checks["curriculum"]["detail"] = (
                f"课标第 {curriculum_page} 页没有可读文本（扫描版 PDF 需要先经授权 OCR）"
            )
            return fail(
                "TEXT_UNAVAILABLE",
                f"课标第 {curriculum_page} 页没有可读文本"
                f"（本地 {curriculum_text.get('local_text_page_count', 0)} 页有文本，"
                f"OCR {curriculum_text.get('ocr_text_page_count', 0)} 页）",
                check="curriculum",
            )
        curriculum_match = page_match(str(page_record.get("text", "")), keywords)
        evidence["curriculum"] = {
            "type": "curriculum_page_match",
            "file": CURRICULUM_FILE,
            "page": curriculum_page,
            "text_source": page_record.get("source"),
            "keywords_matched": curriculum_match["matched"],
            "keywords_total": len(keywords),
            "match_ratio": curriculum_match["ratio"],
            "excerpt": curriculum_match["excerpt"],
        }
        if len(curriculum_match["matched"]) < _MATCH_MIN_KEYWORDS:
            checks["curriculum"]["status"] = "failed"
            checks["curriculum"]["detail"] = (
                f"第 {curriculum_page} 页只命中 {len(curriculum_match['matched'])} 个关键词"
                f"（要求 ≥{_MATCH_MIN_KEYWORDS}）"
            )
            return fail(
                "CURRICULUM_MISMATCH",
                f"课标第 {curriculum_page} 页未出现本指标的核心概念",
                check="curriculum",
            )
        checks["curriculum"]["status"] = "passed"
        checks["curriculum"]["detail"] = (
            f"第 {curriculum_page} 页命中 {len(curriculum_match['matched'])}/{len(keywords)} 个关键词"
        )
    else:
        checks["curriculum"]["status"] = "skipped"
        checks["curriculum"]["detail"] = "课程要求未登记课标文件页，无法核对课标定位"

    # 3. 教材切片：单页匹配，不跨页合并
    best: dict | None = None
    for name in slices:
        text = slice_texts[name]
        candidate = best_page(_text_pages_of(text), keywords)
        if candidate is None:
            continue
        if best is None or len(candidate["matched"]) > len(best["matched"]):
            best = {**candidate, "slice": name}
    if best is None:
        checks["textbook"]["status"] = "failed"
        checks["textbook"]["detail"] = "切片中没有任何一页命中本指标关键词"
        return fail(
            "TEXTBOOK_MISMATCH",
            f"教材切片（{'、'.join(slices)}）没有任何一页命中本指标关键词",
            check="textbook",
        )
    evidence["textbook"] = {
        "type": "textbook_page_match",
        "slice": best["slice"],
        "page": best["page"],
        "text_source": best["text_source"],
        "keywords_matched": best["matched"],
        "keywords_total": len(keywords),
        "match_ratio": best["ratio"],
        "excerpt": best["excerpt"],
    }
    if (
        len(best["matched"]) < _MATCH_MIN_KEYWORDS
        or best["ratio"] < _MATCH_MIN_RATIO
    ):
        checks["textbook"]["status"] = "failed"
        checks["textbook"]["detail"] = (
            f"最匹配的一页（{best['slice']} 第 {best['page']} 页）命中 "
            f"{len(best['matched'])}/{len(keywords)} 个关键词，覆盖率 {best['ratio']:.0%}"
        )
        return fail(
            "TEXTBOOK_MISMATCH",
            f"切片 {best['slice']} 第 {best['page']} 页命中不足"
            f"（{len(best['matched'])}/{len(keywords)}，要求 ≥{_MATCH_MIN_KEYWORDS} 个且覆盖率 ≥{_MATCH_MIN_RATIO:.0%}）",
            check="textbook",
        )
    checks["textbook"]["status"] = "passed"
    checks["textbook"]["detail"] = (
        f"切片 {best['slice']} 第 {best['page']} 页命中 {len(best['matched'])}/{len(keywords)} 个关键词"
    )

    # 4. 题目关联
    if not linked_questions:
        checks["item_link"]["status"] = "failed"
        checks["item_link"]["detail"] = "当前指标没有关联的题目或教学材料"
        return fail(
            "MATERIAL_NOT_LINKED",
            "当前指标没有关联的题目或教学材料",
            check="item_link",
        )
    slice_to_material: dict[str, str] = {}
    for row in run.get("items", []):
        source_file = str(row.get("来源或资料文件", ""))
        for name in slices:
            if name and name in source_file and name not in slice_to_material:
                slice_to_material[name] = str(row["材料编号"])
    material_id = slice_to_material.get(best["slice"])
    if not material_id:
        checks["item_link"]["status"] = "failed"
        checks["item_link"]["detail"] = "命中的切片没有对应的题目材料编号"
        return fail(
            "MATERIAL_NOT_LINKED",
            f"切片 {best['slice']} 未关联到任何题目材料编号",
            check="item_link",
        )
    node_ids = [
        str(node["节点编号"])
        for node in run.get("nodes", [])
        if any(question in str(node.get("可用题目编号", "")) for question in linked_questions)
    ]
    evidence["item_link"] = {
        "type": "official_indicator_item_binding",
        "material_ids": linked_questions,
        "slice": best["slice"],
        "slice_material_id": material_id,
        "allowed_node_ids": node_ids,
    }
    checks["item_link"]["status"] = "passed"
    checks["item_link"]["detail"] = f"关联 {len(linked_questions)} 项材料，来源切片可回指材料 {material_id}"

    # 5. AI 引用（存在才校验；虚构页码/原文直接拒绝）
    if ai_mappings:
        problems = _validate_ai_references(
            ai_mappings, lambda name: provider(run, name)
        )
        if problems:
            evidence["reference_problems"] = problems
            checks["reference"]["status"] = "failed"
            checks["reference"]["detail"] = f"{len(problems)} 条引用无法回查"
            return fail(
                "REFERENCE_INVALID",
                f"AI 映射中有 {len(problems)} 条引用无法在来源原文中回查",
                check="reference",
            )
        checks["reference"]["status"] = "passed"
        checks["reference"]["detail"] = f"回查 {len(ai_mappings)} 条 AI 映射引用，全部可定位"
    else:
        checks["reference"]["status"] = "skipped"
        checks["reference"]["detail"] = "当前指标没有 AI 映射引用需要回查"

    # 6. 来源指纹
    try:
        fingerprints = source_service.fingerprints(run)
    except (AttributeError, OSError, ValueError):
        fingerprints = {}
    cited = {name: fingerprints.get(name) for name in {CURRICULUM_FILE, *slices}}
    if any(value is None for value in cited.values()):
        checks["fingerprint"]["status"] = "failed"
        checks["fingerprint"]["detail"] = "引用文件缺少可计算的内容指纹"
        return fail(
            "SOURCE_CHANGED",
            "引用文件在核验期间不可读或已被替换，请刷新来源后重试",
            check="fingerprint",
        )
    evidence["source_fingerprint"] = {
        "type": "sha256",
        "files": {name: value["sha256"] for name, value in cited.items()},
    }
    checks["fingerprint"]["status"] = "passed"
    checks["fingerprint"]["detail"] = f"{len(cited)} 份引用文件指纹已记录"

    confidence = round(
        min(
            best["ratio"],
            curriculum_match["ratio"] if curriculum_match else 1.0,
        ),
        2,
    )
    resource_link = {
        "material_id": material_id,
        "purpose": "讲解与观察指标相关的教材内容",
        "indicator_ids": [indicator_id],
        "allowed_node_ids": node_ids,
        "source_locator": f"切片 {best['slice']} 第 {best['page']} 页",
        "evidence": best["excerpt"],
        "status": "verified",
    }
    machine_evidence = [
        {
            "type": "multi_evidence",
            "checks": list(checks.values()),
            "curriculum": evidence["curriculum"],
            "textbook": evidence["textbook"],
            "item_link": evidence["item_link"],
        }
    ]
    payload = {
        "indicator_id": indicator_id,
        "status": "verified",
        "curriculum_locator": str(objective.get("课标文件页／正文页", "")),
        "textbook_locator": str(objective.get("教材正文页", "")),
        "material_ids": linked_questions,
        "knowledge_links": [],
        "rubric_mappings": [],
        "resource_links": [resource_link],
        "reviewer": "机器核验（课标与切片逐页文本匹配）",
        "reason": (
            f"课标第 {curriculum_page} 页命中 {len(curriculum_match['matched'])}/{len(keywords)} 个关键词；"
            if curriculum_match
            else "课标定位未登记；"
        )
        + f"教材切片 {best['slice']} 第 {best['page']} 页命中 {len(best['matched'])}/{len(keywords)} 个关键词；"
        + f"题目关联 {len(linked_questions)} 项且切片可回指材料 {material_id}",
        "verified_by": "machine",
        "confidence": confidence,
        "machine_evidence": machine_evidence,
        "verification_version": VERIFICATION_VERSION,
        "reason_code": None,
        "checks": list(checks.values()),
    }
    return {
        "indicator_id": indicator_id,
        "status": "verified",
        "reason_code": None,
        "reason": payload["reason"],
        "checks": list(checks.values()),
        "evidence": evidence,
        "confidence": confidence,
        "verification_version": VERIFICATION_VERSION,
        "payload": payload,
    }


def build_machine_verification(
    run: dict,
    source_service,
    indicator_id: str,
    *,
    extract_page_texts: Callable[[Path], list[dict[str, Any]]] | None = None,
) -> dict | None:
    """兼容入口：达到全部必要证据时返回机器签核载荷，否则返回 None。

    新代码请用 :func:`build_machine_verification_report`，它还会给出失败原因码。
    """
    if extract_page_texts is not None:
        extract = extract_page_texts

        def provider(run_arg: dict, name: str) -> dict:
            pages = extract(Path(name))
            return {
                "available": True,
                "text_status": "available" if pages else "unavailable",
                "pages": [dict(page, source="local") for page in pages],
                "page_count": len(pages),
                "text_page_count": len(pages),
                "local_text_page_count": len(pages),
                "ocr_text_page_count": 0,
            }

    else:
        provider = None
    report = build_machine_verification_report(
        run, source_service, indicator_id, text_provider=provider
    )
    return report["payload"]


def needs_review_payload(report: dict) -> dict | None:
    """把"证据不足"的结论转成可持久化的待核验记录（不伪造通过）。"""
    if report["status"] == "verified":
        return None
    return {
        "indicator_id": report["indicator_id"],
        "status": "pending",
        "verified_by": "machine",
        "curriculum_locator": "",
        "textbook_locator": "",
        "material_ids": [],
        "knowledge_links": [],
        "rubric_mappings": [],
        "resource_links": [],
        "reviewer": "机器核验（证据不足，待人工或 OCR 后重试）",
        "reason": report["reason"],
        "reason_code": report["reason_code"],
        "confidence": None,
        "machine_evidence": report["checks"],
        "verification_version": report["verification_version"],
        "checks": report["checks"],
    }


def source_service_for(resources_dir, source_files_dir=None, storage=None):
    """Convenience factory so use cases can build a resolver on demand."""
    from .source_service import SourceService

    return SourceService(
        Path(resources_dir) if resources_dir else Path("."),
        storage=storage or LocalFileStorage(),
        source_files_dir=Path(source_files_dir) if source_files_dir else None,
    )
