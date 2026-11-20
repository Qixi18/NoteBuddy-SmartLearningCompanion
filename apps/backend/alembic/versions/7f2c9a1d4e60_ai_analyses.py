"""Persist versioned, evidence-grounded AI analysis results."""

import sqlalchemy as sa
from alembic import op

revision = "7f2c9a1d4e60"
down_revision = "c46d02ef11a1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ai_analyses",
        sa.Column("analysis_id", sa.String(64), nullable=False),
        sa.Column("run_id", sa.String(64), nullable=False),
        sa.Column("task", sa.String(16), nullable=False),
        sa.Column("scope_key", sa.String(512), nullable=False),
        sa.Column("source_fingerprint", sa.String(64), nullable=False),
        sa.Column("model", sa.String(256), nullable=False),
        sa.Column("prompt_version", sa.String(64), nullable=False),
        sa.Column("schema_version", sa.String(32), nullable=False),
        sa.Column("generation", sa.Integer(), nullable=False),
        sa.Column("request_id", sa.String(128), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("payload_json", sa.Text(), nullable=False),
        sa.Column("created_at", sa.String(64), nullable=False),
        sa.Column("updated_at", sa.String(64), nullable=False),
        sa.ForeignKeyConstraint(
            ["run_id"], ["analysis_runs.run_id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("analysis_id"),
        sa.UniqueConstraint(
            "run_id", "task", "scope_key", "request_id", name="uq_ai_analysis_request"
        ),
        sa.UniqueConstraint(
            "run_id",
            "task",
            "scope_key",
            "generation",
            name="uq_ai_analysis_generation",
        ),
    )
    op.create_index("ix_ai_analyses_run_id", "ai_analyses", ["run_id"])


def downgrade() -> None:
    op.drop_index("ix_ai_analyses_run_id", table_name="ai_analyses")
    op.drop_table("ai_analyses")
