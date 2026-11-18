"""Persist run-scoped source signoffs and teacher case versions.

Revision ID: b2f4d2a8c1e0
Revises: da812b1d5423
"""

import sqlalchemy as sa
from alembic import op

revision = "b2f4d2a8c1e0"
down_revision = "da812b1d5423"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "source_verifications",
        sa.Column("run_id", sa.String(64), nullable=False),
        sa.Column("indicator_id", sa.String(128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("payload_json", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(
            ["run_id", "indicator_id"],
            ["learning_objectives.run_id", "learning_objectives.indicator_id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("run_id", "indicator_id", "version"),
    )
    op.create_table(
        "teacher_cases",
        sa.Column("run_id", sa.String(64), nullable=False),
        sa.Column("student_id", sa.String(128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("payload_json", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(
            ["run_id", "student_id"],
            ["students.run_id", "students.student_id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("run_id", "student_id", "version"),
    )


def downgrade() -> None:
    op.drop_table("teacher_cases")
    op.drop_table("source_verifications")
