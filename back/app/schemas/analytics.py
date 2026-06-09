import uuid
from datetime import date, datetime

from pydantic import BaseModel


# ---------------------------------------------------------------------------
# Student analytics
# ---------------------------------------------------------------------------


class AttemptStat(BaseModel):
    attempt_id: uuid.UUID
    test_id: uuid.UUID
    test_title: str
    attempt_number: int
    score: float | None
    theta: float
    status: str
    time_spent_seconds: int | None
    started_at: datetime


class StudentAnalytics(BaseModel):
    student_id: uuid.UUID
    full_name: str
    total_attempts: int
    completed_attempts: int
    avg_score: float | None
    best_score: float | None
    attempts: list[AttemptStat]


# ---------------------------------------------------------------------------
# Group analytics
# ---------------------------------------------------------------------------


class StudentSummary(BaseModel):
    student_id: uuid.UUID
    full_name: str
    total_attempts: int
    avg_score: float | None
    last_theta: float


class GroupAnalytics(BaseModel):
    group_id: uuid.UUID
    group_name: str
    student_count: int
    group_avg_score: float | None
    students: list[StudentSummary]


# ---------------------------------------------------------------------------
# Test analytics
# ---------------------------------------------------------------------------


class TestAnalytics(BaseModel):
    test_id: uuid.UUID
    title: str
    total_attempts: int
    unique_students: int
    avg_score: float | None
    pass_rate: float | None  # percentage, score >= 60
    completed_count: int
    timeout_count: int


# ---------------------------------------------------------------------------
# Per-question stats
# ---------------------------------------------------------------------------


class QuestionStat(BaseModel):
    question_id: uuid.UUID
    question_text: str
    question_type: str
    response_count: int
    correct_rate: float | None  # 0-100 %
    effective_difficulty: float
    irt_difficulty_auto: float | None
    irt_difficulty_override: float | None


class TestQuestionStats(BaseModel):
    test_id: uuid.UUID
    items: list[QuestionStat]


# ---------------------------------------------------------------------------
# Overview (dashboard)
# ---------------------------------------------------------------------------


class DayCount(BaseModel):
    date: date
    count: int


class TopTest(BaseModel):
    test_id: uuid.UUID
    title: str
    avg_score: float | None
    total_attempts: int
    pass_rate: float | None


class OverviewStats(BaseModel):
    total_disciplines: int
    total_tests: int
    active_students: int
    total_groups: int
    total_attempts: int
    completed_attempts: int
    avg_score: float | None
    pass_rate: float | None
    attempts_by_day: list[DayCount]
    top_tests: list[TopTest]
