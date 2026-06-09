"""Tests for adaptive_service — pure logic (no DB required)."""
import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.adaptive_service import update_tier_and_streak, pick_next_question


# ---------------------------------------------------------------------------
# update_tier_and_streak
# ---------------------------------------------------------------------------

def test_two_correct_from_medium_goes_hard():
    tier, streak = update_tier_and_streak("medium", 1, True)
    assert tier == "hard"
    assert streak == 0


def test_two_correct_from_easy_goes_medium():
    tier, streak = update_tier_and_streak("easy", 1, True)
    assert tier == "medium"
    assert streak == 0


def test_two_correct_from_hard_stays_hard():
    tier, streak = update_tier_and_streak("hard", 1, True)
    assert tier == "hard"
    assert streak == 0


def test_two_incorrect_from_medium_goes_easy():
    tier, streak = update_tier_and_streak("medium", -1, False)
    assert tier == "easy"
    assert streak == 0


def test_two_incorrect_from_hard_goes_medium():
    tier, streak = update_tier_and_streak("hard", -1, False)
    assert tier == "medium"
    assert streak == 0


def test_two_incorrect_from_easy_stays_easy():
    tier, streak = update_tier_and_streak("easy", -1, False)
    assert tier == "easy"
    assert streak == 0


def test_mixed_correct_then_wrong_resets_to_minus1():
    # After one correct (streak=1), then one wrong → streak = -1, tier unchanged
    tier, streak = update_tier_and_streak("medium", 1, False)
    assert tier == "medium"
    assert streak == -1


def test_mixed_wrong_then_correct_resets_to_plus1():
    tier, streak = update_tier_and_streak("medium", -1, True)
    assert tier == "medium"
    assert streak == 1


def test_streak_accumulates_within_tier():
    # First answer correct from zero
    tier, streak = update_tier_and_streak("medium", 0, True)
    assert tier == "medium"
    assert streak == 1


# ---------------------------------------------------------------------------
# pick_next_question
# ---------------------------------------------------------------------------

def _make_aq(question_id: uuid.UUID) -> MagicMock:
    aq = MagicMock()
    aq.question_id = question_id
    aq.position = None
    return aq


def _make_question(tier: str | None, difficulty: float, qid: uuid.UUID) -> MagicMock:
    q = MagicMock()
    q.id = qid
    q.difficulty_level = tier
    q.effective_difficulty = difficulty
    return q


def _make_db_for_pick(pairs: list[tuple]) -> AsyncMock:
    """pairs: list of (AttemptQuestion mock, Question mock)."""
    execute_result = MagicMock()
    execute_result.all.return_value = pairs
    db = AsyncMock()
    db.execute.return_value = execute_result
    return db


@pytest.mark.asyncio
async def test_pick_prefers_target_tier():
    ids = [uuid.uuid4(), uuid.uuid4(), uuid.uuid4()]
    pairs = [
        (_make_aq(ids[0]), _make_question("easy", -1.0, ids[0])),
        (_make_aq(ids[1]), _make_question("medium", 0.0, ids[1])),
        (_make_aq(ids[2]), _make_question("hard", 1.5, ids[2])),
    ]
    result = await pick_next_question(uuid.uuid4(), "medium", 0.0, _make_db_for_pick(pairs))
    assert result.question_id == ids[1]


@pytest.mark.asyncio
async def test_pick_falls_back_when_tier_exhausted():
    ids = [uuid.uuid4(), uuid.uuid4()]
    pairs = [
        (_make_aq(ids[0]), _make_question("easy", -1.0, ids[0])),
        (_make_aq(ids[1]), _make_question("easy", -0.5, ids[1])),
    ]
    # Target hard, no hard questions — fallback to medium then easy
    result = await pick_next_question(uuid.uuid4(), "hard", 0.0, _make_db_for_pick(pairs))
    # Should pick closest to theta=0.0 among easy questions: ids[1] (|-0.5|=0.5) vs ids[0] (|-1|=1)
    assert result.question_id == ids[1]


@pytest.mark.asyncio
async def test_pick_none_when_empty():
    result = await pick_next_question(uuid.uuid4(), "medium", 0.0, _make_db_for_pick([]))
    assert result is None


@pytest.mark.asyncio
async def test_pick_treats_null_difficulty_level_as_medium():
    ids = [uuid.uuid4(), uuid.uuid4()]
    pairs = [
        (_make_aq(ids[0]), _make_question(None, 0.1, ids[0])),    # None → treated as medium
        (_make_aq(ids[1]), _make_question("hard", 1.0, ids[1])),
    ]
    result = await pick_next_question(uuid.uuid4(), "medium", 0.0, _make_db_for_pick(pairs))
    assert result.question_id == ids[0]


def test_streak_full_sequence_medium_to_hard_to_easy():
    """Simulate a typical adaptive path from the diagram."""
    tier, streak = "medium", 0

    # ✓✓ → hard
    tier, streak = update_tier_and_streak(tier, streak, True)
    assert tier == "medium" and streak == 1
    tier, streak = update_tier_and_streak(tier, streak, True)
    assert tier == "hard" and streak == 0

    # ✗✗ → medium
    tier, streak = update_tier_and_streak(tier, streak, False)
    assert tier == "hard" and streak == -1
    tier, streak = update_tier_and_streak(tier, streak, False)
    assert tier == "medium" and streak == 0

    # ✗✗ → easy
    tier, streak = update_tier_and_streak(tier, streak, False)
    assert tier == "medium" and streak == -1
    tier, streak = update_tier_and_streak(tier, streak, False)
    assert tier == "easy" and streak == 0

    # ✓✓ → medium
    tier, streak = update_tier_and_streak(tier, streak, True)
    assert tier == "easy" and streak == 1
    tier, streak = update_tier_and_streak(tier, streak, True)
    assert tier == "medium" and streak == 0
