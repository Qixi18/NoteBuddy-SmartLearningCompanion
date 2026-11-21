"""Build a current material catalog with OCR and source-mapping states."""


def _document_status(inspection: dict, expected_file_page: int | None) -> str:
    if not inspection["available"]:
        return "missing"
    page_count = inspection.get("page_count")
    if (
        expected_file_page is not None
        and isinstance(page_count, int)
        and not 1 <= expected_file_page <= page_count
    ):
        return "page_out_of_range"
    parse_status = inspection.get("parse_status", inspection.get("status"))
    if parse_status == "unparsed":
        return "ocr_pending"
    if parse_status == "failed":
        return "ocr_failed"
    if inspection.get("status") != "readable":
        return "unreadable"
    if (
        expected_file_page is not None
        and expected_file_page not in inspection["text_pages"]
    ):
        return "page_text_unavailable"
    if expected_file_page is not None:
        return "page_text_available"
    if not inspection["text_page_count"]:
        return "page_text_unavailable"
    return "locator_required"


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
            documents.append(
                {
                    **inspection,
                    "expected_file_page": expected_page,
                    "body_page": source_check.get("curriculum_body_page")
                    if source_kind == "curriculum"
                    else None,
                    "source_kind": source_kind,
                    "status": _document_status(inspection, expected_page),
                    "url": f"/api/source?file={name}",
                }
            )
        indicators.append(
            {
                "indicator_id": indicator_id,
                "topic_id": topic_id,
                "source_status": latest.get(
                    "status", entry.get("verification", "pending")
                ),
                "source_stale": bool(latest.get("stale")),
                "curriculum_locator": latest.get("curriculum_locator", ""),
                "textbook_locator": latest.get("textbook_locator", ""),
                "documents": documents,
                "materials": indicator_materials,
            }
        )
    return {"run_id": run.get("run_id", ""), "indicators": indicators}
