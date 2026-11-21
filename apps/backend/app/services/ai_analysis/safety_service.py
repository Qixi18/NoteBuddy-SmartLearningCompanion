"""Small deterministic safety gate for student-facing AI language."""

import re

_RULES = (
    ("personal_phone", re.compile(r"(?<!\d)1[3-9]\d{9}(?!\d)")),
    ("personal_id_number", re.compile(r"(?<!\d)\d{17}[\dXx](?!\d)")),
    ("personal_email", re.compile(r"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b")),
    ("demeaning_label", re.compile(r"笨蛋|废物|差生|没救了|没有天赋")),
    (
        "unsupported_ability_claim",
        re.compile(
            r"学不会|没有(?:学习|理解|计算)?能力|不适合(?:学习|学)|(?:完全|已经|根本)掌握|未掌握|不掌握"
        ),
    ),
    (
        "answer_reveal",
        re.compile(r"(?:正确答案|标准答案|答案)\s*(?:是|为|[:：])\s*[\w.+−*/=/-]+"),
    ),
)


def inspect_student_text(value: str) -> list[str]:
    """Return policy rule IDs that require rejection or human correction."""
    return [rule_id for rule_id, pattern in _RULES if pattern.search(value)]
