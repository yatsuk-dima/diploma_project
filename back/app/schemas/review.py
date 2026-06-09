import uuid
from datetime import datetime

from pydantic import BaseModel, field_validator


class PendingAnswerItem(BaseModel):
    answer_id: uuid.UUID
    attempt_id: uuid.UUID
    student_id: uuid.UUID
    student_name: str
    question_id: uuid.UUID
    question_text: str
    student_answer: dict
    auto_score: float
    answered_at: datetime

    model_config = {"from_attributes": True}


class PaginatedPendingAnswers(BaseModel):
    items: list[PendingAnswerItem]
    total: int
    page: int
    per_page: int


class ReviewSubmit(BaseModel):
    is_correct: bool
    score: float

    @field_validator("score")
    @classmethod
    def score_range(cls, v: float) -> float:
        if not 0.0 <= v <= 1.0:
            raise ValueError("score must be between 0.0 and 1.0")
        return round(v, 4)


class ReviewResult(BaseModel):
    answer_id: uuid.UUID
    is_correct: bool
    score: float
    attempt_pending_review_count: int
