from dataclasses import dataclass

from ..common.enums import ReviewStatus
from ..common.exceptions import InvalidEvidence, InvalidReview


@dataclass(frozen=True, slots=True)
class Evidence:
    student_id: str
    indicator_id: str
    record_id: str
    material_id: str
    source_file: str
    source_line: int
    score: float | None
    max_score: float

    def __post_init__(self) -> None:
        if not all(
            (
                self.student_id,
                self.indicator_id,
                self.record_id,
                self.material_id,
                self.source_file,
            )
        ):
            raise InvalidEvidence("Evidence 必须可追溯到学生、目标、记录及来源")
        if self.source_line < 1 or self.max_score <= 0:
            raise InvalidEvidence("Evidence 来源行号或满分无效")


@dataclass(frozen=True, slots=True)
class Diagnosis:
    statement: str
    evidence_record_ids: tuple[str, ...]
    evidence_sufficient: bool
    needs_observation: bool = False


@dataclass(frozen=True, slots=True)
class RecommendationDraft:
    student_id: str
    indicator_id: str
    diagnosis: str
    recommendation: str
    material_ids: tuple[str, ...]
    evidence_record_ids: tuple[str, ...]
    adjustment_condition: str = ""
    source: str = "rule"
    model: str | None = None
    prompt_version: str | None = None
    status: str = "needs_review"

    def validate_evidence(self, allowed_record_ids: set[str]) -> None:
        if not self.student_id or not self.indicator_id:
            raise InvalidEvidence("建议必须指定学生和学习目标")
        if not set(self.evidence_record_ids).issubset(allowed_record_ids):
            raise InvalidEvidence("建议引用了不允许的证据")
        if self.status == "accepted":
            raise InvalidReview("草稿不能自行标记为已接受")


@dataclass(frozen=True, slots=True)
class TeacherReview:
    student_id: str
    indicator_id: str
    status: ReviewStatus
    version: int
    recommendation: str = ""
    evidence_record_ids: tuple[str, ...] = ()
    reason: str = ""

    def __post_init__(self) -> None:
        if not self.student_id or not self.indicator_id or self.version < 1:
            raise InvalidReview("复核主体和正整数版本不能为空")
        if self.status == ReviewStatus.EDITED and not self.recommendation.strip():
            raise InvalidReview("修改后的建议不能为空")

    def validate_next(self, previous: "TeacherReview | None") -> None:
        expected = 1 if previous is None else previous.version + 1
        if self.version != expected:
            raise InvalidReview("复核版本必须连续追加")
