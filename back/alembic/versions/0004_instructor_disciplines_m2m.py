"""instructor disciplines many-to-many

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-26
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "instructor_disciplines",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("discipline_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("disciplines.id", ondelete="CASCADE"), primary_key=True),
    )

    # Migrate existing single-discipline assignments
    op.execute("""
        INSERT INTO instructor_disciplines (user_id, discipline_id)
        SELECT id, discipline_id FROM users
        WHERE discipline_id IS NOT NULL AND role = 'instructor'
        ON CONFLICT DO NOTHING
    """)

    op.drop_column("users", "discipline_id")


def downgrade() -> None:
    op.add_column("users", sa.Column("discipline_id", postgresql.UUID(as_uuid=True),
                                     sa.ForeignKey("disciplines.id"), nullable=True))
    op.execute("""
        UPDATE users u
        SET discipline_id = id.discipline_id
        FROM instructor_disciplines id
        WHERE u.id = id.user_id
    """)
    op.drop_table("instructor_disciplines")
