import uuid
from datetime import datetime

from pydantic import BaseModel, field_validator


class UserCreate(BaseModel):
    full_name: str
    login: str
    password: str
    role: str
    group_id: uuid.UUID | None = None
    discipline_ids: list[uuid.UUID] = []

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        if v not in ("admin", "instructor", "student"):
            raise ValueError("Role must be 'admin', 'instructor' or 'student'")
        return v


class UserUpdate(BaseModel):
    full_name: str | None = None
    login: str | None = None
    password: str | None = None
    group_id: uuid.UUID | None = None
    discipline_ids: list[uuid.UUID] | None = None
    is_active: bool | None = None


class UserSchema(BaseModel):
    id: uuid.UUID
    full_name: str
    login: str
    role: str
    group_id: uuid.UUID | None
    group_name: str | None = None
    discipline_ids: list[uuid.UUID] = []
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class UserMeSchema(BaseModel):
    id: uuid.UUID
    full_name: str
    login: str
    role: str
    group_id: uuid.UUID | None
    group_name: str | None = None
    discipline_ids: list[uuid.UUID] = []
    discipline_name: str | None = None

    model_config = {"from_attributes": True}


class PaginatedUsers(BaseModel):
    items: list[UserSchema]
    total: int
    page: int
    per_page: int


class SkippedEntry(BaseModel):
    login: str
    reason: str


class BulkCreateResult(BaseModel):
    created: int
    skipped: list[SkippedEntry]
