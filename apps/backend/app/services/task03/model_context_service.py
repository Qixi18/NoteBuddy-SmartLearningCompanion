"""Build bounded, student-scoped and locally aliased model context."""

from __future__ import annotations


def build_model_context(
    bundle: dict, insights: list[dict], selection: dict | None, max_chars: int
) -> dict:
    """Create a prompt-safe context, trimming only complete evidence units.

    ``bundle`` uses the evidence-bundle contract. Every response is joined to
    its scoped item before serialization so a prompt and its rubric stay whole.
    """
    if max_chars < 1:
        raise ValueError("max_chars必须大于0")
    scope = bundle.get("scope", {})
    student_id = scope.get("student_id")
    items = {
        str(row.get("material_id")): row
        for row in bundle.get("items", [])
        if row.get("material_id")
    }
    responses = [
        row
        for row in bundle.get("responses", [])
        if row.get("student_id") == student_id
        and row.get("indicator_id") == scope.get("indicator_id")
        and row.get("node_id") == scope.get("node_id")
        and row.get("material_id") in items
    ]
    record_ids = list(
        dict.fromkeys(
            str(row.get("record_id")) for row in responses if row.get("record_id")
        )
    )
    material_ids = list(dict.fromkeys(str(row.get("material_id")) for row in responses))
    record_aliases = {
        value: f"证据{index + 1}" for index, value in enumerate(record_ids)
    }
    material_aliases = {
        value: f"题目{index + 1}" for index, value in enumerate(material_ids)
    }

    units = []
    for response in responses:
        item_id = str(response["material_id"])
        item = items[item_id]
        observation = response.get("rubric_observation") or {}
        units.append(
            {
                "record_id": record_aliases[str(response["record_id"])],
                "item_id": material_aliases[item_id],
                "prompt": str(item.get("prompt", "") or ""),
                "maximum": str(item.get("maximum", "") or ""),
                "rubric": str(item.get("rubric", "") or ""),
                "score": response.get("score"),
                "score_state": response.get("disposition", "unknown"),
                "steps": str(response.get("solution_steps", "") or ""),
                "rubric_observation": observation,
            }
        )

    selected = []
    resource_aliases = {}
    if selection and selection.get("ready"):
        for item in selection.get("practice_questions", []) + selection.get(
            "learning_resources", []
        ):
            material_id = str(item.get("material_id", ""))
            if material_id:
                if (
                    material_id not in material_aliases
                    and material_id not in resource_aliases
                ):
                    resource_aliases[material_id] = f"资源{len(resource_aliases) + 1}"
                selected.append(
                    {
                        "material_id": (
                            material_aliases[material_id]
                            if material_id in material_aliases
                            else resource_aliases[material_id]
                        ),
                        "title": str(item.get("title", "") or ""),
                        "reason": str(item.get("reason", "") or ""),
                    }
                )

    safe_insights = [
        {
            "claim": str(entry.get("claim", entry.get("text", "")) or ""),
            "evidence_refs": [
                {
                    "record_id": record_aliases.get(str(ref.get("record_id", "")), ""),
                    "description": str(ref.get("description", "") or ""),
                }
                for ref in entry.get("evidence_refs", [])
                if str(ref.get("record_id", "")) in record_aliases
            ],
        }
        for entry in insights
    ]
    fixed = {
        "scope": {
            "indicator_id": scope.get("indicator_id"),
            "node_id": scope.get("node_id"),
        },
        "insights": safe_insights,
        "resources": selected,
        "evidence": [],
    }
    base_size = len(str(fixed))
    included = []
    # Greedy, deterministic truncation happens only between whole item/response
    # units. A prompt, rubric, score and solution step are never split.
    for unit in units:
        if (
            base_size + sum(len(str(row)) for row in included) + len(str(unit))
            <= max_chars
        ):
            included.append(unit)
        else:
            break
    fixed["evidence"] = included
    original_chars = base_size + sum(len(str(row)) for row in units)
    fixed["truncation"] = {
        "applied": len(included) < len(units),
        "included_units": len(included),
        "omitted_units": len(units) - len(included),
        "original_chars_estimate": original_chars,
        "context_chars_estimate": base_size + sum(len(str(row)) for row in included),
    }
    fixed["allowed_record_aliases"] = [unit["record_id"] for unit in included]
    fixed["allowed_score_tokens"] = sorted(
        {
            str(value)
            for unit in included
            for value in (unit.get("score"), unit.get("maximum"))
            if value is not None and str(value).strip()
        }
    )
    fixed["record_aliases"] = {
        alias: record_id
        for record_id, alias in record_aliases.items()
        if alias in fixed["allowed_record_aliases"]
    }
    # Prompt text may contain hostile instructions. Keep it as quoted evidence;
    # callers place the explicit system instruction before this JSON payload.
    fixed["untrusted_text_fields"] = ["prompt", "rubric", "steps", "insights"]
    return fixed
