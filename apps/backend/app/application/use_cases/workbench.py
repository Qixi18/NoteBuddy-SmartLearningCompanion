"""Thin use cases for the existing HTTP and CLI workbench operations."""

import re
import tempfile
from pathlib import Path

from ...domain.assessment.evidence_bundle import AnalysisScope
from ...services.cases import suggest_cases
from ...services.exports import package
from ...services.recommendations import deepseek_draft, draft
from ...services.task01.material_catalog_service import build_material_catalog
from ...services.task02.class_insight_service import build_class_insights
from ...services.task02.evidence_bundle_service import build_evidence_bundle
from ...services.task02.insight_service import build_student_insights
from ...services.task03.resource_selection_service import select_resources
from ..ports.llm import LLMClient
from .stage2 import Stage2Decisions
from .teaching_adjustments import TeachingAdjustments


def _attach_resource_selection(run: dict, result: dict, sources: dict) -> dict:
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

    def execute_files(self, files: dict[str, str]) -> dict:
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
        with tempfile.TemporaryDirectory(prefix="smart-learning-import-") as temporary:
            folder = Path(temporary)
            for name, content in files.items():
                (folder / name).write_text(content, encoding="utf-8-sig", newline="")
            return self.import_service.import_folder(folder)


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
    def __init__(self, current_run: CurrentRun, stage2: Stage2Decisions):
        self.current_run = current_run
        self.stage2 = stage2

    def execute(
        self, student_id: str, indicator_id: str, node_id: str | None = None
    ) -> dict:
        with self.current_run.uow_factory(immediate=False) as uow:
            run = uow.runs.current()
            sources = self.stage2.with_source_freshness(
                run, uow.stage2.list_sources(run["run_id"])
            )
        result = draft(
            run,
            student_id,
            indicator_id,
            node_id,
            source_verifications=sources,
        )
        return _attach_resource_selection(run, result, sources)


class DeepSeekDraft:
    def __init__(
        self,
        current_run: CurrentRun,
        stage2: Stage2Decisions,
        config,
        client: LLMClient | None,
    ):
        self.current_run = current_run
        self.stage2 = stage2
        self.config = config
        self.client = client

    def execute(
        self, student_id: str, indicator_id: str, node_id: str | None = None
    ) -> dict:
        with self.current_run.uow_factory(immediate=False) as uow:
            run = uow.runs.current()
            sources = self.stage2.with_source_freshness(
                run, uow.stage2.list_sources(run["run_id"])
            )
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
        return _attach_resource_selection(run, result, sources)


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
            cases = uow.stage2.list_cases(run["run_id"])
            teaching_adjustments = uow.teaching_adjustments.list()
        sources = self.stage2.with_source_freshness(run, sources)
        return package(
            run,
            reviews,
            case_ids,
            sources=sources,
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
    def __init__(self, current_run: CurrentRun, stage2: Stage2Decisions):
        self.current_run = current_run
        self.stage2 = stage2

    def execute(self, node_id: str) -> dict:
        with self.current_run.uow_factory(immediate=False) as uow:
            run = uow.runs.current()
            sources = uow.stage2.list_sources(run["run_id"])
        sources = self.stage2.with_source_freshness(run, sources)
        return build_class_insights(run, node_id, sources)


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
        self.list_reviews = ListReviews(uow_factory)
        self.save_review = save_review
        self.stage2 = Stage2Decisions(uow_factory, source_service)
        self.teaching_adjustments = TeachingAdjustments(uow_factory)
        self.list_cases = ListCases(self.current_run)
        self.rule_draft = RuleDraft(self.current_run, self.stage2)
        self.deepseek_draft = DeepSeekDraft(
            self.current_run, self.stage2, config, llm_client
        )
        self.read_source_pdf = ReadSourcePdf(self.current_run, source_service)
        self.material_catalog = GetMaterialCatalog(
            self.current_run, self.stage2, source_service
        )
        self.export_package = ExportPackage(uow_factory, self.current_run, self.stage2)
        self.evidence_bundle = GetEvidenceBundle(uow_factory, self.stage2)
        self.student_insights = GetStudentInsights(self.evidence_bundle)
        self.class_insights = GetClassInsights(self.current_run, self.stage2)
