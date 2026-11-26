"""Thin use cases for the existing HTTP and CLI workbench operations."""

import re
import tempfile
import base64
import hashlib
import json
from pathlib import Path

from ...domain.assessment.evidence_bundle import AnalysisScope
from ...services.cases import suggest_cases
from ...services.exports import package
from ...services.recommendations import deepseek_draft, draft
from ...services.shared.release_service import check_release, release_fingerprint
from ...services.shared.report_service import build_case_reports, build_class_report
from ...services.task01.material_catalog_service import build_material_catalog
from ...services.task01.mapping_generation_service import (
    build_mapping_preview,
    generate_indicator_mapping,
    mapping_is_current,
)
from ...services.task02.class_insight_service import build_class_insights
from ...services.task02.evidence_bundle_service import build_evidence_bundle
from ...services.task02.insight_service import build_student_insights
from ...services.task03.resource_selection_service import select_resources
from ...services.task03.teaching_plan_service import build_teaching_plan
from ..ports.llm import LLMClient
from .ai_analysis import GenerateAIAnalysis
from .class_teaching import ClassTeachingPlanUseCases
from .stage2 import Stage2Decisions
from .teaching_adjustments import TeachingAdjustments


def _current_ai_mappings(
    run: dict, histories: dict, source_service, indicator_id: str
) -> dict:
    history = histories.get(indicator_id, [])
    if not history:
        return {}
    latest = history[-1]
    if not mapping_is_current(run, source_service, latest):
        return {}
    return {
        row["material_id"]: row
        for row in latest.get("mappings", [])
        if row.get("status") == "usable" and row.get("indicator_id") == indicator_id
    }


def _ai_mapping_summaries(run: dict, histories: dict, source_service) -> dict:
    summaries = {}
    for objective in run.get("objectives", []):
        indicator_id = objective.get("指标编号", "")
        history = histories.get(indicator_id, [])
        latest = history[-1] if history else None
        if latest is None:
            summaries[indicator_id] = {
                "status": "not_generated",
                "usable_count": 0,
                "needs_resolution_count": 0,
                "mappings": [],
            }
            continue
        current = mapping_is_current(run, source_service, latest)
        mappings = latest.get("mappings", [])
        summaries[indicator_id] = {
            "status": latest.get("status") if current else "stale",
            "version": latest.get("version"),
            "usable_count": sum(
                current and row.get("status") == "usable" for row in mappings
            ),
            "needs_resolution_count": sum(
                not current or row.get("status") != "usable" for row in mappings
            ),
            "mappings": mappings
            if current
            else [{**row, "status": "stale"} for row in mappings],
            "validation_errors": latest.get("validation_errors", []),
        }
    return summaries


def _attach_resource_selection(
    run: dict, result: dict, sources: dict, ai_mappings: dict | None = None
) -> dict:
    node_id = result.get("node_id")
    if not node_id or result.get("scope_required"):
        result["resource_selection"] = {
            "status": "blocked",
            "purpose": "diagnostic",
            "practice_items": [],
            "learning_resources": [],
            "excluded": [],
            "reason_codes": ["node_scope_required"],
        }
        return result
    scope = AnalysisScope(
        run_id=run["run_id"],
        student_id=result["student_id"],
        indicator_id=result["indicator_id"],
        node_id=node_id,
    )
    bundle = build_evidence_bundle(run, scope, sources)
    bundle.setdefault("source_context", {})["ai_mappings"] = ai_mappings or {}
    insights = build_student_insights(bundle)
    node_items = {
        item_id
        for node in run.get("nodes", [])
        for item_id in re.findall(r"[A-Z]+\d+", str(node.get("可用题目编号", "")))
        if node.get("节点编号") == node_id
    }
    catalog = [
        {
            "material_id": item.get("材料编号", ""),
            "resource_type": item.get("材料类型") or item.get("题目类型") or "题目",
            "indicator_id": item.get("指标编号", ""),
            "topic_id": item.get("主题编号", ""),
            "title": item.get("题干或内容", ""),
            "available_node_ids": [
                node.get("节点编号")
                for node in run.get("nodes", [])
                if item.get("材料编号")
                in re.findall(r"[A-Z]+\d+", str(node.get("可用题目编号", "")))
            ],
        }
        for item in run.get("items", [])
        if item.get("材料编号")
    ]
    rule_id = result.get("rule_id")
    purpose = (
        "remediation"
        if rule_id in {"TR-05", "TR-06"}
        else "transfer"
        if rule_id == "TR-07"
        else "diagnostic"
    )
    result["resource_selection"] = select_resources(bundle, insights, catalog, purpose)
    result["resource_selection"]["candidate_node_item_count"] = len(node_items)
    try:
        objective = next(
            (
                row.get("观察指标", "")
                for row in run.get("objectives", [])
                if row.get("指标编号") == result["indicator_id"]
            ),
            "",
        )
        result["teaching_plan_preview"] = build_teaching_plan(
            bundle,
            insights,
            result["resource_selection"],
            objective,
            set(result.get("evidence_record_ids", [])),
        )
        result["teaching_plan_preview_error"] = None
    except ValueError as exc:
        result["teaching_plan_preview"] = None
        result["teaching_plan_preview_error"] = str(exc)
    return result


class CurrentRun:
    def __init__(self, uow_factory):
        self.uow_factory = uow_factory

    def execute(self) -> dict:
        with self.uow_factory(immediate=False) as uow:
            return uow.runs.current()


class ImportFolder:
    def __init__(self, import_service):
        self.import_service = import_service

    def execute(self, folder: Path) -> dict:
        return self.import_service.import_folder(folder)

    def execute_files(
        self, files: dict[str, str], pdf_files: dict[str, str] | None = None
    ) -> dict:
        expected = {
            "课程要求.csv",
            "题目与材料.csv",
            "模拟学生.csv",
            "测验节点.csv",
            "作答记录.csv",
            "字段说明.csv",
        }
        if set(files) != expected:
            missing = sorted(expected - set(files))
            raise ValueError(f"所选文件不完整，缺少：{'、'.join(missing)}")
        pdf_bytes = {
            name: base64.b64decode(content, validate=True)
            for name, content in (pdf_files or {}).items()
        }
        source_hash = hashlib.sha256(
            json.dumps(
                {
                    name: hashlib.sha256(content).hexdigest()
                    for name, content in sorted(pdf_bytes.items())
                },
                sort_keys=True,
            ).encode()
        ).hexdigest()
        source_dir = (
            self.import_service.sources.ocr_cache_dir.parent
            / "imported_sources"
            / source_hash
            if pdf_bytes and self.import_service.sources.ocr_cache_dir
            else None
        )
        if source_dir is not None:
            source_dir.mkdir(parents=True, exist_ok=True)
            for name, content in pdf_bytes.items():
                (source_dir / name).write_bytes(content)
        with tempfile.TemporaryDirectory(prefix="smart-learning-import-") as temporary:
            folder = Path(temporary)
            for name, content in files.items():
                (folder / name).write_text(content, encoding="utf-8-sig", newline="")
            return self.import_service.import_folder(
                folder, imported_source_dir=source_dir
            )

    def preview_ocr(self) -> dict:
        run = self.import_service.runs.current()
        return self.import_service.sources.preview_registered_pdfs(
            run, self.import_service.ocr_client
        )

    def execute_ocr(self, confirmed: bool, preview_fingerprint: str) -> dict:
        if not confirmed:
            raise ValueError("必须明确确认后才能向 OCR 服务发送来源文件")
        run = self.import_service.runs.current()
        preview = self.import_service.sources.preview_registered_pdfs(
            run, self.import_service.ocr_client
        )
        if not preview_fingerprint or preview.get("fingerprint") != preview_fingerprint:
            raise ValueError(
                "OCR 预览已变化（文件清单或缓存状态不同）；请重新预览并确认"
            )
        if (
            preview.get("will_send_count", 0)
            and preview.get("status") == "api_key_missing"
        ):
            raise ValueError("未配置 OCR 服务密钥，未发送任何文件")
        return self.import_service.sources.parse_registered_pdfs(
            run, self.import_service.ocr_client
        )


class IndicatorMappings:
    def __init__(self, uow_factory, source_service, llm_client, config):
        self.uow_factory = uow_factory
        self.source_service = source_service
        self.llm_client = llm_client
        self.config = config

    def preview(self, indicator_id: str | None = None) -> dict:
        with self.uow_factory(immediate=False) as uow:
            run = uow.runs.current()
        indicator_ids = [
            row["指标编号"]
            for row in run.get("objectives", [])
            if indicator_id is None or row.get("指标编号") == indicator_id
        ]
        if indicator_id and not indicator_ids:
            raise ValueError("指标编号不存在")
        return build_mapping_preview(
            run,
            self.source_service,
            self.config.model_provider,
            self.config.model_name,
            indicator_ids,
        )

    def list(self) -> dict:
        with self.uow_factory(immediate=False) as uow:
            run = uow.runs.current()
            return uow.stage2.list_ai_mappings(run["run_id"])

    def generate(
        self, indicator_id: str | None = None, preview_fingerprint: str = ""
    ) -> dict:
        if self.llm_client is None:
            raise ValueError("未配置文本模型，无法生成 AI 映射")
        preview = self.preview(indicator_id)
        if not preview_fingerprint or preview_fingerprint != preview["fingerprint"]:
            raise ValueError("AI 映射预览已变化；请重新预览并确认")
        with self.uow_factory(immediate=False) as uow:
            run = uow.runs.current()
        indicator_ids = [
            row["指标编号"]
            for row in run.get("objectives", [])
            if indicator_id is None or row.get("指标编号") == indicator_id
        ]
        if indicator_id and not indicator_ids:
            raise ValueError("指标编号不存在")
        results = []
        for current_id in indicator_ids:
            try:
                result = generate_indicator_mapping(
                    run, self.source_service, self.llm_client, current_id
                )
                with self.uow_factory() as uow:
                    saved = uow.stage2.append_ai_mapping(
                        run["run_id"], current_id, result["input_fingerprint"], result
                    )
                results.append(saved)
            except Exception as exc:  # noqa: BLE001 - preserve per-indicator progress
                results.append(
                    {"indicator_id": current_id, "status": "failed", "error": str(exc)}
                )
        return {"run_id": run["run_id"], "results": results}


class ListReviews:
    def __init__(self, uow_factory):
        self.uow_factory = uow_factory

    def execute(self, run_id: str | None = None) -> dict:
        with self.uow_factory(immediate=False) as uow:
            if run_id is None:
                run_id = uow.runs.current()["run_id"]
            return uow.reviews.list(run_id)


class ListCases:
    def __init__(self, current_run: CurrentRun):
        self.current_run = current_run

    def execute(self) -> list[dict]:
        return suggest_cases(self.current_run.execute())


class RuleDraft:
    def __init__(
        self, current_run: CurrentRun, stage2: Stage2Decisions, source_service
    ):
        self.current_run = current_run
        self.stage2 = stage2
        self.source_service = source_service

    def execute(
        self, student_id: str, indicator_id: str, node_id: str | None = None
    ) -> dict:
        with self.current_run.uow_factory(immediate=False) as uow:
            run = uow.runs.current()
            sources = self.stage2.with_source_freshness(
                run, uow.stage2.list_sources(run["run_id"])
            )
            mappings = uow.stage2.list_ai_mappings(run["run_id"])
        result = draft(
            run,
            student_id,
            indicator_id,
            node_id,
            source_verifications=sources,
        )
        ai_mappings = _current_ai_mappings(
            run, mappings, self.source_service, indicator_id
        )
        return _attach_resource_selection(run, result, sources, ai_mappings)


class DeepSeekDraft:
    def __init__(
        self,
        current_run: CurrentRun,
        stage2: Stage2Decisions,
        config,
        client: LLMClient | None,
        source_service,
    ):
        self.current_run = current_run
        self.stage2 = stage2
        self.config = config
        self.client = client
        self.source_service = source_service

    def execute(
        self, student_id: str, indicator_id: str, node_id: str | None = None
    ) -> dict:
        with self.current_run.uow_factory(immediate=False) as uow:
            run = uow.runs.current()
            sources = self.stage2.with_source_freshness(
                run, uow.stage2.list_sources(run["run_id"])
            )
            mappings = uow.stage2.list_ai_mappings(run["run_id"])
        result = deepseek_draft(
            run,
            student_id,
            indicator_id,
            self.config.model_api_key or self.config.deepseek_api_key,
            self.config.model_name,
            client=self.client,
            node_id=node_id,
            source_verifications=sources,
        )
        ai_mappings = _current_ai_mappings(
            run, mappings, self.source_service, indicator_id
        )
        return _attach_resource_selection(run, result, sources, ai_mappings)


class ReadSourcePdf:
    def __init__(self, current_run: CurrentRun, source_service):
        self.current_run = current_run
        self.source_service = source_service

    def execute(self, name: str) -> bytes:
        return self.source_service.read_pdf(self.current_run.execute(), name)


class GetMaterialCatalog:
    def __init__(
        self, current_run: CurrentRun, stage2: Stage2Decisions, source_service
    ):
        self.current_run = current_run
        self.stage2 = stage2
        self.source_service = source_service

    def execute(self) -> dict:
        with self.current_run.uow_factory(immediate=False) as uow:
            run = uow.runs.current()
            histories = uow.stage2.list_sources(run["run_id"])
        histories = self.stage2.with_source_freshness(run, histories)
        return build_material_catalog(run, self.source_service, histories)


class ExportPackage:
    def __init__(self, uow_factory, current_run: CurrentRun, stage2: Stage2Decisions):
        self.uow_factory = uow_factory
        self.current_run = current_run
        self.stage2 = stage2

    def execute(self, case_ids: list[str]) -> bytes:
        with self.uow_factory(immediate=False) as uow:
            run = uow.runs.current()
            reviews = uow.reviews.list(run["run_id"])
            sources = uow.stage2.list_sources(run["run_id"])
            ai_mappings = uow.stage2.list_ai_mappings(run["run_id"])
            cases = uow.stage2.list_cases(run["run_id"])
            teaching_adjustments = uow.teaching_adjustments.list()
        sources = self.stage2.with_source_freshness(run, sources)
        return package(
            run,
            reviews,
            case_ids,
            sources=sources,
            ai_mappings=ai_mappings,
            cases=cases,
            teaching_adjustments=teaching_adjustments,
        )


class GetEvidenceBundle:
    def __init__(self, uow_factory, stage2: Stage2Decisions):
        self.uow_factory = uow_factory
        self.stage2 = stage2

    def execute(self, student_id: str, indicator_id: str, node_id: str) -> dict:
        with self.uow_factory(immediate=False) as uow:
            run = uow.runs.current()
            sources = uow.stage2.list_sources(run["run_id"])
        sources = self.stage2.with_source_freshness(run, sources)
        scope = AnalysisScope(
            run_id=run["run_id"],
            student_id=student_id,
            indicator_id=indicator_id,
            node_id=node_id,
        )
        return build_evidence_bundle(run, scope, sources)


class GetStudentInsights:
    def __init__(self, evidence_bundle: GetEvidenceBundle):
        self.evidence_bundle = evidence_bundle

    def execute(self, student_id: str, indicator_id: str, node_id: str) -> dict:
        bundle = self.evidence_bundle.execute(student_id, indicator_id, node_id)
        return {
            "scope": bundle["scope"],
            "bundle_fingerprint": bundle["fingerprint"],
            "claims": build_student_insights(bundle),
        }


class GetClassInsights:
    def __init__(
        self, current_run: CurrentRun, stage2: Stage2Decisions, source_service
    ):
        self.current_run = current_run
        self.stage2 = stage2
        self.source_service = source_service

    def execute(self, node_id: str) -> dict:
        with self.current_run.uow_factory(immediate=False) as uow:
            run = uow.runs.current()
            sources = uow.stage2.list_sources(run["run_id"])
            ai_mappings = uow.stage2.list_ai_mappings(run["run_id"])
        sources = self.stage2.with_source_freshness(run, sources)
        return build_class_insights(
            run,
            node_id,
            sources,
            _ai_mapping_summaries(run, ai_mappings, self.source_service),
        )


class GetCompetitionReports:
    def __init__(self, uow_factory, stage2: Stage2Decisions, source_service):
        self.uow_factory = uow_factory
        self.stage2 = stage2
        self.source_service = source_service

    def cases(self, student_ids: list[str]) -> dict:
        with self.uow_factory(immediate=False) as uow:
            run = uow.runs.current()
            reviews = uow.reviews.list(run["run_id"])
            cases = uow.stage2.list_cases(run["run_id"])
            sources = uow.stage2.list_sources(run["run_id"])
            adjustments = uow.teaching_adjustments.list()
        sources = self.stage2.with_source_freshness(run, sources)
        return build_case_reports(
            run, student_ids, cases, reviews, sources, adjustments
        )

    def class_report(self, node_id: str, class_id: str | None = None) -> dict:
        with self.uow_factory(immediate=False) as uow:
            run = uow.runs.current()
            sources = uow.stage2.list_sources(run["run_id"])
            ai_mappings = uow.stage2.list_ai_mappings(run["run_id"])
        sources = self.stage2.with_source_freshness(run, sources)
        insights = build_class_insights(
            run,
            node_id,
            sources,
            _ai_mapping_summaries(run, ai_mappings, self.source_service),
        )
        return build_class_report(run, node_id, insights, class_id=class_id)


class PrepareSubmission:
    def __init__(self, uow_factory, stage2: Stage2Decisions):
        self.uow_factory = uow_factory
        self.stage2 = stage2

    def read_snapshot(self) -> tuple[dict, dict, dict, dict, list, dict]:
        with self.uow_factory(immediate=False) as uow:
            run = uow.runs.current()
            reviews = uow.reviews.list(run["run_id"])
            cases = uow.stage2.list_cases(run["run_id"])
            sources = uow.stage2.list_sources(run["run_id"])
            ai_mappings = uow.stage2.list_ai_mappings(run["run_id"])
            adjustments = uow.teaching_adjustments.list()
        return run, reviews, cases, sources, adjustments, ai_mappings

    def execute(
        self,
        case_ids: list[str],
        node_id: str,
        reviewer: str = "",
        content_reviewed: bool = False,
        *,
        snapshot: tuple[dict, dict, dict, dict, list, dict] | None = None,
    ) -> dict:
        run, reviews, cases, raw_sources, adjustments, ai_mappings = (
            snapshot or self.read_snapshot()
        )
        sources = raw_sources
        sources = self.stage2.with_source_freshness(run, sources)
        try:
            case_report = build_case_reports(
                run, case_ids, cases, reviews, sources, adjustments
            )
        except ValueError:
            case_report = {
                "run_id": run.get("run_id"),
                "status": "incomplete",
                "cases": [],
                "comparison": [],
                "limitations": [],
            }
        try:
            insights = build_class_insights(
                run,
                node_id,
                sources,
                _ai_mapping_summaries(run, ai_mappings, self.stage2.source_service),
            )
            class_report = build_class_report(run, node_id, insights)
        except ValueError:
            class_report = {
                "run_id": run.get("run_id"),
                "node_id": node_id,
                "status": "incomplete",
                "classes": [],
                "comparisons": [],
                "common_observations": [],
                "limitations": [],
            }
        reports = {"cases": case_report, "class": class_report}
        checks = check_release(
            run,
            sources,
            cases,
            reviews,
            reports,
            case_ids,
            node_id=node_id,
            content_reviewed=content_reviewed,
            reviewer=reviewer,
            ai_mappings=ai_mappings,
        )
        fingerprint = release_fingerprint(
            run,
            sources,
            cases,
            reviews,
            reports,
            case_ids,
            node_id,
            checks,
            reviewer,
            content_reviewed,
            ai_mappings,
        )
        blocking = any(item["status"] == "blocked" for item in checks)
        unchecked = any(item["status"] == "not_checked" for item in checks)
        return {
            "run_id": run["run_id"],
            "case_ids": case_ids,
            "node_id": node_id,
            "checks": checks,
            "reports": reports,
            "fingerprint": fingerprint,
            "reviewer": reviewer.strip(),
            "content_reviewed": content_reviewed,
            "ai_mappings": ai_mappings,
            "release_status": "blocked"
            if blocking
            else "ready_with_open_checks"
            if unchecked
            else "ready",
            "_snapshot": (run, reviews, cases, sources, adjustments, ai_mappings),
        }


class ExportSubmission:
    def __init__(
        self, prepared: PrepareSubmission, uow_factory, stage2: Stage2Decisions
    ):
        self.prepared = prepared
        self.uow_factory = uow_factory
        self.stage2 = stage2

    def execute(self, payload: dict) -> bytes:
        snapshot = self.prepared.read_snapshot()
        current = self.prepared.execute(
            payload["case_ids"],
            payload["node_id"],
            payload["reviewer"],
            payload["content_reviewed"],
            snapshot=snapshot,
        )
        if payload["run_id"] != current["run_id"]:
            raise ValueError("当前运行已变化；请重新执行发布预检")
        if payload["preflight_fingerprint"] != current["fingerprint"]:
            raise ValueError("预检后案例、复核、来源或报告已变化；请重新执行发布预检")
        blockers = [
            item["label"] for item in current["checks"] if item["status"] == "blocked"
        ]
        if blockers:
            raise ValueError("发布预检未通过：" + "、".join(blockers))
        if not payload["content_reviewed"] or not payload["reviewer"].strip():
            raise ValueError("请由内容负责人完成重点风险复核并填写姓名")
        run, reviews, cases, sources, adjustments, ai_mappings = current["_snapshot"]
        submission = {
            key: current[key]
            for key in (
                "checks",
                "reports",
                "fingerprint",
                "reviewer",
                "content_reviewed",
                "release_status",
            )
        }
        return package(
            run,
            reviews,
            payload["case_ids"],
            sources=sources,
            ai_mappings=ai_mappings,
            cases=cases,
            teaching_adjustments=adjustments,
            submission=submission,
        )


class WorkbenchUseCases:
    """Composition object holding only the real workbench use cases."""

    def __init__(
        self,
        uow_factory,
        import_service,
        source_service,
        config,
        save_review,
        llm_client,
    ):
        self.current_run = CurrentRun(uow_factory)
        self.import_folder = ImportFolder(import_service)
        self.indicator_mappings = IndicatorMappings(
            uow_factory, source_service, llm_client, config
        )
        self.list_reviews = ListReviews(uow_factory)
        self.save_review = save_review
        self.stage2 = Stage2Decisions(uow_factory, source_service)
        self.teaching_adjustments = TeachingAdjustments(uow_factory)
        self.list_cases = ListCases(self.current_run)
        self.rule_draft = RuleDraft(self.current_run, self.stage2, source_service)
        self.deepseek_draft = DeepSeekDraft(
            self.current_run, self.stage2, config, llm_client, source_service
        )
        self.ai_analysis = GenerateAIAnalysis(
            uow_factory, source_service, config, llm_client
        )
        self.read_source_pdf = ReadSourcePdf(self.current_run, source_service)
        self.material_catalog = GetMaterialCatalog(
            self.current_run, self.stage2, source_service
        )
        self.export_package = ExportPackage(uow_factory, self.current_run, self.stage2)
        self.evidence_bundle = GetEvidenceBundle(uow_factory, self.stage2)
        self.student_insights = GetStudentInsights(self.evidence_bundle)
        self.class_insights = GetClassInsights(
            self.current_run, self.stage2, source_service
        )
        self.competition_reports = GetCompetitionReports(
            uow_factory, self.stage2, source_service
        )
        self.class_teaching_plans = ClassTeachingPlanUseCases(
            uow_factory, self.stage2, source_service
        )
        self.prepare_submission = PrepareSubmission(uow_factory, self.stage2)
        self.export_submission = ExportSubmission(
            self.prepare_submission, uow_factory, self.stage2
        )
