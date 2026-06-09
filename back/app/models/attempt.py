from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum as SAEnum, Float, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.test import Test
    from app.models.user import User
    from app.models.attempt_question import AttemptQuestion
    from app.models.answer import Answer


class Attempt(Base):
    __tablename__ = "attempts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    test_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tests.id"), nullable=False)
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    attempt_number: Mapped[int] = mapped_column(Integer, nullable=False)
    theta: Mapped[float] = mapped_column(Float, server_default="0.0", nullable=False)
    status: Mapped[str] = mapped_column(
        SAEnum("in_progress", "completed", "timeout", name="attempt_status"),
        server_default="in_progress",
        nullable=False,
    )
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    pending_review_count: Mapped[int] = mapped_column(Integer, server_default="0", nullable=False)
    current_tier: Mapped[str] = mapped_column(String(6), server_default="medium", nullable=False)
    consecutive_streak: Mapped[int] = mapped_column(Integer, server_default="0", nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    time_spent_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)

    test: Mapped[Test] = relationship("Test", back_populates="attempts")
    student: Mapped[User] = relationship("User", back_populates="attempts")
    attempt_questions: Mapped[list[AttemptQuestion]] = relationship(
        "AttemptQuestion", back_populates="attempt", order_by="AttemptQuestion.position"
    )
    answers: Mapped[list[Answer]] = relationship("Answer", back_populates="attempt")
