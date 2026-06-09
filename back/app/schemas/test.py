import uuid
from datetime import datetime

from pydantic import BaseModel, model_validator


class TestCreate(BaseModel):
    title: str
    description: str | None = None
    discipline_id: uuid.UUID | None = None
    lesson_code: str | None = None
    time_limit_minutes: int | None = None
    max_attempts: int = 3


class TestUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    discipline_id: uuid.UUID | None = None
    lesson_code: str | None = None
    time_limit_minutes: int | None = None
    max_attempts: int | None = None


class TestListSchema(BaseModel):
    id: uuid.UUID
    title: str
    description: str | None
    discipline_id: uuid.UUID | None
    discipline_name: str | None = None
    lesson_code: str | None
    is_published: bool
    time_limit_minutes: int | None
    max_attempts: int
    question_count: int
    created_at: datetime

    model_config = {"from_attributes": True}


class TestSchema(TestListSchema):
    created_by: uuid.UUID
    is_deleted: bool
    assignment_count: int


class PublishResponse(BaseModel):
    is_published: bool


class TestAssignmentCreate(BaseModel):
    group_id: uuid.UUID | None = None
    student_id: uuid.UUID | None = None
    available_from: datetime
    available_until: datetime | None = None

    @model_validator(mode="after")
    def check_target(self) -> "TestAssignmentCreate":
        if self.group_id is None and self.student_id is None:
            raise ValueError("group_id or student_id is required")
        return self


class TestAssignmentSchema(BaseModel):
    id: uuid.UUID
    test_id: uuid.UUID
    group_id: uuid.UUID | None
    student_id: uuid.UUID | None
    available_from: datetime
    available_until: datetime | None

    model_config = {"from_attributes": True}


class PaginatedTests(BaseModel):
    items: list[TestListSchema]
    total: int
    page: int
    per_page: int
