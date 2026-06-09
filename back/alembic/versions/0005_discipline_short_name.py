"""add short_name to disciplines

Revision ID: 0005
Revises: 0004
Create Date: 2026-05-26
"""
from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("disciplines", sa.Column("short_name", sa.String(20), nullable=True))


def downgrade() -> None:
    op.drop_column("disciplines", "short_name")
