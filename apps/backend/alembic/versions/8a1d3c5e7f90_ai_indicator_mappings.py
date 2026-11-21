"""Persist versioned AI generated indicator mappings."""

import sqlalchemy as sa
from alembic import op

revision = "8a1d3c5e7f90"
down_revision = "7f2c9a1d4e60"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ai_indicator_mappings",
        sa.Column("mapping_id", sa.String(64), nullable=False),
        sa.Column("run_id", sa.String(64), nullable=False),
        sa.Column("indicator_id", sa.String(128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("input_fingerprint", sa.String(64), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("payload_json", sa.Text(), nullable=False),
        sa.Column("created_at", sa.String(64), nullable=False),
        sa.ForeignKeyConstraint(
            ["run_id", "indicator_id"],
            ["learning_objectives.run_id", "learning_objectives.indicator_id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("mapping_id"),
        sa.UniqueConstraint(
            "run_id", "indicator_id", "version", name="uq_ai_indicator_mapping_version"
        ),
    )


def downgrade() -> None:
    op.drop_table("ai_indicator_mappings")
