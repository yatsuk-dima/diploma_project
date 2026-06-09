"""add disciplines, group_disciplines, user.discipline_id, admin role

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-26
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create disciplines table
    op.create_table(
        "disciplines",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False, unique=True),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # 2. Create group_disciplines join table
    op.create_table(
        "group_disciplines",
        sa.Column("group_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("groups.id"), primary_key=True),
        sa.Column("discipline_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("disciplines.id"), primary_key=True),
    )

    # 3. Add discipline_id FK to tests (replace text discipline column)
    op.add_column("tests", sa.Column("discipline_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("disciplines.id"), nullable=True))
    op.drop_column("tests", "discipline")

    # 4. Add discipline_id FK to users (for instructors)
    op.add_column("users", sa.Column("discipline_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("disciplines.id"), nullable=True))

    # 5. Add 'admin' to user_role enum
    op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'admin'")


def downgrade() -> None:
    op.drop_column("users", "discipline_id")
    op.add_column("tests", sa.Column("discipline", sa.String(255), nullable=True))
    op.drop_column("tests", "discipline_id")
    op.drop_table("group_disciplines")
    op.drop_table("disciplines")
