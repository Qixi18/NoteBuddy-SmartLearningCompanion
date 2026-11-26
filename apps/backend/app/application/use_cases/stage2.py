"""Human signoff decisions tied to one immutable analysis run."""

import re

from ...domain.subject.source_mapping import bind_resource_links, fingerprint_material
from ...services.task01.knowledge_link_service import (
    build_knowledge_link_candidates,
)
from ...services.task01.machine_verification_service import (
    build_machine_verification,
)
from ...services.task02.evidence_reference_service import (
    validate_evidence_references,
)


class Stage2Decisions:
    def __init__(self, uow_factory, source_service=None):
        self.uow_factory = uow_factory
        self.source_service = source_service

    def current_source_fingerprints(self, run: dict, material_ids=()) -> dict[str, str]:
        fingerprints = {}
        if self.source_service is not None:
            fingerprints.update(
                {
                    f"file:{name}": record["sha256"]
                    for name, record in self.source_service.fingerprints(run).items()
                }
            )
        material_by_id = {
            str(item.get("材料编号")): item
            for item in run.get("items", [])
            if item.get("材料编号")
        }
        for material_id in sorted(set(material_ids)):
            item = material_by_id.get(material_id)
            if item is None:
                continue
            fingerprints[f"material:{material_id}"] = fingerprint_material(item)
        return dict(sorted(fingerprints.items()))

    def with_source_freshness(self, run: dict, histories: dict) -> dict:
        for history in histories.values():
            if not history:
                continue
            latest = history[-1]
            if latest.get("status") != "verified":
                continue
            if "source_fingerprints" not in latest:
                # Legacy signoffs cannot prove which source bytes were checked.
                latest["stale"] = True
                continue
            material_ids = set(latest.get("material_ids", []))
            material_ids.update(
                link.get("material_id")
                for link in latest.get("resource_links", [])
                if isinstance(link, dict) and link.get("material_id")
            )
            current = self.current_source_fingerprints(run, material_ids)
            latest["stale"] = current != latest["source_fingerprints"]
        return histories

    def sources(self) -> dict:
        with self.uow_factory(immediate=False) as uow:
            run = uow.runs.current()
            histories = uow.stage2.list_sources(run["run_id"])
        return self.with_source_freshness(run, histories)

    def knowledge_link_candidates(self, indicator_id: str) -> dict:
        """教师判断层：学习顺序候选（可解释，不自动写入）。"""
        with self.uow_factory(immediate=False) as uow:
            run = uow.runs.current()
        return {"candidates": build_knowledge_link_candidates(run, indicator_id)}

    def cases(self) -> dict:
        with self.uow_factory(immediate=False) as uow:
            run = uow.runs.current()
            return uow.stage2.list_cases(run["run_id"])

    def verify_source(self, payload: dict) -> dict:
        signature = payload.get("verified_by")
        if signature and signature != "teacher":
            raise ValueError("教师签核署名只能标注为教师本人；机器核验走专用管线")
        if (
            payload.get("confidence") is not None
            or payload.get("machine_evidence")
            or payload.get("spot_checks")
        ):
            raise ValueError("教师签核不接受机器核验与抽查字段")
        with self.uow_factory() as uow:
            expected_version = payload.pop("expected_version", None)
            run = uow.runs.current()
            indicator_id = payload["indicator_id"]
            objectives = {row["指标编号"] for row in run["objectives"]}
            if indicator_id not in objectives:
                raise ValueError("指标编号不存在")
            material_ids = set(payload["material_ids"])
            materials = {
                str(row.get("材料编号", "")): row
                for row in run["items"]
                if row.get("材料编号")
            }
            linked = {
                row["材料编号"]
                for row in run["items"]
                if row["指标编号"] == indicator_id
            }
            if not material_ids.issubset(linked):
                raise ValueError("核验包含非当前指标关联的题目")
            if len(material_ids) != len(payload["material_ids"]):
                raise ValueError("核验题目编号重复")
            rubric_point_ids = {
                point_id
                for item in run["items"]
                if item["材料编号"] in linked
                for point_id in re.findall(
                    r"[A-Z]+\d+P\d+", str(item.get("评分点", ""))
                )
            }
            mappings = payload.get("rubric_mappings", [])
            issue_ids = [mapping["issue_id"] for mapping in mappings]
            if len(issue_ids) != len(set(issue_ids)):
                raise ValueError("评分点问题编号重复")
            mapped_points = [
                point_id
                for mapping in mappings
                for point_id in mapping["rubric_point_ids"]
            ]
            if len(mapped_points) != len(set(mapped_points)):
                raise ValueError("评分点不能重复映射到多个问题")
            if not set(mapped_points).issubset(rubric_point_ids):
                raise ValueError("评分点问题映射包含未知或非当前指标评分点")
            for mapping in mappings:
                mapping_materials = mapping.get("material_ids", [])
                if len(mapping_materials) != len(set(mapping_materials)):
                    raise ValueError("评分点问题关联材料重复")
                if not set(mapping_materials).issubset(linked):
                    raise ValueError("评分点问题关联了非当前指标题目")
                if mapping["status"] == "verified":
                    if payload["status"] != "verified":
                        raise ValueError("评分点问题映射须随已核验来源一并确认")
                    if not all(
                        (
                            mapping.get("label", "").strip(),
                            mapping_materials,
                            mapping.get("evidence", "").strip(),
                            mapping.get("reviewer", "").strip(),
                        )
                    ):
                        raise ValueError(
                            "已核验评分点问题需填写名称、材料、依据和核验人"
                        )
                    if any(
                        not any(
                            point_id.startswith(f"{material_id}P")
                            for material_id in mapping_materials
                        )
                        for point_id in mapping["rubric_point_ids"]
                    ):
                        raise ValueError("评分点问题引用的评分点不属于关联材料")
            for relation in payload["knowledge_links"]:
                if (
                    relation["target_indicator_id"] not in objectives
                    or relation["target_indicator_id"] == indicator_id
                ):
                    raise ValueError("知识联系目标指标无效")
            resource_links = payload.get("resource_links", [])
            resource_ids = [link["material_id"] for link in resource_links]
            node_ids = {row["节点编号"] for row in run["nodes"]}
            source_fingerprints = {
                **self.current_source_fingerprints(
                    run, material_ids | set(resource_ids)
                )
            }
            payload["resource_links"] = bind_resource_links(
                resource_links,
                materials,
                objectives,
                node_ids,
                indicator_id,
                payload["status"],
            )
            payload["source_fingerprints"] = source_fingerprints
            if payload["status"] == "verified":
                if material_ids != linked or not material_ids:
                    raise ValueError("确认来源前须核对当前指标的全部关联题目")
                if not all(
                    payload[field].strip()
                    for field in (
                        "curriculum_locator",
                        "textbook_locator",
                        "reviewer",
                        "reason",
                    )
                ):
                    raise ValueError("确认来源需填写课标、教材定位、核验人和依据")
                if any(
                    not relation["evidence"].strip()
                    for relation in payload["knowledge_links"]
                ):
                    raise ValueError("知识联系须记录核验依据")
            return uow.stage2.append_source(
                run["run_id"], indicator_id, payload, expected_version=expected_version
            )

    def apply_machine_verification(self, indicator_id: str | None = None) -> dict:
        """机器核验层：切片文本匹配自动写入 verified_by="machine" 的签核记录。

        只对达到置信阈值的指标写入 verified 记录；未达阈值或切片不可读的指标
        保持现状，留给教师判断层。已有未过期已核验记录的指标跳过，不重复写入。
        """
        with self.uow_factory(immediate=False) as uow:
            run = uow.runs.current()
            objectives = [row["指标编号"] for row in run["objectives"]]
            if indicator_id is not None and indicator_id not in objectives:
                raise ValueError("指标编号不存在")
            targets = [indicator_id] if indicator_id else objectives
            fresh = self.with_source_freshness(
                run, uow.stage2.list_sources(run["run_id"])
            )
        verified: list[dict] = []
        skipped: list[dict] = []
        for target in targets:
            latest = (fresh.get(target) or [None])[-1]
            if (
                latest
                and latest.get("status") == "verified"
                and not latest.get("stale")
            ):
                skipped.append(
                    {
                        "indicator_id": target,
                        "reason": "已有未过期的已核验记录，未重复写入",
                    }
                )
                continue
            payload = build_machine_verification(run, self.source_service, target)
            if payload is None:
                skipped.append(
                    {
                        "indicator_id": target,
                        "reason": "切片不可读或关键词命中低于阈值，留给教师判断层",
                    }
                )
                continue
            with self.uow_factory() as uow:
                run = uow.runs.current()
                materials = {
                    str(row.get("材料编号", "")): row
                    for row in run["items"]
                    if row.get("材料编号")
                }
                objective_ids = {row["指标编号"] for row in run["objectives"]}
                node_ids = {row["节点编号"] for row in run["nodes"]}
                material_ids = set(payload["material_ids"])
                resource_ids = {
                    link["material_id"] for link in payload["resource_links"]
                }
                payload["resource_links"] = bind_resource_links(
                    payload["resource_links"],
                    materials,
                    objective_ids,
                    node_ids,
                    target,
                    "verified",
                )
                payload["source_fingerprints"] = self.current_source_fingerprints(
                    run, material_ids | resource_ids
                )
                record = uow.stage2.append_source(run["run_id"], target, payload)
            verified.append(record)
        return {"verified": verified, "skipped": skipped}

    def record_spot_check(self, payload: dict) -> dict:
        """抽查机制：教师抽样人工复核机器核验记录，留痕于该版本记录。

        只追加 spot_checks 元数据——不改状态、署名与版本号；
        抽查发现问题时，教师应通过签核编辑器驳回或重新核验。
        """
        indicator_id = payload["indicator_id"]
        reviewer = str(payload.get("reviewer", "")).strip()
        verdict = payload.get("verdict")
        if verdict not in ("抽查通过", "抽查发现问题"):
            raise ValueError("抽查结论无效")
        if not reviewer:
            raise ValueError("抽查须填写核验人")
        with self.uow_factory(immediate=False) as uow:
            run = uow.runs.current()
            fresh = self.with_source_freshness(
                run, uow.stage2.list_sources(run["run_id"])
            )
            latest = (fresh.get(indicator_id) or [None])[-1]
        if (
            not latest
            or latest.get("verified_by") != "machine"
            or latest.get("status") != "verified"
            or latest.get("stale")
        ):
            raise ValueError("抽查仅针对未过期的机器核验记录")
        entry = {
            "reviewer": reviewer,
            "verdict": verdict,
            "checked_items": payload.get("checked_items") or [],
            "note": str(payload.get("note", "")).strip(),
        }
        with self.uow_factory() as uow:
            return uow.stage2.annotate_spot_check(
                run["run_id"], indicator_id, latest["version"], entry
            )

    def save_case(self, payload: dict) -> dict:
        with self.uow_factory() as uow:
            run = uow.runs.current()
            student_id = payload["student_id"]
            if student_id not in {row["学生编号"] for row in run["students"]}:
                raise ValueError("学生编号不存在")
            rows = {
                row["记录编号"]: row
                for row in run["responses"]
                if row["学生编号"] == student_id
            }
            evidence_ids = payload["evidence_record_ids"]
            if len(evidence_ids) != len(set(evidence_ids)) or not set(
                evidence_ids
            ).issubset(rows):
                raise ValueError("案例证据不属于当前学生与运行")
            evidence_refs = validate_evidence_references(
                run, payload.get("evidence_refs", [])
            )
            coverage_refs = [
                reference
                for reference in evidence_refs
                if isinstance(reference, dict) and reference.get("kind") == "coverage"
            ]
            if len(coverage_refs) > 1:
                raise ValueError("案例只能引用一个当前范围覆盖记录")
            if coverage_refs:
                if evidence_ids:
                    raise ValueError("覆盖证据与作答记录不能混作同一案例证据")
                if len(coverage_refs) != len(evidence_refs):
                    raise ValueError("覆盖证据案例不能混入作答引用")
                if coverage_refs[0].get("scope", {}).get("student_id") != student_id:
                    raise ValueError("覆盖证据不属于所选案例学生")
                evidence_refs = coverage_refs
            response_ref_ids = {
                reference["record_id"]
                for reference in evidence_refs
                if reference["kind"] == "response"
            }
            if response_ref_ids != set(evidence_ids):
                raise ValueError("案例证据引用与记录编号不一致")
            if any(
                reference.get("scope", {}).get("student_id") != student_id
                or reference.get("scope", {}).get("run_id") != run["run_id"]
                for reference in evidence_refs
                if reference["kind"] == "response"
            ):
                raise ValueError("作答证据不属于所选案例学生与当前运行")
            history = uow.reviews.list(run["run_id"])
            source_history = self.with_source_freshness(
                run, uow.stage2.list_sources(run["run_id"])
            )
            for ref in payload["review_refs"]:
                reviews = history.get(f"{student_id}:{ref['indicator_id']}", [])
                match = next(
                    (item for item in reviews if item["version"] == ref["version"]),
                    None,
                )
                if (
                    match is None
                    or (
                        match.get("node_id")
                        or (match.get("original_draft") or {}).get("node_id")
                    )
                    != ref["node_id"]
                ):
                    raise ValueError("案例引用的复核版本或节点无效")
                if coverage_refs:
                    expected_scope = coverage_refs[0]["scope"]
                    review_refs_for_scope = match.get("evidence_refs", [])
                    if (
                        expected_scope
                        != {
                            "run_id": run["run_id"],
                            "student_id": student_id,
                            "indicator_id": ref["indicator_id"],
                            "node_id": ref["node_id"],
                        }
                        or coverage_refs[0] not in review_refs_for_scope
                    ):
                        raise ValueError("案例复核与覆盖证据范围不匹配")
                elif not set(match["evidence_record_ids"]).intersection(evidence_ids):
                    raise ValueError("案例复核与证据记录没有交集")
                if payload["status"] == "confirmed" and match["status"] not in {
                    "accepted",
                    "edited",
                }:
                    raise ValueError("正式案例只能引用已接受或修改的教师复核")
                if payload["status"] == "confirmed":
                    plan = match.get("structured_plan")
                    sources = source_history.get(ref["indicator_id"], [])
                    latest_source = sources[-1] if sources else None
                    if coverage_refs:
                        if (
                            not plan
                            or plan.get("material_ids")
                            or not plan.get("activity")
                            or not plan.get("steps")
                            or not plan.get("practice")
                            or not plan.get("observation_points")
                            or not match.get("reason", "").strip()
                        ):
                            raise ValueError("正式无记录案例需有教师理由和完整诊断方案")
                        continue
                    if (
                        not plan
                        or not latest_source
                        or latest_source["status"] != "verified"
                        or latest_source.get("stale")
                        or match.get("source_verification_versions", {}).get(
                            ref["indicator_id"]
                        )
                        != latest_source["version"]
                    ):
                        raise ValueError("正式案例引用的方案缺少当前有效来源签核")
            if payload["status"] == "confirmed" and not all(
                (
                    payload["reviewer"].strip(),
                    payload.get("need_type"),
                    payload.get("selection_reason", "").strip(),
                    payload["narrative"].strip(),
                    payload["limitations"].strip(),
                    evidence_ids or coverage_refs,
                    payload["review_refs"],
                )
            ):
                raise ValueError("确认案例需填写核验人、叙述、限制、证据和复核版本")
            payload["evidence_refs"] = evidence_refs
            return uow.stage2.append_case(run["run_id"], student_id, payload)
