"""Versioned, evidence-bound teaching plans with a student-safe projection."""

from dataclasses import asdict, dataclass

from ..common.exceptions import InvalidReview


def _is_placeholder(value: str) -> bool:
    normalized = value.strip().lower()
    return (
        not normalized
        or normalized
        in {
            "待填写",
            "待补充",
            "待确认",
            "填写后保存",
            "todo",
            "tbd",
            "xxx",
        }
        or "[填写" in normalized
        or "[待" in normalized
    )


@dataclass(frozen=True, slots=True)
class PlanHint:
    level: str
    student_prompt: str
    teacher_note: str


@dataclass(frozen=True, slots=True)
class PlanResourceReason:
    material_id: str
    resource_type: str
    reason_codes: tuple[str, ...]
    explanation: str


@dataclass(frozen=True, slots=True)
class PlanEvidenceRef:
    evidence_id: str
    record_id: str = ""
    material_id: str = ""
    source_line: int = 0
    kind: str = "response"


@dataclass(frozen=True, slots=True)
class TeachingPlanScope:
    run_id: str
    student_id: str
    indicator_id: str
    node_id: str


@dataclass(frozen=True, slots=True)
class TeachingPlanV2:
    scope: TeachingPlanScope
    goal: str
    purpose: str
    material_ids: tuple[str, ...]
    resource_reasons: tuple[PlanResourceReason, ...]
    steps: tuple[str, ...]
    hints: tuple[PlanHint, ...]
    observation_points: tuple[str, ...]
    adjustment_conditions: tuple[str, ...]
    evidence_refs: tuple[PlanEvidenceRef, ...]
    source_versions: dict[str, int]
    evidence_fingerprint: str
    template_version: str
    schema_version: int = 2
    teacher_review_required: bool = True

    def __post_init__(self) -> None:
        if self.schema_version != 2 or not self.teacher_review_required:
            raise InvalidReview("方案版本无效或缺少教师复核要求")
        if self.purpose not in {"remediation", "transfer", "diagnostic"}:
            raise InvalidReview("方案教学目的无效")
        for name, value in (
            ("goal", self.goal),
            ("evidence_fingerprint", self.evidence_fingerprint),
            ("template_version", self.template_version),
        ):
            if _is_placeholder(value):
                raise InvalidReview(f"方案{name}不能为空")
        has_coverage = bool(self.evidence_refs) and all(
            reference.kind == "coverage" for reference in self.evidence_refs
        )
        if (not self.material_ids and not has_coverage) or len(self.material_ids) != len(
            set(self.material_ids)
        ):
            raise InvalidReview("方案须包含不重复的已核验材料，或使用合法覆盖证据")
        if not has_coverage and not any(
            reason.resource_type == "题目" for reason in self.resource_reasons
        ):
            raise InvalidReview("方案至少须包含一道范围内练习题")
        if not self.steps or any(_is_placeholder(step) for step in self.steps):
            raise InvalidReview("方案须包含有效活动步骤")
        if not self.observation_points or any(
            _is_placeholder(point) for point in self.observation_points
        ):
            raise InvalidReview("方案须包含观察点")
        if not self.adjustment_conditions or any(
            _is_placeholder(condition) for condition in self.adjustment_conditions
        ):
            raise InvalidReview("方案须包含后续调整条件")
        if tuple(hint.level for hint in self.hints) != (
            "direction",
            "structure",
            "local_check",
        ):
            raise InvalidReview("提示须按方向、结构、局部检查三级排列")
        if any(_is_placeholder(hint.student_prompt) for hint in self.hints):
            raise InvalidReview("每级提示都须包含学生可见提示")
        reason_ids = [reason.material_id for reason in self.resource_reasons]
        if set(reason_ids) != set(self.material_ids) or len(reason_ids) != len(
            set(reason_ids)
        ):
            raise InvalidReview("每项方案材料都须有对应的选择理由")
        if any(
            not reason.resource_type.strip()
            or not reason.reason_codes
            or _is_placeholder(reason.explanation)
            for reason in self.resource_reasons
        ):
            raise InvalidReview("每项方案材料都须有有效类型和选择理由")
        if not self.evidence_refs:
            raise InvalidReview("方案须引用作答或覆盖证据")
        if any(
            (ref.kind == "response" and (not ref.record_id or ref.source_line < 1))
            or ref.kind not in {"response", "coverage"}
            for ref in self.evidence_refs
        ):
            raise InvalidReview("方案证据引用格式无效")
        if any(ref.kind == "coverage" for ref in self.evidence_refs) and (
            self.purpose != "diagnostic"
            or any(ref.kind != "coverage" for ref in self.evidence_refs)
        ):
            raise InvalidReview("覆盖证据只能用于纯观察型诊断方案")
        if not self.source_versions or any(
            version < 1 for version in self.source_versions.values()
        ):
            raise InvalidReview("方案须绑定有效的来源签核版本")

    def to_dict(self) -> dict:
        def json_values(value):
            if isinstance(value, tuple):
                return [json_values(item) for item in value]
            if isinstance(value, list):
                return [json_values(item) for item in value]
            if isinstance(value, dict):
                return {key: json_values(item) for key, item in value.items()}
            return value

        return json_values(asdict(self))

    def student_safe_dict(self) -> dict:
        """Keep teacher notes out of a future student-facing plan projection."""
        payload = self.to_dict()
        payload["hints"] = [
            {"level": hint.level, "student_prompt": hint.student_prompt}
            for hint in self.hints
        ]
        return payload
