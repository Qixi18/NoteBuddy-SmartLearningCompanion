"""Build deterministic, privacy-preserving evidence packets for model analysis."""

from __future__ import annotations

import hashlib
import json


class EvidencePacket(dict):
    """JSON-safe prompt packet with local-only reference restoration metadata."""

    def __init__(self, payload: dict, reference_map: dict[str, dict]):
        super().__init__(payload)
        self.reference_map = reference_map


def _stable_hash(value: object) -> str:
    encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, default=str)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _filtered_metrics(
    run: dict,
    node_id: str | None,
    student_id: str | None,
    indicator_id: str | None,
) -> list[dict]:
    rows = []
    for metric in run.get("metrics", []):
        if not isinstance(metric, dict):
            continue
        key = str(metric.get("key", ""))
        if node_id and node_id not in key and metric.get("node_id") != node_id:
            continue
        kind = str(metric.get("kind", ""))
        if "student" in kind and not student_id:
            continue
        if student_id and "student" in kind:
            if metric.get("student_id") and metric["student_id"] != student_id:
                continue
            if not metric.get("student_id") and not key.startswith(f"{student_id}:"):
                continue
        if indicator_id and metric.get("indicator_id") not in {None, indicator_id}:
            continue
        row = {
            name: value
            for name, value in metric.items()
            if name
            not in {
                "key",
                "record_ids",
                "event_ids",
                "evidence_record_ids",
                "student_id",
                "class_id",
            }
        }
        class_id = metric.get("class_id")
        if not class_id and kind.startswith("class_"):
            class_id = key.split(":", 1)[0]
        if class_id:
            classes = sorted(
                {
                    student.get("模拟班级编号")
                    for student in run.get("students", [])
                    if student.get("模拟班级编号")
                }
            )
            row["class"] = (
                f"班级{classes.index(class_id) + 1}" if class_id in classes else "班级"
            )
        rows.append(row)
    return rows


def _task01_facts(
    run: dict, sources: dict | None = None
) -> tuple[list[dict], list[dict], dict[str, dict]]:
    facts = []
    reference_map: dict[str, dict] = {}
    objectives = run.get("objectives", [])
    for index, objective in enumerate(objectives, 1):
        fact_id = f"fact{index}"
        facts.append(
            {
                "fact_id": fact_id,
                "kind": "curriculum_objective",
                "topic": objective.get("主题", objective.get("主题编号", "")),
                "indicator": objective.get("观察指标", ""),
                "curriculum_locator": objective.get("课标文件页／正文页", ""),
                "textbook_locator": objective.get("教材正文页", ""),
            }
        )
        reference_map[fact_id] = {
            "kind": "objective",
            "indicator_id": objective.get("指标编号"),
            "topic_id": objective.get("主题编号"),
            "text": "",
        }

    source_by_indicator = {
        row.get("indicator_id"): row
        for row in run.get("source_index", [])
        if isinstance(row, dict)
    }
    materials_by_indicator: dict[str, list[dict]] = {}
    for item in run.get("items", []):
        indicator = item.get("指标编号")
        materials_by_indicator.setdefault(str(indicator), []).append(
            {
                "material_type": item.get("材料类型", item.get("题目类型", "")),
                "topic": item.get("主题编号", ""),
                "prompt": item.get("题干或内容", ""),
                "rubric": item.get("评分点", ""),
                "maximum": item.get("满分", ""),
            }
        )
    for fact in facts:
        indicator_id = reference_map[fact["fact_id"]]["indicator_id"]
        source = source_by_indicator.get(indicator_id, {})
        fact["source_status"] = source.get("verification", "pending")
        fact["materials"] = materials_by_indicator.get(str(indicator_id), [])
        reference_map[fact["fact_id"]]["text"] = json.dumps(
            {key: value for key, value in fact.items() if key != "fact_id"},
            ensure_ascii=False,
            sort_keys=True,
        )
    pdf_pages_by_name = {}
    for page in (sources or {}).get("pdf_pages", []):
        if not isinstance(page, dict) or not page.get("text"):
            continue
        alias = f"source{len(pdf_pages_by_name) + 1}"
        pdf_pages_by_name[alias] = {
            "kind": "source",
            "name": page.get("name"),
            "page": page.get("page"),
            "text": page["text"],
        }
    for fact in facts:
        fact["verified_pdf_sources"] = [
            {
                "ref": alias,
                "page": reference["page"],
                "text": reference["text"],
            }
            for alias, reference in pdf_pages_by_name.items()
        ]
    reference_map.update(pdf_pages_by_name)
    return facts, [], reference_map


def _task02_03_units(
    run: dict,
    task: str,
    node_id: str,
    student_id: str | None,
    indicator_id: str | None,
) -> tuple[list[dict], dict[str, dict]]:
    node = next(
        (item for item in run.get("nodes", []) if item.get("节点编号") == node_id),
        None,
    )
    if node is None:
        raise ValueError("测验节点不存在")
    students = {
        row.get("学生编号"): row
        for row in run.get("students", [])
        if row.get("学生编号")
    }
    student_aliases = {
        student_key: f"学生{index}"
        for index, student_key in enumerate(sorted(students), 1)
    }
    item_by_id = {
        row.get("材料编号"): row for row in run.get("items", []) if row.get("材料编号")
    }
    responses = run.get("raw_responses") or run.get("responses", [])
    selected = []
    indicator_aliases = {
        indicator: f"指标{index}"
        for index, indicator in enumerate(
            sorted({row.get("指标编号") for row in run.get("objectives", [])}), 1
        )
    }
    local_records = run.get("raw_responses") or run.get("responses", [])
    record_aliases = {
        row.get("记录编号"): f"证据{index}"
        for index, row in enumerate(local_records, 1)
        if row.get("记录编号")
    }
    for row in responses:
        current_student = row.get("学生编号")
        item = item_by_id.get(row.get("材料编号"), {})
        current_indicator = row.get("指标编号") or item.get("指标编号")
        if row.get("节点编号") != node_id:
            continue
        if student_id and current_student != student_id:
            continue
        if indicator_id and current_indicator != indicator_id:
            continue
        selected.append((row, item, current_student, current_indicator))

    units = []
    reference_map: dict[str, dict] = {}
    for index, (row, item, current_student, current_indicator) in enumerate(
        selected, 1
    ):
        evidence_id = record_aliases.get(row.get("记录编号"), f"evidence{index}")
        evidence_id = evidence_id.replace("证据", "evidence")
        student_alias = student_aliases.get(current_student, "未关联学生")
        text = str(row.get("解答过程", "") or "")
        response = str(row.get("学生最终作答", "") or "")
        units.append(
            {
                "evidence_id": evidence_id,
                "student": student_alias,
                "indicator": indicator_aliases.get(current_indicator, "指标未知"),
                "item": {
                    "type": item.get("材料类型", item.get("题目类型", "")),
                    "topic": item.get("主题编号", ""),
                    "prompt": item.get("题干或内容", ""),
                    "rubric": item.get("评分点", ""),
                    "maximum": row.get("满分", item.get("满分", "")),
                },
                "score": row.get("得分"),
                "score_status": row.get("评分状态", "未知"),
                "disposition": row.get("处置", "未知"),
                "response": response,
                "steps": text,
                "source_line": row.get("_source_line"),
            }
        )
        reference_map[evidence_id] = {
            "kind": "response",
            "record_id": row.get("记录编号"),
            "student_id": current_student,
            "indicator_id": current_indicator,
            "node_id": node_id,
            "material_id": row.get("材料编号"),
            "source_line": row.get("_source_line"),
            "text": "\n".join(part for part in (response, text) if part),
        }
    return units, reference_map


def build_task_packets(
    run: dict,
    task: str,
    node_id: str | None = None,
    sources: dict | None = None,
    *,
    student_id: str | None = None,
    indicator_id: str | None = None,
    max_chars: int = 8000,
) -> list[EvidencePacket]:
    """Build complete prompt packets; identifiers stay in local reference maps."""
    if task not in {"task01", "task02", "task03"}:
        raise ValueError("任务类型无效")
    if task in {"task02", "task03"} and not node_id:
        raise ValueError("该任务必须指定测验节点")
    if max_chars < 1:
        raise ValueError("max_chars必须大于0")

    if task == "task01":
        facts, units, reference_map = _task01_facts(run, sources)
        scope = {"run_id": run.get("run_id"), "task": task}
        metrics = []
        total_records = 0
    else:
        units, reference_map = _task02_03_units(
            run, task, str(node_id), student_id, indicator_id
        )
        scope = {
            "task": task,
            "node": node_id,
            "indicator": indicator_id,
            "student": "指定学生" if student_id else None,
        }
        facts = []
        metrics = _filtered_metrics(run, node_id, student_id, indicator_id)
        for index, metric in enumerate(metrics, 1):
            fact_id = f"fact{index}"
            facts.append({"fact_id": fact_id, "kind": "deterministic_metric", **metric})
            reference_map[fact_id] = {
                "kind": "metric",
                "value": metric,
                "text": json.dumps(metric, ensure_ascii=False, sort_keys=True),
            }
        scoped_rows = [
            row
            for row in (run.get("raw_responses") or run.get("responses", []))
            if row.get("节点编号") == node_id
            and (not student_id or row.get("学生编号") == student_id)
            and (
                not indicator_id
                or row.get("指标编号") == indicator_id
                or next(
                    (
                        item.get("指标编号")
                        for item in run.get("items", [])
                        if item.get("材料编号") == row.get("材料编号")
                    ),
                    None,
                )
                == indicator_id
            )
        ]
        total_records = len(scoped_rows)
        disposition_by_record = {
            (row.get("record_id"), row.get("source_line")): row.get(
                "disposition", "excluded"
            )
            for row in run.get("quality", {}).get("record_dispositions", [])
        }
        dispositions: dict[str, int] = {}
        for row in scoped_rows:
            disposition = disposition_by_record.get(
                (row.get("记录编号"), row.get("_source_line")),
                "unknown",
            )
            dispositions[disposition] = dispositions.get(disposition, 0) + 1
        quality_fact_id = f"fact{len(facts) + 1}"
        quality_fact = {
            "fact_id": quality_fact_id,
            "kind": "quality_coverage",
            "raw_rows": len(scoped_rows),
            "eligible_scored": dispositions.get("scored", 0),
            "dispositions": dispositions,
            "student_count": len(
                {row.get("学生编号") for row in scoped_rows if row.get("学生编号")}
            ),
        }
        facts.append(quality_fact)
        reference_map[quality_fact_id] = {
            "kind": "metric",
            "value": quality_fact,
            "text": json.dumps(quality_fact, ensure_ascii=False, sort_keys=True),
        }

    identifiers = {}
    for field, alias_prefix, rows, key in (
        ("student", "学生", run.get("students", []), "学生编号"),
        ("item", "题目", run.get("items", []), "材料编号"),
        ("indicator", "指标", run.get("objectives", []), "指标编号"),
        ("class", "班级", run.get("students", []), "模拟班级编号"),
        ("node", "节点", run.get("nodes", []), "节点编号"),
    ):
        values = sorted({row.get(key) for row in rows if row.get(key)})
        for index, value in enumerate(values, 1):
            identifiers[str(value)] = f"{alias_prefix}{index}"
    for rows in (run.get("raw_responses", []), run.get("responses", [])):
        values = sorted({row.get("记录编号") for row in rows if row.get("记录编号")})
        for index, value in enumerate(values, 1):
            identifiers[str(value)] = f"evidence{index}"

    def redact(value):
        if isinstance(value, str):
            for identifier, alias in sorted(
                identifiers.items(), key=lambda entry: len(entry[0]), reverse=True
            ):
                value = value.replace(identifier, alias)
            return value
        if isinstance(value, list):
            return [redact(item) for item in value]
        if isinstance(value, dict):
            return {redact(key): redact(item) for key, item in value.items()}
        return value

    packet_payloads: list[tuple[list[dict], list[dict], dict[str, dict]]] = []
    if task == "task01" and facts:
        fact_batches: list[list[dict]] = []
        current_facts: list[dict] = []
        for fact in facts:
            candidate = [*current_facts, fact]
            if (
                current_facts
                and len(json.dumps(candidate, ensure_ascii=False, default=str))
                > max_chars
            ):
                fact_batches.append(current_facts)
                current_facts = []
            current_facts.append(fact)
        fact_batches.append(current_facts)
        for batch in fact_batches:
            batch_refs = {
                fact["fact_id"]: reference_map[fact["fact_id"]] for fact in batch
            }
            packet_payloads.append(([], batch, batch_refs))
    elif not units:
        packet_payloads.append(([], facts, reference_map))
    else:
        current: list[dict] = []
        current_refs: dict[str, dict] = {}
        for unit in units:
            candidate = [*current, unit]
            if (
                current
                and len(json.dumps(candidate, ensure_ascii=False, default=str))
                > max_chars
            ):
                packet_payloads.append(
                    (current, facts, {**reference_map, **current_refs})
                )
                current = []
                current_refs = {}
            current.append(unit)
            current_refs[unit["evidence_id"]] = reference_map[unit["evidence_id"]]
        packet_payloads.append((current, facts, {**reference_map, **current_refs}))

    packets = []
    for index, (packet_units, packet_facts, aliases) in enumerate(packet_payloads, 1):
        packet_metrics = metrics
        payload = {
            "packet_id": f"{task}:{node_id or 'run'}:{index}",
            "task": task,
            "scope": scope,
            "facts": packet_facts,
            "metrics": packet_metrics,
            "evidence_units": packet_units,
            "coverage": {
                "raw_records_total": total_records,
                "raw_records_included": len(packet_units),
                "raw_records_included_all_packets": len(units),
                "evidence_units_in_packet": len(packet_units),
                "packet_index": index,
                "packet_count": len(packet_payloads),
                "omitted_records": 0,
            },
        }
        payload = redact(payload)
        payload["fingerprint"] = _stable_hash(payload)
        for reference in aliases.values():
            if reference.get("text"):
                reference["text"] = redact(reference["text"])
        packets.append(EvidencePacket(payload, aliases))
    return packets
