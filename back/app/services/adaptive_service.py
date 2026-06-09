import uuid
from typing import Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.attempt_question import AttemptQuestion
from app.models.question import Question

DifficultyTier = Literal["easy", "medium", "hard"]

_TIER_ORDER: list[DifficultyTier] = ["easy", "medium", "hard"]


def update_tier_and_streak(
    current_tier: DifficultyTier,
    streak: int,
    is_correct: bool,
) -> tuple[DifficultyTier, int]:
    """Apply the 2-streak rule. Returns (new_tier, new_streak).

    Two consecutive correct  → move up one tier, reset streak.
    Two consecutive incorrect → move down one tier, reset streak.
    Mixed result             → stay, accumulate streak counter.
    """
    new_streak = (streak + 1 if streak > 0 else 1) if is_correct else (streak - 1 if streak < 0 else -1)

    idx = _TIER_ORDER.index(current_tier)
    if new_streak >= 2:
        return _TIER_ORDER[min(idx + 1, 2)], 0
    if new_streak <= -2:
        return _TIER_ORDER[max(idx - 1, 0)], 0
    return current_tier, new_streak


def _tier_fallback_order(target: DifficultyTier) -> list[DifficultyTier]:
    """Tiers in preference order starting from target, then nearest neighbours."""
    idx = _TIER_ORDER.index(target)
    order: list[DifficultyTier] = [target]
    for offset in range(1, 3):
        if idx + offset <= 2:
            order.append(_TIER_ORDER[idx + offset])
        if idx - offset >= 0:
            order.append(_TIER_ORDER[idx - offset])
    return order


async def pick_next_question(
    attempt_id: uuid.UUID,
    target_tier: DifficultyTier,
    theta: float,
    db: AsyncSession,
) -> AttemptQuestion | None:
    """Pick the best unscheduled question for the given tier.

    Selects from target_tier first; falls back to adjacent tiers if exhausted.
    Within a tier, picks the question with effective_difficulty closest to theta.
    Returns None when all questions are already scheduled.
    """
    rows = (
        await db.execute(
            select(AttemptQuestion, Question)
            .join(Question, Question.id == AttemptQuestion.question_id)
            .where(
                AttemptQuestion.attempt_id == attempt_id,
                AttemptQuestion.position.is_(None),
            )
        )
    ).all()

    if not rows:
        return None

    def effective_tier(q: Question) -> DifficultyTier:
        return q.difficulty_level or "medium"

    for tier in _tier_fallback_order(target_tier):
        candidates = [(aq, q) for aq, q in rows if effective_tier(q) == tier]
        if candidates:
            aq, _ = min(candidates, key=lambda pair: abs(pair[1].effective_difficulty - theta))
            return aq

    return None


async def get_next_scheduled(attempt_id: uuid.UUID, db: AsyncSession) -> AttemptQuestion | None:
    """Return the lowest-position assigned-but-unanswered question."""
    return (
        await db.execute(
            select(AttemptQuestion)
            .where(
                AttemptQuestion.attempt_id == attempt_id,
                AttemptQuestion.position.isnot(None),
                AttemptQuestion.is_answered.is_(False),
            )
            .order_by(AttemptQuestion.position)
            .limit(1)
        )
    ).scalar_one_or_none()
