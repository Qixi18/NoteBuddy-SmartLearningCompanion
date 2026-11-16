from enum import StrEnum


class ScoringStatus(StrEnum):
    SCORED = "已评分"
    PENDING = "待评分"
    UNANSWERED = "未作答"
    INVALID = "异常"


class ReviewStatus(StrEnum):
    ACCEPTED = "accepted"
    EDITED = "edited"
    REJECTED = "rejected"
    NEEDS_OBSERVATION = "needs_observation"
