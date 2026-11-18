"""Pydantic models for stable HTTP request and response contracts."""

from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ImportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    folder: str = Field(min_length=1)

    @field_validator("folder")
    @classmethod
    def folder_must_be_absolute(cls, value: str) -> str:
        value = value.strip()
        if not value or not Path(value).is_absolute():
            raise ValueError("folder 必须是本地绝对路径")
        return value


class DraftRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    student_id: str = Field(min_length=1)
    indicator_id: str = Field(min_length=1)
    node_id: str | None = Field(default=None, min_length=1)


class ReviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    student_id: str = Field(min_length=1)
    indicator_id: str = Field(min_length=1)
    status: Literal["accepted", "edited", "rejected", "needs_observation"]
    diagnosis: str = ""
    recommendation: str = ""
    adjustment_condition: str = ""
    reason: str = ""
    source: Literal["rule", "deepseek"] = "rule"
    model: str | None = None
    prompt_version: str | None = None
    evidence_record_ids: list[str] = Field(default_factory=list)
    original_draft: dict[str, Any] | None = None
    reviewer: str = "教师"
    structured_plan: "StructuredPlan | None" = None


class StructuredPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")
    material_ids: list[str] = Field(default_factory=list)
    activity: str = ""
    steps: list[str] = Field(default_factory=list)
    practice: list[str] = Field(default_factory=list)
    observation_points: list[str] = Field(default_factory=list)


class KnowledgeLink(BaseModel):
    model_config = ConfigDict(extra="forbid")
    target_indicator_id: str = Field(min_length=1)
    relation: str = Field(min_length=1)
    evidence: str = Field(min_length=1)


class SourceVerificationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    indicator_id: str = Field(min_length=1)
    status: Literal["pending", "verified", "rejected"]
    curriculum_locator: str = Field(default="", max_length=500)
    textbook_locator: str = Field(default="", max_length=500)
    material_ids: list[str] = Field(default_factory=list)
    knowledge_links: list[KnowledgeLink] = Field(default_factory=list)
    reviewer: str = Field(default="", max_length=200)
    reason: str = Field(default="", max_length=4000)


class CaseReviewRef(BaseModel):
    model_config = ConfigDict(extra="forbid")
    indicator_id: str = Field(min_length=1)
    node_id: str = Field(min_length=1)
    version: int = Field(ge=1)


class TeacherCaseRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    student_id: str = Field(min_length=1)
    status: Literal["draft", "confirmed", "rejected"]
    narrative: str = Field(default="", max_length=10000)
    limitations: str = Field(default="", max_length=4000)
    evidence_record_ids: list[str] = Field(default_factory=list)
    review_refs: list[CaseReviewRef] = Field(default_factory=list)
    reviewer: str = Field(default="", max_length=200)


class ImportResponse(BaseModel):
    run_id: str
    quality: dict[str, Any]


class QualityReportResponse(BaseModel):
    raw_rows: int
    events: int
    selected_revisions: int
    eligible_scored: int
    excluded_record_ids: list[str]
    finding_counts: dict[str, int]
    findings: list[dict[str, Any]]
    # Additive, optional disposition detail keeps earlier stored snapshots valid.
    record_dispositions: list[dict[str, Any]] = Field(default_factory=list)
    disposition_counts: dict[str, int] = Field(default_factory=dict)
    raw_status_counts: dict[str, int] = Field(default_factory=dict)
    event_disposition_counts: dict[str, int] = Field(default_factory=dict)


class AnalysisRunResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    run_id: str
    created_at: str
    rule_version: str
    quality: QualityReportResponse
    rubric_observations: list[dict[str, Any]] = Field(default_factory=list)
    objectives: list[dict[str, Any]]
    items: list[dict[str, Any]]
    students: list[dict[str, Any]]
    nodes: list[dict[str, Any]]
    field_dictionary: list[dict[str, Any]]
    source_index: list[dict[str, Any]]
    raw_responses: list[dict[str, Any]]
    responses: list[dict[str, Any]]
    metrics: list[dict[str, Any]]
    observations: list[dict[str, Any]]


class CaseSuggestionResponse(BaseModel):
    student_id: str
    type: Literal["部分得分", "表现较好", "记录较少"]
    reason: str
    evidence_record_ids: list[str]


class DraftResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    student_id: str
    indicator_id: str
    objective: str
    diagnosis: str
    recommendation: str
    adjustment_condition: str
    material_ids: list[str]
    score_points_to_review: list[str]
    observation_point: str
    evidence_record_ids: list[str]
    observed_record_ids: list[str]
    source: Literal["rule", "deepseek"]
    status: Literal["needs_review"]
    prompt_version: str | None
    model: str | None
    run_id: str | None = None
    node_id: str | None = None
    scope_required: bool = False
    rule_id: str | None = None
    evidence_kind: str | None = None
    observed_fact: str = ""
    inference_limit: str = ""
    unknown_reason: str | None = None
    steps: list[str] = Field(default_factory=list)
    activity: str | None = None
    source_locator: str | None = None
    evidence_source_lines: list[int] = Field(default_factory=list)


class ReviewRecordResponse(BaseModel):
    status: Literal["accepted", "edited", "rejected", "needs_observation"]
    node_id: str | None = None
    diagnosis: str
    recommendation: str
    adjustment_condition: str
    source: Literal["rule", "deepseek"]
    model: str | None
    prompt_version: str | None
    original_draft: dict[str, Any] | None
    evidence_record_ids: list[str]
    reason: str
    reviewer: str
    version: int
    updated_at: str
    structured_plan: StructuredPlan | None = None
    source_verification_versions: dict[str, int] = Field(default_factory=dict)


class SourceVerificationResponse(SourceVerificationRequest):
    run_id: str
    version: int
    reviewed_at: str


class TeacherCaseResponse(TeacherCaseRequest):
    run_id: str
    version: int
    reviewed_at: str


class ErrorResponse(BaseModel):
    error: str
    code: str
    request_id: str


class HealthResponse(BaseModel):
    status: Literal["ok"]
