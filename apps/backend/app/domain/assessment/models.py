from dataclasses import dataclass

from ..common.enums import ScoringStatus
from ..common.exceptions import DomainError, InvalidScore


@dataclass(frozen=True, slots=True)
class Response:
    record_id: str
    event_id: str
    student_id: str
    material_id: str
    node_id: str
    revision_no: int
    scoring_status: ScoringStatus
    score: float | None
    max_score: float
    work_steps: str = ""
    rubric_scores: str = ""
    source_file: str = ""
    source_line: int | None = None

    def __post_init__(self) -> None:
        if not all(
            (
                self.record_id,
                self.event_id,
                self.student_id,
                self.material_id,
                self.node_id,
            )
        ):
            raise DomainError("作答记录标识不能为空")
        if self.revision_no < 1:
            raise DomainError("修订版本必须为正整数")
        if self.max_score <= 0:
            raise InvalidScore("满分必须大于零")
        if self.scoring_status == ScoringStatus.SCORED:
            if self.score is None or self.score < 0 or self.score > self.max_score:
                raise InvalidScore("已评分记录得分必须在 0 到满分之间")
        elif self.score is not None and self.score < 0:
            raise InvalidScore("得分不得为负")

    @property
    def ratio(self) -> float | None:
        if self.scoring_status != ScoringStatus.SCORED or self.score is None:
            return None
        return self.score / self.max_score


@dataclass(frozen=True, slots=True)
class ResponseRevision:
    event_id: str
    revisions: tuple[Response, ...]

    def unique_highest(self) -> Response | None:
        if not self.revisions or any(
            r.event_id != self.event_id for r in self.revisions
        ):
            raise DomainError("修订必须属于同一作答事件")
        identities = {(r.student_id, r.material_id, r.node_id) for r in self.revisions}
        if len(identities) != 1:
            return None
        highest = max(r.revision_no for r in self.revisions)
        matches = [r for r in self.revisions if r.revision_no == highest]
        return matches[0] if len(matches) == 1 else None


@dataclass(frozen=True, slots=True)
class Metric:
    kind: str
    key: str
    score: float
    maximum: float
    count: int
    record_ids: tuple[str, ...]

    def __post_init__(self) -> None:
        if self.maximum < 0 or self.count < 0 or self.score < 0:
            raise DomainError("指标值和计数不得为负")
        if self.score > self.maximum:
            raise DomainError("指标得分不得超过总分")
