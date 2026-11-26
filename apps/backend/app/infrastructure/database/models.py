from __future__ import annotations

from sqlalchemy import (
    Boolean,
    ForeignKeyConstraint,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class AnalysisRunRow(Base):
    __tablename__ = "analysis_runs"
    run_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    created_at: Mapped[str] = mapped_column(String(64), nullable=False)
    rule_version: Mapped[str] = mapped_column(String(32), nullable=False)
    input_fingerprint: Mapped[str | None] = mapped_column(String(128))
    snapshot_json: Mapped[str] = mapped_column(Text, nullable=False)


class ClassRow(Base):
    __tablename__ = "classes"
    run_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    class_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    name: Mapped[str] = mapped_column(String(256), default="", nullable=False)
    __table_args__ = (
        ForeignKeyConstraint(["run_id"], ["analysis_runs.run_id"], ondelete="CASCADE"),
    )


class StudentRow(Base):
    __tablename__ = "students"
    run_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    student_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    class_id: Mapped[str] = mapped_column(String(128), nullable=False)
    data_json: Mapped[str] = mapped_column(Text, nullable=False)
    __table_args__ = (
        ForeignKeyConstraint(["run_id"], ["analysis_runs.run_id"], ondelete="CASCADE"),
        ForeignKeyConstraint(
            ["run_id", "class_id"], ["classes.run_id", "classes.class_id"]
        ),
    )


class ObjectiveRow(Base):
    __tablename__ = "learning_objectives"
    run_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    indicator_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    topic_id: Mapped[str] = mapped_column(String(128), default="", nullable=False)
    title: Mapped[str] = mapped_column(String(512), default="", nullable=False)
    data_json: Mapped[str] = mapped_column(Text, nullable=False)
    __table_args__ = (
        ForeignKeyConstraint(["run_id"], ["analysis_runs.run_id"], ondelete="CASCADE"),
    )


class ItemRow(Base):
    __tablename__ = "learning_items"
    run_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    material_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    item_type: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    objective_ids_json: Mapped[str] = mapped_column(Text, nullable=False)
    data_json: Mapped[str] = mapped_column(Text, nullable=False)
    __table_args__ = (
        ForeignKeyConstraint(["run_id"], ["analysis_runs.run_id"], ondelete="CASCADE"),
    )


class ItemObjectiveRow(Base):
    __tablename__ = "learning_item_objectives"
    run_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    material_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    indicator_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    __table_args__ = (
        ForeignKeyConstraint(
            ["run_id", "material_id"],
            ["learning_items.run_id", "learning_items.material_id"],
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["run_id", "indicator_id"],
            ["learning_objectives.run_id", "learning_objectives.indicator_id"],
            ondelete="CASCADE",
        ),
    )


class NodeRow(Base):
    __tablename__ = "assessment_nodes"
    run_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    node_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    data_json: Mapped[str] = mapped_column(Text, nullable=False)
    __table_args__ = (
        ForeignKeyConstraint(["run_id"], ["analysis_runs.run_id"], ondelete="CASCADE"),
    )


class ResponseEventRow(Base):
    __tablename__ = "response_events"
    run_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    event_key: Mapped[str] = mapped_column(String(256), primary_key=True)
    event_id: Mapped[str | None] = mapped_column(String(256))
    __table_args__ = (
        ForeignKeyConstraint(["run_id"], ["analysis_runs.run_id"], ondelete="CASCADE"),
    )


class ResponseRow(Base):
    __tablename__ = "responses"
    run_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    record_id: Mapped[str] = mapped_column(String(256), primary_key=True)
    event_key: Mapped[str | None] = mapped_column(String(256))
    is_selected: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    student_id: Mapped[str | None] = mapped_column(String(128), index=True)
    material_id: Mapped[str | None] = mapped_column(String(128), index=True)
    node_id: Mapped[str | None] = mapped_column(String(128), index=True)
    source_line: Mapped[int | None] = mapped_column(Integer)
    data_json: Mapped[str] = mapped_column(Text, nullable=False)
    __table_args__ = (
        ForeignKeyConstraint(["run_id"], ["analysis_runs.run_id"], ondelete="CASCADE"),
        ForeignKeyConstraint(
            ["run_id", "event_key"],
            ["response_events.run_id", "response_events.event_key"],
        ),
        ForeignKeyConstraint(
            ["run_id", "student_id"], ["students.run_id", "students.student_id"]
        ),
        ForeignKeyConstraint(
            ["run_id", "material_id"],
            ["learning_items.run_id", "learning_items.material_id"],
        ),
        ForeignKeyConstraint(
            ["run_id", "node_id"],
            ["assessment_nodes.run_id", "assessment_nodes.node_id"],
        ),
    )


class ReviewRow(Base):
    __tablename__ = "teacher_reviews"
    run_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    student_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    indicator_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    version: Mapped[int] = mapped_column(Integer, primary_key=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(64), nullable=False)
    payload_json: Mapped[str] = mapped_column(Text, nullable=False)
    __table_args__ = (
        ForeignKeyConstraint(["run_id"], ["analysis_runs.run_id"], ondelete="CASCADE"),
    )


class AIAnalysisRow(Base):
    __tablename__ = "ai_analyses"
    analysis_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    run_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    task: Mapped[str] = mapped_column(String(16), nullable=False)
    scope_key: Mapped[str] = mapped_column(String(512), nullable=False)
    source_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    model: Mapped[str] = mapped_column(String(256), nullable=False)
    prompt_version: Mapped[str] = mapped_column(String(64), nullable=False)
    schema_version: Mapped[str] = mapped_column(String(32), nullable=False)
    generation: Mapped[int] = mapped_column(Integer, nullable=False)
    request_id: Mapped[str] = mapped_column(String(128), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    payload_json: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[str] = mapped_column(String(64), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(64), nullable=False)
    __table_args__ = (
        ForeignKeyConstraint(["run_id"], ["analysis_runs.run_id"], ondelete="CASCADE"),
        UniqueConstraint(
            "run_id", "task", "scope_key", "request_id", name="uq_ai_analysis_request"
        ),
        UniqueConstraint(
            "run_id",
            "task",
            "scope_key",
            "generation",
            name="uq_ai_analysis_generation",
        ),
    )


class SourceVerificationRow(Base):
    __tablename__ = "source_verifications"
    run_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    indicator_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    version: Mapped[int] = mapped_column(Integer, primary_key=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    payload_json: Mapped[str] = mapped_column(Text, nullable=False)
    __table_args__ = (
        ForeignKeyConstraint(
            ["run_id", "indicator_id"],
            ["learning_objectives.run_id", "learning_objectives.indicator_id"],
            ondelete="CASCADE",
        ),
    )


class AIIndicatorMappingRow(Base):
    __tablename__ = "ai_indicator_mappings"
    mapping_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    run_id: Mapped[str] = mapped_column(String(64), nullable=False)
    indicator_id: Mapped[str] = mapped_column(String(128), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    input_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    payload_json: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[str] = mapped_column(String(64), nullable=False)
    __table_args__ = (
        UniqueConstraint(
            "run_id", "indicator_id", "version", name="uq_ai_indicator_mapping_version"
        ),
        ForeignKeyConstraint(
            ["run_id", "indicator_id"],
            ["learning_objectives.run_id", "learning_objectives.indicator_id"],
            ondelete="CASCADE",
        ),
    )


class ConfirmedCaseRow(Base):
    __tablename__ = "teacher_cases"
    run_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    student_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    version: Mapped[int] = mapped_column(Integer, primary_key=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    payload_json: Mapped[str] = mapped_column(Text, nullable=False)
    __table_args__ = (
        ForeignKeyConstraint(
            ["run_id", "student_id"],
            ["students.run_id", "students.student_id"],
            ondelete="CASCADE",
        ),
    )


class TeachingAdjustmentRow(Base):
    __tablename__ = "teaching_adjustments"
    adjustment_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    student_id: Mapped[str] = mapped_column(String(128), nullable=False)
    indicator_id: Mapped[str] = mapped_column(String(128), nullable=False)
    payload_json: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[str] = mapped_column(String(64), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(64), nullable=False)
    __table_args__ = ()


class TeachingAdjustmentOriginRow(Base):
    __tablename__ = "teaching_adjustment_origins"
    adjustment_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    student_id: Mapped[str] = mapped_column(String(128), nullable=False)
    indicator_id: Mapped[str] = mapped_column(String(128), nullable=False)
    run_id: Mapped[str] = mapped_column(String(64), nullable=False)
    node_id: Mapped[str] = mapped_column(String(128), nullable=False)
    review_version: Mapped[int] = mapped_column(Integer, nullable=False)
    __table_args__ = (
        ForeignKeyConstraint(["run_id"], ["analysis_runs.run_id"], ondelete="CASCADE"),
        ForeignKeyConstraint(
            ["adjustment_id"],
            ["teaching_adjustments.adjustment_id"],
            ondelete="CASCADE",
        ),
    )


class ClassTeachingPlanRow(Base):
    """班级教学方案：每个版本一行，历史不覆盖。"""

    __tablename__ = "class_teaching_plans"
    plan_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    run_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    class_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    node_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    generation_source: Mapped[str] = mapped_column(String(16), nullable=False)
    source_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    analysis_id: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    reviewer: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    review_reason: Mapped[str] = mapped_column(Text, default="", nullable=False)
    plan_json: Mapped[str] = mapped_column(Text, nullable=False)
    evidence_refs_json: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[str] = mapped_column(String(64), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(64), nullable=False)
    __table_args__ = (
        ForeignKeyConstraint(["run_id"], ["analysis_runs.run_id"], ondelete="CASCADE"),
        UniqueConstraint(
            "run_id", "class_id", "node_id", "version", name="uq_class_teaching_plan_version"
        ),
    )


class ClassTeachingAdjustmentRow(Base):
    """班级级教学实施与复测记录：独立于学生级教学调整。"""

    __tablename__ = "class_teaching_adjustments"
    adjustment_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    run_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    class_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    node_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    plan_id: Mapped[str] = mapped_column(String(64), nullable=False)
    payload_json: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[str] = mapped_column(String(64), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(64), nullable=False)
    __table_args__ = (
        ForeignKeyConstraint(["run_id"], ["analysis_runs.run_id"], ondelete="CASCADE"),
    )


class AppStateRow(Base):
    __tablename__ = "app_state"
    key: Mapped[str] = mapped_column(String(128), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[str] = mapped_column(String(64), nullable=False)
