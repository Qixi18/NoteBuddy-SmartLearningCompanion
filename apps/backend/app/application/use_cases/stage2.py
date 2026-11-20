"""Human signoff decisions tied to one immutable analysis run."""

import re


class Stage2Decisions:
    def __init__(self, uow_factory):
        self.uow_factory = uow_factory

    def sources(self) -> dict:
        with self.uow_factory(immediate=False) as uow:
            run = uow.runs.current()
            return uow.stage2.list_sources(run["run_id"])

    def cases(self) -> dict:
        with self.uow_factory(immediate=False) as uow:
            run = uow.runs.current()
            return uow.stage2.list_cases(run["run_id"])

    def verify_source(self, payload: dict) -> dict:
        with self.uow_factory() as uow:
            expected_version = payload.pop("expected_version", None)
            run = uow.runs.current()
            indicator_id = payload["indicator_id"]
            objectives = {row["指标编号"] for row in run["objectives"]}
            if indicator_id not in objectives:
                raise ValueError("指标编号不存在")
            material_ids = set(payload["material_ids"])
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
            if payload["status"] != "verified" and any(
                mapping["status"] == "verified" for mapping in mappings
            ):
                raise ValueError("评分点问题映射须随已核验来源一并确认")
            for relation in payload["knowledge_links"]:
                if (
                    relation["target_indicator_id"] not in objectives
                    or relation["target_indicator_id"] == indicator_id
                ):
                    raise ValueError("知识联系目标指标无效")
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
            history = uow.reviews.list(run["run_id"])
            source_history = uow.stage2.list_sources(run["run_id"])
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
                if not set(match["evidence_record_ids"]).intersection(evidence_ids):
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
                    if (
                        not plan
                        or not latest_source
                        or latest_source["status"] != "verified"
                        or match.get("source_verification_versions", {}).get(
                            ref["indicator_id"]
                        )
                        != latest_source["version"]
                    ):
                        raise ValueError("正式案例引用的方案缺少当前有效来源签核")
            if payload["status"] == "confirmed" and not all(
                (
                    payload["reviewer"].strip(),
                    payload["narrative"].strip(),
                    payload["limitations"].strip(),
                    evidence_ids,
                    payload["review_refs"],
                )
            ):
                raise ValueError("确认案例需填写核验人、叙述、限制、证据和复核版本")
            return uow.stage2.append_case(run["run_id"], student_id, payload)
