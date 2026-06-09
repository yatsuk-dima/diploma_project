import uuid
from datetime import datetime

from pydantic import BaseModel

from app.schemas.question import QuestionForStudent


class AttemptCreate(BaseModel):
    test_id: uuid.UUID


class AttemptStartResponse(BaseModel):
    attempt_id: uuid.UUID
    attempt_number: int
    total_questions: int
    time_limit_minutes: int | None
    started_at: datetime
    server_time: datetime
    first_question: QuestionForStudent | None


class AttemptStateResponse(BaseModel):
    attempt_id: uuid.UUID
    test_id: uuid.UUID
    status: str
    attempt_number: int
    started_at: datetime
    time_limit_minutes: int | None
    server_time: datetime


class NextQuestionResponse(BaseModel):
    question: QuestionForStudent
    position: int      # 0-based index
    total: int
    is_last: bool
    started_at: datetime
    time_limit_minutes: int | None
    server_time: datetime


class AnswerSubmit(BaseModel):
    question_id: uuid.UUID
    answer: dict       # {"option_id": ...} | {"option_ids": [...]} | {"text": "..."}


class AnswerResult(BaseModel):
    is_correct: bool | None   # null for open_answer (pending instructor review)
    score: float
    correct_answer: dict


class AttemptFinishResponse(BaseModel):
    attempt_id: uuid.UUID
    status: str
    score: float | None
    max_score: float | None
    pending_review_count: int
    time_spent_seconds: int | None


class AnswerDetail(BaseModel):
    question_id: uuid.UUID
    question_text: str
    question_type: str
    question_options: list | None  # [{id, text}, ...] for choice questions
    student_answer: dict
    correct_answer: dict
    is_correct: bool | None
    score: float


class AttemptResult(BaseModel):
    attempt_id: uuid.UUID
    attempt_number: int
    status: str
    score: float | None
    max_score: float | None
    pending_review_count: int
    answers: list[AnswerDetail]
    # populated for instructor/admin views
    student_name: str | None = None
    test_title: str | None = None
    time_spent_seconds: int | None = None


class AttemptSummary(BaseModel):
    id: uuid.UUID
    test_id: uuid.UUID
    test_title: str
    attempt_number: int
    status: str
    score: float | None
    started_at: datetime
    finished_at: datetime | None


class PaginatedAttempts(BaseModel):
    items: list[AttemptSummary]
    total: int
    page: int
    per_page: int
