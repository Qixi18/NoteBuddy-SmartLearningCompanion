"""Deterministic machine verification from allowlisted textbook slice text.

两层信任模型的"机器核验层"v1：
- 用课程要求 CSV 里的关联关系作为题目映射的机器证据；
- 用观察指标关键词在 allowlist 切片文本层中定位页面，
  命中阈值（≥2 个关键词且覆盖率 ≥50%）的资源映射与教材定位
  以 verified_by="machine" 写入签核记录；
- 扫描版课标不做 OCR，课标定位沿用 CSV 并在依据中注明待人工核验；
- 学习顺序（必要联系）与评分点问题命名属于教师判断层，本服务不生成。
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Callable

from pypdf import PdfReader
from pypdf.errors import PdfReadError, PdfStreamError

from ...application.ports.file_storage import FileStorage
from ...infrastructure.files.local_file_storage import LocalFileStorage

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


def _domain_lexicon_keywords(indicator_text: str) -> list[str]:
    return [term for term in _DOMAIN_LEXICON if term in (indicator_text or "")]

_MATCH_MIN_KEYWORDS = 2
_MATCH_MIN_RATIO = 0.5


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


def _page_texts(path: Path) -> list[dict[str, Any]]:
    """Extract non-empty text pages from a PDF; unreadable pages are skipped."""
    try:
        reader = PdfReader(str(path))
    except (PdfReadError, PdfStreamError, OSError, TypeError, ValueError):
        return []
    pages: list[dict[str, Any]] = []
    for index, page in enumerate(reader.pages, 1):
        try:
            text = page.extract_text() or ""
        except (PdfReadError, PdfStreamError, TypeError, ValueError):
            continue
        if text.strip():
            pages.append({"page": index, "text": text})
    return pages


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


def _best_page(
    pages: list[dict[str, Any]], keywords: list[str]
) -> dict[str, Any] | None:
    best: dict[str, Any] | None = None
    for page in pages:
        text_lower = page["text"].lower()
        matched = [k for k in keywords if _keyword_matches(k, text_lower)]
        if not matched:
            continue
        if best is None or len(matched) > len(best["matched"]):
            best = {
                "page": page["page"],
                "matched": matched,
                "excerpt": _matched_excerpt(page["text"], matched),
            }
    return best


def _slice_match(
    pages: list[dict[str, Any]], keywords: list[str]
) -> dict[str, Any] | None:
    """切片级匹配：任一页命中的关键词并入切片覆盖集；定位页取命中最多的一页。"""
    slice_matched: list[str] = []
    best_page: dict[str, Any] | None = None
    for page in pages:
        text_lower = page["text"].lower()
        matched = [k for k in keywords if _keyword_matches(k, text_lower)]
        if not matched:
            continue
        slice_matched.extend(k for k in matched if k not in slice_matched)
        if best_page is None or len(matched) > len(best_page["matched"]):
            best_page = {"page": page["page"], "matched": matched}
    if not slice_matched:
        return None
    excerpt = ""
    if best_page is not None:
        page_text = next(p["text"] for p in pages if p["page"] == best_page["page"])
        excerpt = _matched_excerpt(page_text, best_page["matched"])
    return {
        "matched": slice_matched,
        "page": best_page["page"] if best_page else None,
        "excerpt": excerpt,
    }


def build_machine_verification(
    run: dict,
    source_service,
    indicator_id: str,
    *,
    extract_page_texts: Callable[[Path], list[dict[str, Any]]] | None = None,
) -> dict | None:
    """Build a machine-verified signoff payload for one indicator.

    返回 None 表示证据不足或切片不可读——这类指标留给教师判断层，不自动通过。
    """
    extract = extract_page_texts or _page_texts
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
    slices = list(
        (source_entry or {}).get("source_check", {}).get("textbook_slices", [])
    )
    keywords = indicator_keywords(str(objective.get("观察指标", "")))
    if not slices or not keywords:
        return None

    linked_questions = sorted(
        {
            str(row["材料编号"])
            for row in run.get("items", [])
            if row.get("指标编号") == indicator_id and row.get("材料编号")
        }
    )
    if not linked_questions:
        return None

    slice_to_material: dict[str, str] = {}
    for row in run.get("items", []):
        source_file = str(row.get("来源或资料文件", ""))
        for name in slices:
            if name and name in source_file and name not in slice_to_material:
                slice_to_material[name] = str(row["材料编号"])

    best: dict[str, Any] | None = None
    for name in slices:
        path = source_service.resolve(run, name)
        if path is None:
            continue
        try:
            pages = extract(path)
        except (PdfReadError, PdfStreamError, OSError, TypeError, ValueError):
            continue
        candidate = _slice_match(pages, keywords)
        if candidate and (
            best is None or len(candidate["matched"]) > len(best["matched"])
        ):
            best = {**candidate, "slice": name}

    if not best:
        return None
    matched_ratio = len(best["matched"]) / len(keywords)
    if len(best["matched"]) < _MATCH_MIN_KEYWORDS or matched_ratio < _MATCH_MIN_RATIO:
        return None

    material_id = slice_to_material.get(best["slice"])
    if not material_id:
        return None

    node_ids = [
        node["节点编号"]
        for node in run.get("nodes", [])
        if any(
            question in str(node.get("可用题目编号", ""))
            for question in linked_questions
        )
    ]

    confidence = round(matched_ratio, 2)
    evidence = {
        "type": "textbook_keyword_match",
        "material_id": material_id,
        "slice": best["slice"],
        "page": best["page"],
        "keywords_matched": best["matched"],
        "keywords_total": len(keywords),
        "excerpt": best["excerpt"],
        "confidence": confidence,
    }
    resource_link = {
        "material_id": material_id,
        "purpose": "讲解与观察指标相关的教材内容",
        "indicator_ids": [indicator_id],
        "allowed_node_ids": node_ids,
        "source_locator": f"切片 {best['slice']} 第 {best['page']} 页",
        "evidence": best["excerpt"],
        "status": "verified",
    }
    return {
        "indicator_id": indicator_id,
        "status": "verified",
        "curriculum_locator": str(objective.get("课标文件页／正文页", "")),
        "textbook_locator": str(objective.get("教材正文页", "")),
        "material_ids": linked_questions,
        "knowledge_links": [],
        "rubric_mappings": [],
        "resource_links": [resource_link],
        "reviewer": "机器核验（切片文本匹配）",
        "reason": (
            f"切片关键词自动匹配 {len(best['matched'])}/{len(keywords)} 个关键词"
            f"（阈值：≥{_MATCH_MIN_KEYWORDS} 个且覆盖率 ≥{_MATCH_MIN_RATIO:.0%}）；"
            "课标定位沿用课程要求 CSV，扫描版原文待人工或视觉核验"
        ),
        "verified_by": "machine",
        "confidence": confidence,
        "machine_evidence": [evidence],
    }


def source_service_for(resources_dir, source_files_dir=None, storage=None):
    """Convenience factory so use cases can build a resolver on demand."""
    from .source_service import SourceService

    return SourceService(
        Path(resources_dir) if resources_dir else Path("."),
        storage=storage or LocalFileStorage(),
        source_files_dir=Path(source_files_dir) if source_files_dir else None,
    )
