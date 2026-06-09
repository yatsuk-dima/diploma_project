from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.attempt import Attempt
    from app.models.question import Question


class AttemptQuestion(Base):
    __tablename__ = "attempt_questions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    attempt_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("attempts.id"), nullable=False, index=True
    )
    question_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("questions.id"), nullable=False)
    position: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_answered: Mapped[bool] = mapped_column(Boolean, server_default="false", nullable=False)

    attempt: Mapped[Attempt] = relationship("Attempt", back_populates="attempt_questions")
    question: Mapped[Question] = relationship("Question", back_populates="attempt_questions")
