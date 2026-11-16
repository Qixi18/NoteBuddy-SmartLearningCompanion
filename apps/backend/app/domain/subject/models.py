from dataclasses import dataclass
from math import isfinite

from ..common.exceptions import DomainError


@dataclass(frozen=True, slots=True)
class LearningObjective:
    indicator_id: str
    topic_id: str
    title: str
    description: str = ""
    source_refs: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        if not self.indicator_id.strip() or not self.topic_id.strip():
            raise DomainError("indicator_id 和 topic_id 不能为空")


@dataclass(frozen=True, slots=True)
class AssessmentItem:
    item_id: str
    item_type: str
    objective_ids: tuple[str, ...]
    max_score: float
    content: str = ""
    source_refs: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        if (
            not self.item_id.strip()
            or not isfinite(self.max_score)
            or self.max_score <= 0
        ):
            raise DomainError("题目编号不能为空且满分必须大于零")


@dataclass(frozen=True, slots=True)
class LearningMaterial:
    material_id: str
    material_type: str
    objective_ids: tuple[str, ...] = ()
    content: str = ""
    resource_uri: str | None = None
    source_refs: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        if not self.material_id.strip():
            raise DomainError("material_id 不能为空")


@dataclass(frozen=True, slots=True)
class AssessmentNode:
    node_id: str
    item_ids: tuple[str, ...] = ()
    date: str | None = None
    topic_id: str | None = None
    description: str = ""
