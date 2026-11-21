"""Pydantic models for stable HTTP request and response contracts."""

from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

MAX_IMPORT_FILES_BYTES = 16 * 1024 * 1024


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


class ImportFilesRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    files: dict[str, str]

    @model_validator(mode="after")
    def csv_content_within_size_limit(self):
        total_bytes = sum(
            len(content.encode("utf-8")) for content in self.files.values()
        )
        if total_bytes > MAX_IMPORT_FILES_BYTES:
            raise ValueError("上传 CSV 内容总大小不能超过 16 MiB")
        return self


class DraftRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    student_id: str = Field(min_length=1)
    indicator_id: str = Field(min_length=1)
    node_id: str | None = Field(default=None, min_length=1)


class AIAnalysisRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    task: Literal["task01", "task02", "task03"]
    action: Literal["generate", "refresh", "retry_failed"] = "generate"
    run_id: str | None = Field(default=None, min_length=1, max_length=64)
    node_id: str | None = Field(default=None, min_length=1, max_length=128)
    student_id: str | None = Field(default=None, min_length=1, max_length=128)
    indicator_id: str | None = Field(default=None, min_length=1, max_length=128)
    analysis_id: str | None = Field(default=None, min_length=1, max_length=64)
    request_id: str = Field(min_length=1, max_length=128)
    transmission_confirmed: Literal[True]

    @model_validator(mode="after")
    def validate_scope(self):
        if bool(self.student_id) != bool(self.indicator_id) and not (
            self.task == "task03" and self.student_id and not self.indicator_id
        ):
            raise ValueError("student_id 与 indicator_id 必须同时提供")
        if self.task == "task03" and not self.node_id and not self.student_id:
            raise ValueError("整体学习建议必须指定学生")
        if self.action == "retry_failed" and not self.analysis_id:
            raise ValueError("retry_failed 必须指定上一条 analysis_id")
        if self.action != "retry_failed" and self.analysis_id:
            raise ValueError("仅 retry_failed 可以指定 analysis_id")
        return self


class AIAnalysisResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    analysis_id: str
    run_id: str
    task: Literal["task01", "task02", "task03"]
    scope_key: str
    scope: dict[str, Any]
    source_fingerprint: str
    model: str
    prompt_version: str
    schema_version: str
    generation: int
    status: Literal["running", "complete", "partial", "insufficient_evidence", "failed"]
    findings: list[dict[str, Any]] = Field(default_factory=list)
    coverage: dict[str, Any] = Field(default_factory=dict)
    created_at: str
    updated_at: str
    stale: bool = False


class AIAnalysisLookupResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    analysis: dict[str, Any] | None = None
    stale: bool = False
    run_id: str
    task: Literal["task01", "task02", "task03"]
    scope: dict[str, Any]
    scope_key: str
    source_fingerprint: str
    provider: str
    model: str
    model_configured: bool
    input_summary: dict[str, Any]


class PlanScopePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    run_id: str = Field(min_length=1)
    student_id: str = Field(min_length=1)
    indicator_id: str = Field(min_length=1)
    node_id: str = Field(min_length=1)


class PlanHintPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    level: Literal["direction", "structure", "local_check"]
    student_prompt: str = Field(min_length=1, max_length=2000)
    teacher_note: str = Field(default="", max_length=2000)


class PlanResourceReasonPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    material_id: str = Field(min_length=1)
    resource_type: str = Field(min_length=1)
    reason_codes: list[str] = Field(min_length=1)
    explanation: str = Field(min_length=1, max_length=2000)


class PlanEvidenceRefPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    evidence_id: str = Field(min_length=1)
    record_id: str = Field(min_length=1)
    material_id: str = Field(min_length=1)
    source_line: int = Field(ge=1)


class TeachingPlanV2Payload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    schema_version: Literal[2]
    scope: PlanScopePayload
    goal: str = Field(min_length=1, max_length=4000)
    purpose: Literal["remediation", "transfer", "diagnostic"]
    material_ids: list[str] = Field(min_length=1, max_length=50)
    resource_reasons: list[PlanResourceReasonPayload] = Field(
        min_length=1, max_length=50
    )
    steps: list[str] = Field(min_length=1, max_length=20)
    hints: list[PlanHintPayload] = Field(min_length=3, max_length=3)
    observation_points: list[str] = Field(min_length=1, max_length=20)
    adjustment_conditions: list[str] = Field(min_length=1, max_length=20)
    evidence_refs: list[PlanEvidenceRefPayload] = Field(min_length=1, max_length=100)
    source_versions: dict[str, int]
    evidence_fingerprint: str = Field(min_length=1, max_length=128)
    template_version: str = Field(min_length=1, max_length=100)
    teacher_review_required: Literal[True]

    @model_validator(mode="after")
    def require_ordered_hints_and_unique_materials(self):
        if [hint.level for hint in self.hints] != [
            "direction",
            "structure",
            "local_check",
        ]:
            raise ValueError("提示须按方向、结构、局部检查三级排列")
        if len(self.material_ids) != len(set(self.material_ids)):
            raise ValueError("方案材料编号不得重复")
        return self


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
    evidence_refs: list[dict[str, Any]] = Field(default_factory=list)
    original_draft: dict[str, Any] | None = None
    reviewer: str = "教师"
    structured_plan: "StructuredPlan | None" = None
    teaching_plan_v2: TeachingPlanV2Payload | None = None


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


class RubricIssueMapping(BaseModel):
    model_config = ConfigDict(extra="forbid")
    issue_id: str = Field(min_length=1, max_length=200)
    label: str = Field(default="", max_length=500)
    rubric_point_ids: list[str] = Field(min_length=1, max_length=50)
    material_ids: list[str] = Field(default_factory=list, max_length=50)
    evidence: str = Field(default="", max_length=4000)
    reviewer: str = Field(default="", max_length=200)
    status: Literal["pending", "verified"] = "pending"


class ResourceLink(BaseModel):
    model_config = ConfigDict(extra="forbid")
    material_id: str = Field(min_length=1, max_length=200)
    purpose: str = Field(min_length=1, max_length=1000)
    indicator_ids: list[str] = Field(min_length=1, max_length=50)
    allowed_node_ids: list[str] = Field(min_length=1, max_length=50)
    source_locator: str = Field(min_length=1, max_length=1000)
    evidence: str = Field(min_length=1, max_length=4000)
    status: Literal["pending", "verified"] = "pending"
    # These values are accepted for response round-tripping, then overwritten
    # from the immutable run material by the application use case.
    resource_type: str = ""
    content_hash: str = ""


class SourceVerificationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    indicator_id: str = Field(min_length=1)
    status: Literal["pending", "verified", "rejected"]
    curriculum_locator: str = Field(default="", max_length=500)
    textbook_locator: str = Field(default="", max_length=500)
    material_ids: list[str] = Field(default_factory=list)
    knowledge_links: list[KnowledgeLink] = Field(default_factory=list)
    rubric_mappings: list[RubricIssueMapping] = Field(default_factory=list)
    resource_links: list[ResourceLink] = Field(default_factory=list)
    source_fingerprints: dict[str, str] = Field(default_factory=dict)
    expected_version: int | None = Field(default=None, ge=0)
    reviewer: str = Field(default="", max_length=200)
    reason: str = Field(default="", max_length=4000)
    # 契约 #5：机器核验层署名。教师签核接口不接受这些字段（见 verify_source 校验），
    # 仅由机器核验管线的内部路径写入。
    verified_by: str | None = Field(default=None, max_length=100)
    confidence: float | None = Field(default=None, ge=0, le=1)
    machine_evidence: list[dict[str, Any]] = Field(default_factory=list)


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
    evidence_refs: list[dict[str, Any]] = Field(default_factory=list)
    review_refs: list[CaseReviewRef] = Field(default_factory=list)
    reviewer: str = Field(default="", max_length=200)


class SubmissionExportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    run_id: str = Field(min_length=1)
    case_ids: list[str] = Field(min_length=3, max_length=3)
    node_id: str = Field(min_length=1)
    preflight_fingerprint: str = Field(min_length=64, max_length=64)
    reviewer: str = Field(min_length=1, max_length=200)
    content_reviewed: bool

    @field_validator("case_ids")
    @classmethod
    def selected_case_ids_are_unique(cls, value: list[str]) -> list[str]:
        if len(set(value)) != len(value):
            raise ValueError("案例学生不能重复")
        return value


class TeachingAdjustmentCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    student_id: str = Field(min_length=1)
    indicator_id: str = Field(min_length=1)
    origin_run_id: str = Field(min_length=1)
    origin_node_id: str = Field(min_length=1)
    review_version: int = Field(ge=1)
    origin_evidence_refs: list[dict[str, Any]] = Field(default_factory=list)
    planned_activity: str = Field(min_length=1, max_length=4000)
    planned_practice: list[str] = Field(min_length=1, max_length=20)
    observation_points: list[str] = Field(min_length=1, max_length=20)
    teacher: str = Field(min_length=1, max_length=200)
    planned_at: str = Field(min_length=1, max_length=64)


class TeachingAdjustmentUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    implementation: str = Field(min_length=1, max_length=8000)
    implementation_status: Literal["completed", "partial", "not_completed"]
    outcome_observations: str = Field(min_length=1, max_length=8000)
    followup_run_id: str = Field(min_length=1)
    followup_node_id: str = Field(min_length=1)
    followup_evidence_record_ids: list[str] = Field(min_length=1)
    followup_evidence_refs: list[dict[str, Any]] = Field(default_factory=list)
    comparability: Literal["comparable", "not_comparable", "undetermined"]
    comparability_reason: str = Field(min_length=1, max_length=4000)
    teacher_conclusion: str = Field(min_length=1, max_length=8000)
    reviewer: str = Field(min_length=1, max_length=200)
    concluded_at: str = Field(min_length=1, max_length=64)


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


class EvidenceBundleResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    scope: dict[str, str]
    responses: list[dict[str, Any]]
    items: list[dict[str, Any]]
    rubric_definitions: list[dict[str, Any]]
    coverage: dict[str, Any]
    source_versions: dict[str, int]
    source_context: dict[str, Any] = Field(default_factory=dict)
    issues: list[dict[str, Any]]
    fingerprint: str


class CaseSuggestionResponse(BaseModel):
    student_id: str
    class_id: str
    type: Literal["部分得分", "表现较好", "记录较少"]
    reason: str
    evidence_record_ids: list[str]


class ResourceSelectionEntryResponse(BaseModel):
    material_id: str
    resource_type: str
    title: str = ""
    purpose: str = ""
    reason_codes: list[str] = Field(default_factory=list)
    reason: str = ""


class ResourceSelectionExcludedResponse(BaseModel):
    material_id: str
    reason_codes: list[str] = Field(default_factory=list)
    reason: str


class ResourceSelectionResponse(BaseModel):
    status: Literal["ready", "blocked"]
    purpose: Literal["remediation", "transfer", "diagnostic"]
    practice_items: list[ResourceSelectionEntryResponse] = Field(default_factory=list)
    learning_resources: list[ResourceSelectionEntryResponse] = Field(
        default_factory=list
    )
    excluded: list[ResourceSelectionExcludedResponse] = Field(default_factory=list)
    reason_codes: list[str] = Field(default_factory=list)
    candidate_node_item_count: int | None = None


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
    resource_selection: ResourceSelectionResponse | None = None
    teaching_plan_preview: TeachingPlanV2Payload | None = None
    teaching_plan_preview_error: str | None = None


class ReviewRecordResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

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
    evidence_refs: list[dict[str, Any]] = Field(default_factory=list)
    reason: str
    reviewer: str
    version: int
    updated_at: str
    structured_plan: StructuredPlan | None = None
    teaching_plan_v2: TeachingPlanV2Payload | None = None
    source_verification_versions: dict[str, int] = Field(default_factory=dict)


class SourceVerificationResponse(SourceVerificationRequest):
    run_id: str
    version: int
    reviewed_at: str
    stale: bool = False


class MachineVerificationRequest(BaseModel):
    """机器核验层触发参数；不指定指标时对当前运行全部指标执行。"""

    model_config = ConfigDict(extra="forbid")

    indicator_id: str | None = Field(default=None, min_length=1)


class MachineVerificationSkipped(BaseModel):
    indicator_id: str
    reason: str


class MachineVerificationResponse(BaseModel):
    verified: list[SourceVerificationResponse] = Field(default_factory=list)
    skipped: list[MachineVerificationSkipped] = Field(default_factory=list)


class MaterialCatalogDocument(BaseModel):
    name: str
    available: bool
    sha256: str | None = None
    bytes: int | None = None
    page_count: int | None = None
    text_page_count: int | None = None
    text_pages: list[int] = Field(default_factory=list)
    expected_file_page: int | None = None
    body_page: int | None = None
    source_kind: Literal["curriculum", "textbook"]
    status: Literal[
        "missing",
        "unreadable",
        "page_out_of_range",
        "needs_manual_review",
        "page_valid_text",
        "locator_required",
    ]
    url: str


class CatalogMaterial(BaseModel):
    material_id: str
    resource_type: str
    topic_id: str = ""
    title: str = ""
    source: str = ""
    source_locator: str = ""
    purpose: str = ""
    verified: bool = False


class IndicatorMaterialCatalog(BaseModel):
    indicator_id: str
    topic_id: str
    source_status: str
    source_stale: bool = False
    curriculum_locator: str = ""
    textbook_locator: str = ""
    documents: list[MaterialCatalogDocument] = Field(default_factory=list)
    materials: list[CatalogMaterial] = Field(default_factory=list)


class MaterialCatalogResponse(BaseModel):
    run_id: str
    indicators: list[IndicatorMaterialCatalog]


class EvidenceReferenceResponse(BaseModel):
    evidence_id: str
    record_id: str | None = None
    source_line: int | None = None
    material_id: str = ""
    description: str = ""


class InsightClaimResponse(BaseModel):
    claim_id: str
    kind: Literal["fact", "rule_observation", "hypothesis"]
    text: str
    evidence_refs: list[EvidenceReferenceResponse] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    review_status: Literal["not_reviewed", "teacher_reviewed"] = "not_reviewed"


class StudentInsightsResponse(BaseModel):
    scope: dict[str, str]
    bundle_fingerprint: str
    claims: list[InsightClaimResponse]


class ClassSummaryResponse(BaseModel):
    class_id: str
    student_count: int
    student_ids: list[str]
    scored_record_count: int


class ClassComparisonMetricsResponse(BaseModel):
    class_id: str
    scored_record_count: int
    observed_student_count: int
    score: float
    maximum: float
    ratio: float | None
    common_score: float | None
    common_maximum: float | None
    common_ratio: float | None
    common_record_count: int


class ClassComparisonResponse(BaseModel):
    indicator_id: str
    status: Literal["available", "unavailable_no_common_questions"]
    common_material_ids: list[str]
    classes: list[ClassComparisonMetricsResponse]


class ClassIssueEvidenceResponse(BaseModel):
    record_id: str
    source_line: int | None
    material_id: str


class ClassIssueCountResponse(BaseModel):
    class_id: str
    affected_count: int
    affected_student_ids: list[str]
    observed_student_count: int
    evidence_refs: list[ClassIssueEvidenceResponse]


class ClassIssueResponse(BaseModel):
    indicator_id: str
    issue_id: str
    label: str
    by_class: list[ClassIssueCountResponse]
    limitations: list[str]


class ClassInsightsResponse(BaseModel):
    run_id: str
    node_id: str
    classes: list[ClassSummaryResponse]
    comparisons: list[ClassComparisonResponse]
    issues: list[ClassIssueResponse]
    limitations: list[str]


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


class ReadinessResponse(BaseModel):
    status: Literal["ready", "ready_with_warnings", "migration_required", "blocked"]
    database: dict[str, Any]
    sources: dict[str, Any]
    frontend: dict[str, Any]
    runtime: dict[str, Any]
    model: dict[str, Any]
    checks: list[dict[str, str]]
