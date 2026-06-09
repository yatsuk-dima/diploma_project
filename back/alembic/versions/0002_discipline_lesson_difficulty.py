"""add discipline, lesson_code to tests; difficulty_level to questions

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-26
"""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tests", sa.Column("discipline", sa.String(255), nullable=True))
    op.add_column("tests", sa.Column("lesson_code", sa.String(50), nullable=True))

    difficulty_enum = sa.Enum("easy", "medium", "hard", name="question_difficulty_level")
    difficulty_enum.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "questions",
        sa.Column("difficulty_level", difficulty_enum, nullable=True),
    )


def downgrade() -> None:
    op.drop_column("questions", "difficulty_level")
    sa.Enum(name="question_difficulty_level").drop(op.get_bind(), checkfirst=True)
    op.drop_column("tests", "lesson_code")
    op.drop_column("tests", "discipline")
