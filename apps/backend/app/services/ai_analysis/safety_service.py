"""Small deterministic safety gate for student-facing AI language."""

import re

_RULES = (
    ("personal_phone", re.compile(r"(?<!\d)1[3-9]\d{9}(?!\d)")),
    ("personal_id_number", re.compile(r"(?<!\d)\d{17}[\dXx](?!\d)")),
    ("demeaning_label", re.compile(r"笨蛋|废物|差生|没救了|没有天赋")),
)


def inspect_student_text(value: str) -> list[str]:
    """Return policy rule IDs that require rejection or human correction."""
    return [rule_id for rule_id, pattern in _RULES if pattern.search(value)]
