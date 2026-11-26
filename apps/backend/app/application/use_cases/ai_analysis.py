"""Generate, cache, retry, and retrieve persisted AI analysis for a run scope."""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import UTC, datetime
from urllib.parse import quote

from ...services.ai_analysis.analysis_service import analyze_packets
from ...services.ai_analysis.evidence_pack_service import build_task_packets

PROMPT_VERSION = "1"
SCHEMA_VERSION = "1"


def _segment(value: str | None) -> str:
    """转义范围标识，避免冒号/竖线等分隔符造成缓存键碰撞。"""
    return quote(str(value or ""), safe="")


def scope_key(
    task: str,
    node_id: str | None,
    student_id: str | None,
    indicator_id: str | None,
    class_id: str | None = None,
) -> str:
    if task == "task01":
        return "run"
    if task == "task02":
        suffix = f"|class:{_segment(class_id)}" if class_id else ""
        return f"node:{_segment(node_id)}{suffix}"
    if task == "task03" and node_id is None:
        return (
            f"student:{_segment(student_id)}"
            f"|indicator:{_segment(indicator_id)}|all-nodes"
        )
    suffix = (
        f"|student:{_segment(student_id)}|indicator:{_segment(indicator_id)}"
        if student_id and indicator_id
        else ""
    )
    return f"node:{_segment(node_id)}{suffix}"


class GenerateAIAnalysis:
    def __init__(self, uow_factory, source_service, config, client):
        self.uow_factory = uow_factory
        self.source_service = source_service
        self.config = config
        self.client = client

    def _load_scope(
        self, task, run_id, node_id, student_id, indicator_id, class_id=None
    ):
        if task == "task02" and not node_id:
            raise ValueError("TASK 02 必须指定测验节点")
        if task == "task03" and not node_id and not student_id:
            raise ValueError("整体学习建议必须指定学生")
        if task == "task01" and any((node_id, student_id, indicator_id, class_id)):
            raise ValueError("TASK 01 使用整次运行范围")
        if class_id and task != "task02":
            raise ValueError("class_id 仅用于 TASK 02 班级范围分析")
        key = scope_key(task, node_id, student_id, indicator_id, class_id)
        with self.uow_factory(immediate=False) as uow:
            run = uow.runs.current() if run_id is None else uow.runs.load(run_id)
            if (
                task in {"task02", "task03"}
                and node_id
                and node_id
                not in {item.get("节点编号") for item in run.get("nodes", [])}
            ):
                raise ValueError("测验节点不存在")
            if student_id and student_id not in {
                item.get("学生编号") for item in run.get("students", [])
            }:
                raise ValueError("学生不存在")
            if indicator_id and indicator_id not in {
                item.get("指标编号") for item in run.get("objectives", [])
            }:
                raise ValueError("学科指标不存在")
            if class_id and class_id not in {
                item.get("模拟班级编号") for item in run.get("students", [])
            }:
                raise ValueError("班级不存在")
            verifications = uow.stage2.list_sources(run["run_id"])
            latest = {
                indicator: history[-1]
                for indicator, history in verifications.items()
                if history
            }
        sources = {"verifications": latest, "pdf_pages": []}
        if task in {"task01", "task02", "task03"}:
            seen_pdf_pages = set()
            requested_indicator = indicator_id
            for entry in run.get("source_index", []):
                source_indicator_id = entry.get("indicator_id")
                if (
                    task == "task03"
                    and requested_indicator
                    and source_indicator_id != requested_indicator
                ):
                    continue
                verification = latest.get(source_indicator_id, {})
                if verification.get("status") != "verified" or verification.get(
                    "stale"
                ):
                    continue
                page = entry.get("source_check", {}).get("curriculum_file_page")
                try:
                    page_number = int(page)
                except (TypeError, ValueError):
                    page_number = None
                if page_number is None or not 1 <= page_number <= 10000:
                    page_number = None
                selected = {}
                if page_number is not None:
                    selected.setdefault("课程标准_2022.pdf", set()).add(page_number)
                for name in entry.get("source_check", {}).get("textbook_slices", []):
                    parsed = (
                        run.get("source_parsing", {}).get("files", {}).get(name, {})
                    )
                    pages = parsed.get("pages", [])
                    selected[name] = {
                        page.get("index", -1) + 1
                        for page in pages[:20]
                        if isinstance(page, dict) and isinstance(page.get("index"), int)
                    }
                for name, page_numbers in selected.items():
                    valid_numbers = sorted(
                        number for number in page_numbers if number > 0
                    )[:20]
                    if not valid_numbers:
                        continue
                    try:
                        extracted = self.source_service.extract_pages(
                            run, name, valid_numbers
                        )
                    except (FileNotFoundError, OSError, ValueError):
                        continue
                    for page in extracted:
                        dedupe_key = (source_indicator_id, page["name"], page["page"])
                        if dedupe_key in seen_pdf_pages:
                            continue
                        seen_pdf_pages.add(dedupe_key)
                        sources["pdf_pages"].append(
                            {**page, "indicator_id": source_indicator_id}
                        )
        pdf_fingerprints = self.source_service.fingerprints(run)
        fingerprint_data = {
            "run_id": run["run_id"],
            "input_fingerprint": run.get("input_fingerprint"),
            "task": task,
            "scope_key": key,
            "source_verifications": latest,
            "pdf_fingerprints": pdf_fingerprints,
            "prompt_version": PROMPT_VERSION,
            "schema_version": SCHEMA_VERSION,
            "model": self.config.model_name,
        }
        fingerprint = hashlib.sha256(
            json.dumps(
                fingerprint_data, ensure_ascii=False, sort_keys=True, default=str
            ).encode("utf-8")
        ).hexdigest()
        packets = build_task_packets(
            run,
            task,
            node_id,
            sources,
            student_id=student_id,
            indicator_id=indicator_id,
            class_id=class_id,
        )
        scope = packets[0]["scope"] if packets else {"task": task}
        return run, key, fingerprint, packets, scope, latest

    def preview(
        self,
        task,
        run_id=None,
        node_id=None,
        student_id=None,
        indicator_id=None,
        class_id=None,
    ):
        run, key, fingerprint, packets, scope, _ = self._load_scope(
            task, run_id, node_id, student_id, indicator_id, class_id
        )
        with self.uow_factory(immediate=False) as uow:
            latest = uow.ai_analyses.latest(run["run_id"], task, key)
        stale = bool(latest and latest["source_fingerprint"] != fingerprint)
        return {
            "analysis": latest if latest and not stale else None,
            "stale": stale,
            "run_id": run["run_id"],
            "task": task,
            "scope": scope,
            "scope_key": key,
            "source_fingerprint": fingerprint,
            "provider": self.config.model_provider,
            "model": self.config.model_name,
            "model_configured": bool(
                (self.config.model_api_key or self.config.deepseek_api_key).strip()
            ),
            "input_summary": {
                "packet_count": len(packets),
                "record_count": packets[0]["coverage"]["raw_records_total"],
                "evidence_count": sum(
                    len(packet["evidence_units"]) for packet in packets
                ),
                "objective_count": sum(
                    fact.get("kind") == "curriculum_objective"
                    for packet in packets
                    for fact in packet["facts"]
                ),
            },
        }

    def execute(
        self,
        task,
        run_id=None,
        node_id=None,
        student_id=None,
        indicator_id=None,
        action="generate",
        request_id=None,
        analysis_id=None,
        class_id=None,
        preview_fingerprint=None,
    ) -> dict:
        if (
            self.client is None
            or not (self.config.model_api_key or self.config.deepseek_api_key).strip()
        ):
            raise ValueError("尚未配置可用的 AI 模型服务")
        run, key, fingerprint, packets, scope, _ = self._load_scope(
            task, run_id, node_id, student_id, indicator_id, class_id
        )
        if action != "retry_failed":
            if not preview_fingerprint:
                raise ValueError("请先预览当前数据范围，并确认传输内容")
            if preview_fingerprint != fingerprint:
                raise ValueError("数据范围或来源已变化，请重新预览并确认")
        if action == "retry_failed":
            with self.uow_factory(immediate=False) as uow:
                previous = uow.ai_analyses.get(analysis_id)
            if (
                previous is None
                or previous["run_id"] != run["run_id"]
                or previous["task"] != task
                or previous["scope_key"] != key
                or previous["source_fingerprint"] != fingerprint
            ):
                raise ValueError("待重试分析不存在或已过期")
            if previous["status"] not in {"partial", "failed"}:
                raise ValueError("该分析没有失败分块可重试")
            failed_ids = set(previous["coverage"].get("failed_packet_ids", []))
            packets = [
                packet for packet in packets if packet["packet_id"] in failed_ids
            ]
            if not packets:
                raise ValueError("当前分析没有可重试的失败分块")

        request_id = request_id or uuid.uuid4().hex
        with self.uow_factory() as uow:
            existing_request = uow.ai_analyses.get_by_request(
                run["run_id"], task, key, request_id
            )
            if existing_request:
                return self._public(existing_request)
            latest = uow.ai_analyses.latest(run["run_id"], task, key)
            if (
                action == "generate"
                and latest
                and latest["source_fingerprint"] == fingerprint
            ):
                return self._public(latest)
            generation = uow.ai_analyses.next_generation(run["run_id"], task, key)
            now = datetime.now(UTC).isoformat()
            reservation = {
                "analysis_id": uuid.uuid4().hex,
                "run_id": run["run_id"],
                "task": task,
                "scope_key": key,
                "source_fingerprint": fingerprint,
                "model": self.config.model_name,
                "prompt_version": PROMPT_VERSION,
                "schema_version": SCHEMA_VERSION,
                "generation": generation,
                "request_id": request_id,
                "status": "running",
                "created_at": now,
                "updated_at": now,
                "result": {"scope": scope, "findings": [], "coverage": {}},
            }
            reservation = uow.ai_analyses.create(reservation)

        try:
            result = analyze_packets(
                packets,
                self.client,
                self.config.model_name,
                PROMPT_VERSION,
                provider=self.config.model_provider,
            )
            if action == "retry_failed":
                old = previous
                actually_failed = set(result["coverage"].get("failed_packet_ids", []))
                remaining = sorted(
                    (
                        set(old["coverage"].get("failed_packet_ids", []))
                        - {p["packet_id"] for p in packets}
                    )
                    | actually_failed
                )
                succeeded = old["coverage"].get("packet_succeeded", 0) + (
                    len(packets) - len(actually_failed)
                )
                total = old["coverage"].get("packet_total", len(packets))
                result["coverage"] = {
                    **old["coverage"],
                    "packet_succeeded": succeeded,
                    "packet_failed": len(remaining),
                    "failed_packet_ids": remaining,
                    "raw_records_total": old["coverage"].get("raw_records_total", 0),
                    "raw_records_included": old["coverage"].get(
                        "raw_records_included", 0
                    ),
                    "packet_total": total,
                    "failure_details": result["coverage"].get("failure_details", []),
                }
                result["findings"] = [*old.get("findings", []), *result["findings"]]
                result["status"] = "partial" if remaining else "complete"
        except Exception as exc:  # noqa: BLE001 - persist a terminal failure state after reserving a generation
            result = {
                "status": "failed",
                "task": task,
                "scope": scope,
                "findings": [],
                "coverage": {
                    "packet_total": len(packets),
                    "packet_succeeded": 0,
                    "packet_failed": len(packets),
                    "failed_packet_ids": [packet["packet_id"] for packet in packets],
                    "failure_details": [
                        {"phase": "analysis", "reason": type(exc).__name__}
                    ],
                },
                "model": self.config.model_name,
                "prompt_version": PROMPT_VERSION,
            }

        with self.uow_factory() as uow:
            saved = uow.ai_analyses.update(
                reservation["analysis_id"], result["status"], result
            )
        return self._public(saved)

    @staticmethod
    def _public(record: dict) -> dict:
        keys = {
            "analysis_id",
            "run_id",
            "task",
            "scope_key",
            "scope",
            "source_fingerprint",
            "model",
            "prompt_version",
            "schema_version",
            "generation",
            "status",
            "findings",
            "coverage",
            "created_at",
            "updated_at",
        }
        return {key: record[key] for key in keys if key in record} | {"stale": False}
