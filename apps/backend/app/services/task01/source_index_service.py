"""Build source-index entries for imported learning objectives."""

import json
from pathlib import Path


def build_source_index(
    objectives: list[dict], resources_dir: Path
) -> tuple[list[dict], dict]:
    checks_path = Path(resources_dir) / "source_checks.json"
    checks = (
        json.loads(checks_path.read_text(encoding="utf-8"))
        if checks_path.exists()
        else {}
    )
    index = []
    for objective in objectives:
        topic_id = objective["主题编号"]
        index.append(
            {
                "indicator_id": objective["指标编号"],
                "topic_id": topic_id,
                "curriculum_reference": objective.get("课标文件页／正文页"),
                "textbook_reference": objective.get("教材正文页"),
                "source_check": checks.get(topic_id, {}),
                "verification": "topic_checked_indicator_page_pending"
                if topic_id in checks
                else "pending",
            }
        )
    return index, checks
