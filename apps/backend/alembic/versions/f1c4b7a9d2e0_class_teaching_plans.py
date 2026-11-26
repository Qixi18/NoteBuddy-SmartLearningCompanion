"""Add versioned class teaching plans.

Revision ID: f1c4b7a9d2e0
Revises: 8a1d3c5e7f90
"""

import sqlalchemy as sa
from alembic import op

revision = "f1c4b7a9d2e0"
down_revision = "8a1d3c5e7f90"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "class_teaching_plans",
        sa.Column("plan_id", sa.String(64), nullable=False),
        sa.Column("run_id", sa.String(64), nullable=False),
        sa.Column("class_id", sa.String(128), nullable=False),
        sa.Column("node_id", sa.String(128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("generation_source", sa.String(16), nullable=False),
        sa.Column("source_fingerprint", sa.String(64), nullable=False),
        sa.Column("analysis_id", sa.String(64), nullable=False, server_default=""),
        sa.Column("reviewer", sa.String(200), nullable=False, server_default=""),
        sa.Column("review_reason", sa.Text(), nullable=False, server_default=""),
        sa.Column("plan_json", sa.Text(), nullable=False),
        sa.Column("evidence_refs_json", sa.Text(), nullable=False),
        sa.Column("created_at", sa.String(64), nullable=False),
        sa.Column("updated_at", sa.String(64), nullable=False),
        sa.ForeignKeyConstraint(
            ["run_id"], ["analysis_runs.run_id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("plan_id"),
        sa.UniqueConstraint(
            "run_id",
            "class_id",
            "node_id",
            "version",
            name="uq_class_teaching_plan_version",
        ),
    )
    op.create_index(
        "ix_class_teaching_plans_run_id", "class_teaching_plans", ["run_id"]
    )
    op.create_index(
        "ix_class_teaching_plans_class_id", "class_teaching_plans", ["class_id"]
    )
    op.create_index(
        "ix_class_teaching_plans_node_id", "class_teaching_plans", ["node_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_class_teaching_plans_node_id", table_name="class_teaching_plans")
    op.drop_index(
        "ix_class_teaching_plans_class_id", table_name="class_teaching_plans"
    )
    op.drop_index("ix_class_teaching_plans_run_id", table_name="class_teaching_plans")
    op.drop_table("class_teaching_plans")
