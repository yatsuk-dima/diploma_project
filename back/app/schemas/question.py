import uuid
from datetime import datetime

from pydantic import BaseModel, field_validator


class QuestionOption(BaseModel):
    id: str
    text: str


class QuestionCreate(BaseModel):
    type: str
    text: str
    options: list[QuestionOption] | dict | None = None
    correct_answer: dict
    order: int
    difficulty_level: str | None = None

    @field_validator("type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        if v not in ("single_choice", "multiple_choice", "open_answer", "matching"):
            raise ValueError("type must be single_choice, multiple_choice, open_answer or matching")
        return v

    @field_validator("difficulty_level")
    @classmethod
    def validate_difficulty_level(cls, v: str | None) -> str | None:
        if v is not None and v not in ("easy", "medium", "hard"):
            raise ValueError("difficulty_level must be easy, medium or hard")
        return v


class QuestionUpdate(BaseModel):
    text: str | None = None
    options: list[QuestionOption] | dict | None = None
    correct_answer: dict | None = None
    order: int | None = None
    difficulty_level: str | None = None


class QuestionSchema(BaseModel):
    id: uuid.UUID
    test_id: uuid.UUID
    type: str
    text: str
    options: list | dict | None
    correct_answer: dict
    difficulty_level: str | None
    irt_difficulty_auto: float | None
    irt_difficulty_override: float | None
    irt_response_count: int
    effective_difficulty: float
    order: int
    created_at: datetime

    model_config = {"from_attributes": True}


class QuestionForStudent(BaseModel):
    id: uuid.UUID
    type: str
    text: str
    options: list | dict | None

    model_config = {"from_attributes": True}


class DifficultyPatch(BaseModel):
    override: float | None


class DifficultyResponse(BaseModel):
    irt_difficulty_override: float | None
    irt_difficulty_auto: float | None
    effective_difficulty: float
