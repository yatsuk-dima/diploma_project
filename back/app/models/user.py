from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Enum as SAEnum, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.group import Group
    from app.models.refresh_token import RefreshToken
    from app.models.test import Test, TestAssignment
    from app.models.attempt import Attempt
    from app.models.discipline import Discipline, instructor_disciplines


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    login: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(SAEnum("admin", "instructor", "student", name="user_role"), nullable=False)
    group_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("groups.id"), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default="true", nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)

    group: Mapped[Group | None] = relationship("Group", back_populates="students")
    disciplines: Mapped[list[Discipline]] = relationship(
        "Discipline", secondary="instructor_disciplines", back_populates="instructors"
    )
    refresh_tokens: Mapped[list[RefreshToken]] = relationship("RefreshToken", back_populates="user")
    created_tests: Mapped[list[Test]] = relationship("Test", back_populates="creator", foreign_keys="Test.created_by")
    attempts: Mapped[list[Attempt]] = relationship("Attempt", back_populates="student")
    assigned_tests: Mapped[list[TestAssignment]] = relationship(
        "TestAssignment", back_populates="student", foreign_keys="TestAssignment.student_id"
    )
