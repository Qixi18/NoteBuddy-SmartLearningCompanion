"""Select the unique highest revision for each response event."""

from collections import defaultdict


def select_revisions(
    records: list[dict], findings: list[dict]
) -> tuple[dict, list[dict], list[str]]:
    def issue(code: str, row: dict, detail: str) -> None:
        findings.append(
            {
                "code": code,
                "record_id": row.get("记录编号"),
                "source_line": row.get("_source_line"),
                "detail": detail,
            }
        )

    events: dict[str, list[dict]] = defaultdict(list)
    for row in records:
        event_id = row["作答事件编号"]
        if not event_id.strip():
            issue("missing_event_id", row, "作答事件编号为空")
            continue
        events[event_id].append(row)

    selected: list[dict] = []
    excluded = [row["记录编号"] for row in records if not row["作答事件编号"].strip()]
    for event_id, revisions in events.items():
        if len(revisions) > 1:
            issue(
                "multiple_revisions",
                revisions[0],
                f"事件 {event_id} 有 {len(revisions)} 个版本",
            )
        identities = {
            (row["学生编号"], row["材料编号"], row["节点编号"]) for row in revisions
        }
        if len(identities) != 1:
            for row in revisions:
                issue(
                    "event_identity_conflict",
                    row,
                    f"事件 {event_id} 的学生、材料或节点不一致",
                )
            excluded.extend(row["记录编号"] for row in revisions)
            continue

        parsed = []
        for row in revisions:
            try:
                version = int(row["修订版本"])
            except ValueError:
                issue("invalid_revision", row, "修订版本不是整数")
                excluded.append(row["记录编号"])
                continue
            parsed.append((version, row))
        if not parsed:
            continue
        max_version = max(version for version, _ in parsed)
        highest = [row for version, row in parsed if version == max_version]
        if len(highest) != 1:
            for row in highest:
                issue("revision_conflict", row, f"事件 {event_id} 最高版本重复")
            excluded.extend(row["记录编号"] for row in revisions)
            continue
        selected_row = highest[0]
        excluded.extend(row["记录编号"] for row in revisions if row is not selected_row)
        selected.append(selected_row)
    return events, selected, excluded
