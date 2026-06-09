import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.models.attempt_question import AttemptQuestion
from app.models.answer import Answer

PENALTY_WEIGHT = 0.5


def grade_single_choice(student_answer: dict, correct_answer: dict) -> tuple[bool, float]:
    correct = correct_answer.get("option_id")
    selected = student_answer.get("option_id")
    is_correct = selected is not None and selected == correct
    return is_correct, 1.0 if is_correct else 0.0


def grade_multiple_choice(student_answer: dict, correct_answer: dict) -> tuple[bool, float]:
    correct_ids: set[str] = set(correct_answer.get("option_ids", []))
    selected_ids: set[str] = set(student_answer.get("option_ids", []))

    if not correct_ids:
        return True, 1.0

    C = len(correct_ids)
    S = len(selected_ids & correct_ids)
    W = len(selected_ids - correct_ids)

    score = max(0.0, S / C - W * PENALTY_WEIGHT / C)
    is_correct = S == C and W == 0
    return is_correct, round(score, 4)


def grade_open_answer(student_text: str, keywords: list[str], min_match: int) -> float:
    """Auto-grade by keyword substring matching. Returns score in [0, 1].
    is_correct stays None (pending instructor review)."""
    if not keywords:
        return 1.0
    text_lower = student_text.lower()
    matched = sum(1 for kw in keywords if kw.lower() in text_lower)
    return round(matched / len(keywords), 4)


def grade_matching(student_answer: dict, correct_answer: dict) -> tuple[bool, float]:
    correct_pairs = {(p["left_id"], p["right_id"]) for p in correct_answer.get("pairs", [])}
    student_pairs = {(p["left_id"], p["right_id"]) for p in student_answer.get("pairs", [])}
    if not correct_pairs:
        return True, 1.0
    matched = len(correct_pairs & student_pairs)
    score = round(matched / len(correct_pairs), 4)
    return score == 1.0, score


def grade_answer(question_type: str, student_answer: dict, correct_answer: dict) -> tuple[bool | None, float]:
    """Returns (is_correct, score). is_correct is None for open_answer."""
    if question_type == "single_choice":
        is_correct, score = grade_single_choice(student_answer, correct_answer)
        return is_correct, score
    if question_type == "multiple_choice":
        is_correct, score = grade_multiple_choice(student_answer, correct_answer)
        return is_correct, score
    if question_type == "matching":
        is_correct, score = grade_matching(student_answer, correct_answer)
        return is_correct, score
    if question_type == "open_answer":
        keywords = correct_answer.get("keywords", [])
        min_match = correct_answer.get("min_match", 1)
        text = student_answer.get("text", "")
        score = grade_open_answer(text, keywords, min_match)
        return None, score   # is_correct stays null — pending instructor review
    raise ValueError(f"Unknown question type: {question_type}")


# ---------------------------------------------------------------------------
# Score aggregation
# ---------------------------------------------------------------------------

async def calculate_attempt_score(attempt_id: uuid.UUID, db: AsyncSession) -> tuple[float, float]:
    """Returns (score [0..1], max_score=1.0)."""
    total_q = (
        await db.execute(
            select(func.count(AttemptQuestion.id)).where(AttemptQuestion.attempt_id == attempt_id)
        )
    ).scalar_one()

    if total_q == 0:
        return 0.0, 1.0

    total_score = (
        await db.execute(
            select(func.coalesce(func.sum(Answer.score), 0.0)).where(Answer.attempt_id == attempt_id)
        )
    ).scalar_one()

    return round(total_score / total_q, 4), 1.0


def calculate_attempt_score_sync(attempt_id: uuid.UUID, db: Session) -> tuple[float, float]:
    """Sync version for Celery tasks. Returns (score [0..1], max_score=1.0)."""
    total_q = db.execute(
        select(func.count(AttemptQuestion.id)).where(AttemptQuestion.attempt_id == attempt_id)
    ).scalar_one()

    if total_q == 0:
        return 0.0, 1.0

    total_score = db.execute(
        select(func.coalesce(func.sum(Answer.score), 0.0)).where(Answer.attempt_id == attempt_id)
    ).scalar_one()

    return round(total_score / total_q, 4), 1.0
