"""Build a current material catalog with file, text and verification states.

三种状态必须分开表达，不能混用一个字段（自动核验的失败原因要能显示在界面上）：

- **文件状态** `file_status`：文件在不在、能不能读；
- **文本状态** `text_status`：这份文件有没有可读文本（本地提取或已授权 OCR）；
- **核验状态** `source_status`：指标来源是否已通过机器或教师核验，及其原因码。
"""


def _file_status(inspection: dict) -> str:
    if not inspection.get("available"):
        return "unreadable" if inspection.get("status") == "unreadable" else "missing"
    return "readable"


def _text_status(inspection: dict, expected_file_page: int | None) -> str:
    if not inspection.get("available"):
        return "unavailable"
    text_status = inspection.get("text_status")
    if text_status in {"available", "partial", "unavailable", "missing", "unreadable"}:
        return text_status
    parse_status = inspection.get("parse_status", inspection.get("status"))
    if parse_status == "unparsed":
        return "unavailable"
    if not inspection.get("text_page_count"):
        return "unavailable"
    return "available"


def _locator_status(
    inspection: dict, expected_file_page: int | None
) -> str:
    if not inspection.get("available"):
        return "source_missing"
    page_count = inspection.get("page_count")
    if (
        expected_file_page is not None
        and isinstance(page_count, int)
        and not 1 <= expected_file_page <= page_count
    ):
        return "page_out_of_range"
    text_pages = inspection.get("text_pages") or []
    if expected_file_page is not None:
        return "page_text_available" if expected_file_page in text_pages else "page_text_unavailable"
    if not text_pages:
        return "page_text_unavailable"
    return "locator_required"


def _document_status(inspection: dict, expected_file_page: int | None) -> str:
    """兼容字段：把三者折叠成一个状态，仅供旧界面使用。"""
    file_status = _file_status(inspection)
    if file_status != "readable":
        return file_status
    locator = _locator_status(inspection, expected_file_page)
    if locator == "page_out_of_range":
        return "page_out_of_range"
    if locator == "page_text_available":
        return "page_text_available"
    if _text_status(inspection, expected_file_page) == "unavailable":
        parse_status = inspection.get("parse_status")
        if parse_status == "unparsed":
            return "ocr_pending"
        if parse_status == "failed":
            return "ocr_failed"
        return "page_text_unavailable"
    return locator


def build_material_catalog(
    run: dict, sources, source_verifications: dict[str, list[dict]]
) -> dict:
    """Join imported materials, allowed files and explicit verified mappings."""
    materials_by_id = {
        str(item.get("材料编号")): item
        for item in run.get("items", [])
        if item.get("材料编号")
    }
    indicators = []
    inspected_documents = {}
    for entry in run.get("source_index", []):
        indicator_id = entry.get("indicator_id", "")
        topic_id = entry.get("topic_id", "")
        source_check = entry.get("source_check", {})
        history = source_verifications.get(indicator_id, [])
        latest = history[-1] if history else {}
        resource_links = (
            [
                link
                for link in latest.get("resource_links", [])
                if link.get("status") == "verified"
            ]
            if latest.get("status") == "verified" and not latest.get("stale")
            else []
        )
        linked_ids = {
            item.get("材料编号")
            for item in run.get("items", [])
            if item.get("指标编号") == indicator_id
        }
        linked_ids.update(link.get("material_id") for link in resource_links)
        indicator_materials = []
        for material_id in sorted(linked_ids):
            item = materials_by_id.get(material_id)
            if item is None:
                continue
            link = next(
                (
                    candidate
                    for candidate in resource_links
                    if candidate["material_id"] == material_id
                ),
                {},
            )
            indicator_materials.append(
                {
                    "material_id": material_id,
                    "resource_type": item.get("材料类型")
                    or item.get("题目类型")
                    or "题目",
                    "topic_id": item.get("主题编号", ""),
                    "title": item.get("题干或内容", ""),
                    "source": item.get("来源或资料文件", ""),
                    "source_locator": link.get("source_locator", ""),
                    "purpose": link.get("purpose", ""),
                    "verified": bool(link),
                }
            )

        document_specs = []
        curriculum_page = source_check.get("curriculum_file_page")
        if curriculum_page is not None:
            document_specs.append(("课程标准_2022.pdf", curriculum_page, "curriculum"))
        document_specs.extend(
            (name, None, "textbook") for name in source_check.get("textbook_slices", [])
        )
        documents = []
        for name, expected_page, source_kind in document_specs:
            if name not in inspected_documents:
                inspected_documents[name] = sources.inspect_pdf(run, name)
            inspection = inspected_documents[name]
            file_status = _file_status(inspection)
            text_status = _text_status(inspection, expected_page)
            documents.append(
                {
                    **inspection,
                    "expected_file_page": expected_page,
                    "body_page": source_check.get("curriculum_body_page")
                    if source_kind == "curriculum"
                    else None,
                    "source_kind": source_kind,
                    "file_status": file_status,
                    "text_status": text_status,
                    "locator_status": _locator_status(inspection, expected_page),
                    "status": _document_status(inspection, expected_page),
                    "url": f"/api/source?file={name}",
                }
            )
        source_status = latest.get("status", entry.get("verification", "pending"))
        indicators.append(
            {
                "indicator_id": indicator_id,
                "topic_id": topic_id,
                "source_status": source_status,
                "source_stale": bool(latest.get("stale")),
                # 机器/教师核验的可追溯字段：谁核验的、依据是什么、为什么没通过。
                "verified_by": latest.get("verified_by"),
                "verification_version": latest.get("verification_version"),
                "confidence": latest.get("confidence"),
                "reason_code": latest.get("reason_code"),
                "reason": latest.get("reason", ""),
                "checks": latest.get("checks")
                or (
                    latest.get("machine_evidence")
                    if latest.get("verified_by") == "machine"
                    and isinstance(latest.get("machine_evidence"), list)
                    and latest.get("machine_evidence")
                    and isinstance(latest["machine_evidence"][0], dict)
                    and "id" in latest["machine_evidence"][0]
                    else []
                ),
                "curriculum_locator": latest.get("curriculum_locator", ""),
                "textbook_locator": latest.get("textbook_locator", ""),
                "documents": documents,
                "materials": indicator_materials,
            }
        )
    return {"run_id": run.get("run_id", ""), "indicators": indicators}
