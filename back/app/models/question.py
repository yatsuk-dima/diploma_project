from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Enum as SAEnum, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.test import Test
    from app.models.attempt_question import AttemptQuestion
    from app.models.answer import Answer


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    test_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tests.id"), nullable=False)
    type: Mapped[str] = mapped_column(
        SAEnum("single_choice", "multiple_choice", "open_answer", "matching", name="question_type"),
        nullable=False,
    )
    text: Mapped[str] = mapped_column(Text, nullable=False)
    options: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    correct_answer: Mapped[dict] = mapped_column(JSONB, nullable=False)
    difficulty_level: Mapped[str | None] = mapped_column(
        SAEnum("easy", "medium", "hard", name="question_difficulty_level"),
        nullable=True,
    )
    irt_difficulty_auto: Mapped[float | None] = mapped_column(Float, nullable=True)
    irt_difficulty_override: Mapped[float | None] = mapped_column(Float, nullable=True)
    irt_response_count: Mapped[int] = mapped_column(Integer, server_default="0", nullable=False)
    order: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)

    test: Mapped[Test] = relationship("Test", back_populates="questions")
    attempt_questions: Mapped[list[AttemptQuestion]] = relationship("AttemptQuestion", back_populates="question")
    answers: Mapped[list[Answer]] = relationship("Answer", back_populates="question")

    @property
    def effective_difficulty(self) -> float:
        if self.irt_difficulty_override is not None:
            return self.irt_difficulty_override
        if self.irt_difficulty_auto is not None and self.irt_response_count >= 30:
            return self.irt_difficulty_auto
        return 0.0
