"""3-tier adaptive testing: nullable position, tier/streak on attempt

Revision ID: 0007
Revises: 0006
Create Date: 2026-06-09
"""
import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Allow dynamic (lazy) position assignment
    op.alter_column("attempt_questions", "position", nullable=True)

    # Track adaptive state per attempt
    op.add_column("attempts", sa.Column("current_tier", sa.String(6), server_default="medium", nullable=False))
    op.add_column("attempts", sa.Column("consecutive_streak", sa.Integer(), server_default="0", nullable=False))


def downgrade() -> None:
    op.drop_column("attempts", "consecutive_streak")
    op.drop_column("attempts", "current_tier")
    # Restore NOT NULL — existing rows will need a default; set 0 for any nulls first
    op.execute("UPDATE attempt_questions SET position = 0 WHERE position IS NULL")
    op.alter_column("attempt_questions", "position", nullable=False)
