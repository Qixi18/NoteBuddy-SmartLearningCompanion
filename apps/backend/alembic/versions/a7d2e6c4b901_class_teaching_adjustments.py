"""Add class teaching implementation cycles.

Revision ID: a7d2e6c4b901
Revises: f1c4b7a9d2e0
"""

import sqlalchemy as sa
from alembic import op

revision = "a7d2e6c4b901"
down_revision = "f1c4b7a9d2e0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "class_teaching_adjustments",
        sa.Column("adjustment_id", sa.String(64), nullable=False),
        sa.Column("run_id", sa.String(64), nullable=False),
        sa.Column("class_id", sa.String(128), nullable=False),
        sa.Column("node_id", sa.String(128), nullable=False),
        sa.Column("plan_id", sa.String(64), nullable=False),
        sa.Column("payload_json", sa.Text(), nullable=False),
        sa.Column("created_at", sa.String(64), nullable=False),
        sa.Column("updated_at", sa.String(64), nullable=False),
        sa.ForeignKeyConstraint(
            ["run_id"], ["analysis_runs.run_id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("adjustment_id"),
    )
    op.create_index(
        "ix_class_teaching_adjustments_run_id",
        "class_teaching_adjustments",
        ["run_id"],
    )
    op.create_index(
        "ix_class_teaching_adjustments_class_id",
        "class_teaching_adjustments",
        ["class_id"],
    )
    op.create_index(
        "ix_class_teaching_adjustments_node_id",
        "class_teaching_adjustments",
        ["node_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_class_teaching_adjustments_node_id",
        table_name="class_teaching_adjustments",
    )
    op.drop_index(
        "ix_class_teaching_adjustments_class_id",
        table_name="class_teaching_adjustments",
    )
    op.drop_index(
        "ix_class_teaching_adjustments_run_id",
        table_name="class_teaching_adjustments",
    )
    op.drop_table("class_teaching_adjustments")
