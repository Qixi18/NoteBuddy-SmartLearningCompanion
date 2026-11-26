"""班级教学方案：带版本、证据引用与来源指纹的教师决策实体。

设计约束（来自 Demo 开发总规划 3.2）：
- 每份方案属于明确的班级与测验节点；
- 每份方案都能追溯到原始分析（analysis_id / evidence_refs / source_fingerprint）；
- 教师修改产生新版本，不覆盖历史；
- 原始数据或来源变化后，旧方案可被标记为过期（stale）；
- AI 或规则引擎都不能自行决定方案已被教师采纳：自动生成只能是 draft。
"""

from dataclasses import asdict, dataclass, replace
from datetime import UTC, datetime

from ..common.exceptions import InvalidReview

PLAN_STATUSES = ("draft", "accepted", "edited", "rejected", "needs_observation")
REVIEW_STATUSES = ("accepted", "edited", "rejected", "needs_observation")
GENERATION_SOURCES = ("rule", "ai")
SCHEMA_VERSION = 1

PLAN_FIELDS = (
    "teaching_objectives",
    "key_problems",
    "teaching_actions",
    "differentiated_actions",
    "resource_recommendations",
    "observation_points",
    "adjustment_conditions",
)
REQUIRED_FIELDS = (
    "teaching_objectives",
    "key_problems",
    "teaching_actions",
    "observation_points",
    "adjustment_conditions",
)

_PLACEHOLDERS = {
    "",
    "待填写",
    "待补充",
    "待确认",
    "todo",
    "tbd",
    "xxx",
}


def _clean_items(values) -> tuple[str, ...]:
    if isinstance(values, str):
        values = [values]
    result = []
    for value in values or ():
        text = str(value).strip()
        if not text:
            continue
        if text.lower() in _PLACEHOLDERS or "[填写" in text or "[待" in text:
            raise InvalidReview("方案内容不能是占位文本")
        result.append(text)
    return tuple(result)


@dataclass(frozen=True, slots=True)
class ClassPlanScope:
    run_id: str
    class_id: str
    node_id: str

    def __post_init__(self) -> None:
        if not (self.run_id and self.class_id and self.node_id):
            raise InvalidReview("班级方案必须绑定运行、班级和测验节点")


@dataclass(frozen=True, slots=True)
class ClassPlanBody:
    teaching_objectives: tuple[str, ...] = ()
    key_problems: tuple[str, ...] = ()
    teaching_actions: tuple[str, ...] = ()
    differentiated_actions: tuple[str, ...] = ()
    resource_recommendations: tuple[str, ...] = ()
    observation_points: tuple[str, ...] = ()
    adjustment_conditions: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        for name in PLAN_FIELDS:
            cleaned = _clean_items(getattr(self, name))
            object.__setattr__(self, name, cleaned)
            if name in REQUIRED_FIELDS and not cleaned:
                raise InvalidReview(f"班级方案缺少必填部分：{name}")

    def to_dict(self) -> dict:
        return {name: list(getattr(self, name)) for name in PLAN_FIELDS}

    @classmethod
    def from_payload(cls, payload: dict | None) -> "ClassPlanBody":
        if payload is None:
            return cls()
        unknown = set(payload) - set(PLAN_FIELDS)
        if unknown:
            raise InvalidReview(f"班级方案包含未知字段：{'、'.join(sorted(unknown))}")
        return cls(**{name: payload.get(name) or () for name in PLAN_FIELDS})


@dataclass(frozen=True, slots=True)
class ClassTeachingPlan:
    plan_id: str
    scope: ClassPlanScope
    version: int
    status: str
    generation_source: str
    source_fingerprint: str
    plan: ClassPlanBody
    evidence_refs: tuple[dict, ...]
    analysis_id: str = ""
    reviewer: str = ""
    review_reason: str = ""
    created_at: str = ""
    updated_at: str = ""
    schema_version: int = SCHEMA_VERSION
    teacher_review_required: bool = True

    def __post_init__(self) -> None:
        if not self.teacher_review_required:
            raise InvalidReview("班级方案必须保留教师复核要求")
        if self.schema_version != SCHEMA_VERSION:
            raise InvalidReview("班级方案版本无效")
        if self.status not in PLAN_STATUSES:
            raise InvalidReview("班级方案状态无效")
        if self.generation_source not in GENERATION_SOURCES:
            raise InvalidReview("班级方案生成来源无效")
        if self.version < 1:
            raise InvalidReview("班级方案版本号必须从 1 开始")
        if not self.source_fingerprint:
            raise InvalidReview("班级方案必须绑定来源指纹")
        if not self.evidence_refs:
            raise InvalidReview("班级方案必须引用班级证据")
        if self.status != "draft" and (not self.reviewer.strip() or not self.review_reason.strip()):
            raise InvalidReview("非草稿状态必须记录审核人和审核说明")

    def to_dict(self) -> dict:
        payload = asdict(self)
        payload["run_id"] = payload.pop("scope")["run_id"]
        payload.pop("node_id", None)
        payload.update(
            {
                "class_id": self.scope.class_id,
                "node_id": self.scope.node_id,
                "plan": self.plan.to_dict(),
                "evidence_refs": [dict(ref) for ref in self.evidence_refs],
            }
        )
        return payload

    def reviewed(
        self,
        status: str,
        reviewer: str,
        reason: str,
        plan: ClassPlanBody | None = None,
    ) -> "ClassTeachingPlan":
        """保存教师审核结果：产生新版本，不覆盖历史记录。"""
        if status not in REVIEW_STATUSES:
            raise InvalidReview("审核状态无效")
        if not reviewer.strip():
            raise InvalidReview("请填写审核人")
        if not reason.strip():
            raise InvalidReview("请填写审核说明")
        changed = plan is not None and plan != self.plan
        if status == "accepted" and changed:
            raise InvalidReview("方案正文已修改，请使用教师修改状态保存")
        if status == "edited" and not changed:
            raise InvalidReview("方案正文没有变化，请使用直接采纳状态保存")
        now = datetime.now(UTC).isoformat()
        return replace(
            self,
            version=self.version + 1,
            status=status,
            plan=plan or self.plan,
            reviewer=reviewer.strip()[:200],
            review_reason=reason.strip()[:4000],
            created_at=self.created_at or now,
            updated_at=now,
        )

    def is_stale(self, current_fingerprint: str) -> bool:
        return self.source_fingerprint != current_fingerprint
