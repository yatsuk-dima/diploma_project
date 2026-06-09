"""add matching question type

Revision ID: 0006
Revises: 0005
Create Date: 2026-05-29
"""
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE question_type ADD VALUE IF NOT EXISTS 'matching'")


def downgrade() -> None:
    # PostgreSQL does not support removing values from an enum; downgrade is a no-op
    pass
