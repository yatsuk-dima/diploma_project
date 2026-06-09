from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import String, Text, Table, Column, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.group import Group
    from app.models.test import Test
    from app.models.user import User


group_disciplines = Table(
    "group_disciplines",
    Base.metadata,
    Column("group_id", UUID(as_uuid=True), ForeignKey("groups.id"), primary_key=True),
    Column("discipline_id", UUID(as_uuid=True), ForeignKey("disciplines.id"), primary_key=True),
)

instructor_disciplines = Table(
    "instructor_disciplines",
    Base.metadata,
    Column("user_id", UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("discipline_id", UUID(as_uuid=True), ForeignKey("disciplines.id", ondelete="CASCADE"), primary_key=True),
)


class Discipline(Base):
    __tablename__ = "disciplines"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    short_name: Mapped[str | None] = mapped_column(String(20), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)

    groups: Mapped[list[Group]] = relationship(
        "Group", secondary=group_disciplines, back_populates="disciplines"
    )
    tests: Mapped[list[Test]] = relationship("Test", back_populates="discipline_rel")
    instructors: Mapped[list[User]] = relationship(
        "User", secondary=instructor_disciplines, back_populates="disciplines"
    )
