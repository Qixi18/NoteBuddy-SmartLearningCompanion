"""Add cross-run teacher recorded adjustment cycles.

Revision ID: c46d02ef11a1
Revises: b2f4d2a8c1e0
"""

import sqlalchemy as sa
from alembic import op

revision = "c46d02ef11a1"
down_revision = "b2f4d2a8c1e0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "teaching_adjustments",
        sa.Column("adjustment_id", sa.String(64), nullable=False),
        sa.Column("student_id", sa.String(128), nullable=False),
        sa.Column("indicator_id", sa.String(128), nullable=False),
        sa.Column("payload_json", sa.Text(), nullable=False),
        sa.Column("created_at", sa.String(64), nullable=False),
        sa.Column("updated_at", sa.String(64), nullable=False),
        sa.PrimaryKeyConstraint("adjustment_id"),
    )
    op.create_table(
        "teaching_adjustment_origins",
        sa.Column("adjustment_id", sa.String(64), nullable=False),
        sa.Column("student_id", sa.String(128), nullable=False),
        sa.Column("indicator_id", sa.String(128), nullable=False),
        sa.Column("run_id", sa.String(64), nullable=False),
        sa.Column("node_id", sa.String(128), nullable=False),
        sa.Column("review_version", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["adjustment_id"],
            ["teaching_adjustments.adjustment_id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["run_id"], ["analysis_runs.run_id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("adjustment_id"),
    )


def downgrade() -> None:
    op.drop_table("teaching_adjustment_origins")
    op.drop_table("teaching_adjustments")
