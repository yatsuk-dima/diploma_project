from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.group import Group
    from app.models.question import Question
    from app.models.attempt import Attempt
    from app.models.discipline import Discipline


class Test(Base):
    __tablename__ = "tests"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    discipline_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("disciplines.id"), nullable=True)
    lesson_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    time_limit_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_attempts: Mapped[int] = mapped_column(Integer, server_default="3", nullable=False)
    is_published: Mapped[bool] = mapped_column(Boolean, server_default="false", nullable=False)
    is_deleted: Mapped[bool] = mapped_column(Boolean, server_default="false", nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)

    creator: Mapped[User] = relationship("User", back_populates="created_tests", foreign_keys=[created_by])
    discipline_rel: Mapped[Discipline | None] = relationship("Discipline", back_populates="tests")
    questions: Mapped[list[Question]] = relationship("Question", back_populates="test")
    assignments: Mapped[list[TestAssignment]] = relationship("TestAssignment", back_populates="test")
    attempts: Mapped[list[Attempt]] = relationship("Attempt", back_populates="test")


class TestAssignment(Base):
    __tablename__ = "test_assignments"

    __table_args__ = (
        CheckConstraint(
            "group_id IS NOT NULL OR student_id IS NOT NULL",
            name="chk_assignment_target",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    test_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tests.id"), nullable=False)
    group_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("groups.id"), nullable=True)
    student_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    available_from: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    available_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    test: Mapped[Test] = relationship("Test", back_populates="assignments")
    group: Mapped[Group | None] = relationship("Group")
    student: Mapped[User | None] = relationship("User", back_populates="assigned_tests", foreign_keys=[student_id])
