import json
import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_async_db
from app.dependencies import get_current_user, require_student
from app.models.answer import Answer
from app.models.attempt import Attempt
from app.models.attempt_question import AttemptQuestion
from app.models.question import Question
from app.models.discipline import Discipline, group_disciplines
from app.models.group import Group
from app.models.test import Test, TestAssignment
from app.models.user import User
from app.redis_client import redis_client
from app.schemas.attempt import (
    AnswerResult,
    AnswerSubmit,
    AttemptCreate,
    AttemptFinishResponse,
    AttemptResult,
    AttemptStartResponse,
    AttemptStateResponse,
    AttemptSummary,
    NextQuestionResponse,
    PaginatedAttempts,
    AnswerDetail,
)
from app.schemas.question import QuestionForStudent
from app.services.adaptive_service import pick_next_question, get_next_scheduled, update_tier_and_streak
from app.services.grading_service import calculate_attempt_score, grade_answer

router = APIRouter(prefix="/api/attempts", tags=["attempts"])

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _student_assignment_filter(user: User):
    if user.group_id:
        return or_(
            TestAssignment.student_id == user.id,
            TestAssignment.group_id == user.group_id,
        )
    return TestAssignment.student_id == user.id


async def _get_student_attempt_or_404(
    attempt_id: uuid.UUID, student_id: uuid.UUID, db: AsyncSession
) -> Attempt:
    result = await db.execute(
        select(Attempt).where(Attempt.id == attempt_id, Attempt.student_id == student_id)
    )
    attempt = result.scalar_one_or_none()
    if not attempt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found")
    return attempt


async def _require_in_progress(attempt: Attempt) -> None:
    if attempt.status != "in_progress":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"detail": f"Attempt is already {attempt.status}", "code": "ATTEMPT_NOT_IN_PROGRESS"},
        )


async def _set_redis_timer(attempt_id: uuid.UUID, started_at: datetime, time_limit_minutes: int | None) -> None:
    if not time_limit_minutes:
        return
    limit_seconds = time_limit_minutes * 60
    payload = json.dumps({"start_epoch": started_at.timestamp(), "limit_seconds": limit_seconds})
    await redis_client.setex(f"timer:{attempt_id}", limit_seconds + 120, payload)


async def _fetch_question_for_student(question_id: uuid.UUID, db: AsyncSession) -> QuestionForStudent:
    q = (await db.execute(select(Question).where(Question.id == question_id))).scalar_one()
    return QuestionForStudent.model_validate(q)


# ---------------------------------------------------------------------------
# GET /api/attempts/my  — MUST be declared before /{attempt_id} routes
# ---------------------------------------------------------------------------


@router.get("/my", response_model=PaginatedAttempts)
async def my_attempts(
    db: Annotated[AsyncSession, Depends(get_async_db)],
    student: Annotated[User, Depends(require_student)],
    test_id: uuid.UUID | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=500),
) -> PaginatedAttempts:
    filters = [Attempt.student_id == student.id]
    if test_id:
        filters.append(Attempt.test_id == test_id)

    total = (await db.execute(select(func.count(Attempt.id)).where(*filters))).scalar_one()

    rows = (
        await db.execute(
            select(Attempt, Test.title)
            .join(Test, Test.id == Attempt.test_id)
            .where(*filters)
            .order_by(Attempt.started_at.desc())
            .offset((page - 1) * per_page)
            .limit(per_page)
        )
    ).all()

    items = [
        AttemptSummary(
            id=a.id,
            test_id=a.test_id,
            test_title=title,
            attempt_number=a.attempt_number,
            status=a.status,
            score=a.score,
            started_at=a.started_at,
            finished_at=a.finished_at,
        )
        for a, title in rows
    ]
    return PaginatedAttempts(items=items, total=total, page=page, per_page=per_page)


# ---------------------------------------------------------------------------
# POST /api/attempts  — start a new attempt
# ---------------------------------------------------------------------------


@router.post("", response_model=AttemptStartResponse, status_code=status.HTTP_201_CREATED)
async def start_attempt(
    body: AttemptCreate,
    db: Annotated[AsyncSession, Depends(get_async_db)],
    student: Annotated[User, Depends(require_student)],
) -> AttemptStartResponse:
    now = _now()

    # 1. Check test exists, published, assigned
    test_row = (
        await db.execute(select(Test).where(Test.id == body.test_id, Test.is_deleted.is_(False)))
    ).scalar_one_or_none()
    if not test_row or not test_row.is_published:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"detail": "Test not found", "code": "TEST_NOT_FOUND"},
        )

    # Check access: student's group must be linked to the test's discipline
    has_access = False
    if test_row.discipline_id and student.group_id:
        row = (
            await db.execute(
                select(group_disciplines).where(
                    group_disciplines.c.group_id == student.group_id,
                    group_disciplines.c.discipline_id == test_row.discipline_id,
                )
            )
        ).first()
        has_access = row is not None
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"detail": "Test not available", "code": "TEST_NOT_AVAILABLE"},
        )

    # 2. Check no active attempt
    in_progress_count = (
        await db.execute(
            select(func.count(Attempt.id)).where(
                Attempt.test_id == body.test_id,
                Attempt.student_id == student.id,
                Attempt.status == "in_progress",
            )
        )
    ).scalar_one()
    if in_progress_count > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"detail": "You already have an active attempt", "code": "ATTEMPT_ALREADY_ACTIVE"},
        )

    # 3. Check max_attempts
    total_attempts = (
        await db.execute(
            select(func.count(Attempt.id)).where(
                Attempt.test_id == body.test_id,
                Attempt.student_id == student.id,
            )
        )
    ).scalar_one()
    if total_attempts >= test_row.max_attempts:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"detail": "Max attempts reached", "code": "ATTEMPT_LIMIT_REACHED"},
        )

    # 4. Resolve initial theta — hierarchical: same test → same discipline → 0.0
    same_test_attempt = (
        await db.execute(
            select(Attempt)
            .where(
                Attempt.test_id == body.test_id,
                Attempt.student_id == student.id,
                Attempt.status.in_(["completed", "timeout"]),
            )
            .order_by(Attempt.started_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()

    if same_test_attempt:
        theta = same_test_attempt.theta
    elif test_row.discipline_id:
        discipline_attempt = (
            await db.execute(
                select(Attempt)
                .join(Test, Test.id == Attempt.test_id)
                .where(
                    Test.discipline_id == test_row.discipline_id,
                    Attempt.student_id == student.id,
                    Attempt.status.in_(["completed", "timeout"]),
                )
                .order_by(Attempt.started_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        theta = discipline_attempt.theta if discipline_attempt else 0.0
    else:
        theta = 0.0

    attempt_number = total_attempts + 1

    # 5. Load all questions for the test
    all_questions = (
        await db.execute(select(Question).where(Question.test_id == body.test_id).order_by(Question.order))
    ).scalars().all()
    if not all_questions:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Test has no questions")

    # 6. Create Attempt (always start at medium tier, streak 0)
    attempt = Attempt(
        id=uuid.uuid4(),
        test_id=body.test_id,
        student_id=student.id,
        attempt_number=attempt_number,
        theta=theta,
        current_tier="medium",
        consecutive_streak=0,
    )
    db.add(attempt)
    await db.flush()

    # 7. Create all AttemptQuestion records with position=None (unscheduled)
    for q in all_questions:
        db.add(AttemptQuestion(
            id=uuid.uuid4(),
            attempt_id=attempt.id,
            question_id=q.id,
            position=None,
        ))
    await db.flush()

    # 8. Pick and schedule the first question from medium tier
    first_aq = await pick_next_question(attempt.id, "medium", theta, db)
    if not first_aq:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Test has no questions")
    first_aq.position = 0

    await db.commit()
    await db.refresh(attempt)

    # 9. Set Redis timer
    await _set_redis_timer(attempt.id, attempt.started_at, test_row.time_limit_minutes)

    # 10. Return first question
    first_q = await _fetch_question_for_student(first_aq.question_id, db)

    return AttemptStartResponse(
        attempt_id=attempt.id,
        attempt_number=attempt_number,
        total_questions=len(all_questions),
        time_limit_minutes=test_row.time_limit_minutes,
        started_at=attempt.started_at,
        server_time=now,
        first_question=first_q,
    )


# ---------------------------------------------------------------------------
# GET /api/attempts/{attempt_id}  — timer state
# ---------------------------------------------------------------------------


@router.get("/{attempt_id}", response_model=AttemptStateResponse)
async def get_attempt_state(
    attempt_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_async_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> AttemptStateResponse:
    result = await db.execute(select(Attempt).where(Attempt.id == attempt_id))
    attempt = result.scalar_one_or_none()
    if not attempt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found")

    # Students can only see their own; instructors can see any
    if current_user.role == "student" and attempt.student_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found")

    test = (await db.execute(select(Test).where(Test.id == attempt.test_id))).scalar_one()

    return AttemptStateResponse(
        attempt_id=attempt.id,
        test_id=attempt.test_id,
        status=attempt.status,
        attempt_number=attempt.attempt_number,
        started_at=attempt.started_at,
        time_limit_minutes=test.time_limit_minutes,
        server_time=_now(),
    )


# ---------------------------------------------------------------------------
# GET /api/attempts/{attempt_id}/next
# ---------------------------------------------------------------------------


@router.get("/{attempt_id}/next", response_model=NextQuestionResponse)
async def get_next_question(
    attempt_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_async_db)],
    student: Annotated[User, Depends(require_student)],
) -> NextQuestionResponse:
    attempt = await _get_student_attempt_or_404(attempt_id, student.id, db)
    await _require_in_progress(attempt)

    aq = await get_next_scheduled(attempt_id, db)
    if not aq:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="all_answered"
        )

    total = (
        await db.execute(
            select(func.count(AttemptQuestion.id)).where(AttemptQuestion.attempt_id == attempt_id)
        )
    ).scalar_one()

    test = (await db.execute(select(Test).where(Test.id == attempt.test_id))).scalar_one()
    question = await _fetch_question_for_student(aq.question_id, db)

    return NextQuestionResponse(
        question=question,
        position=aq.position,
        total=total,
        is_last=(aq.position == total - 1),
        started_at=attempt.started_at,
        time_limit_minutes=test.time_limit_minutes,
        server_time=_now(),
    )


# ---------------------------------------------------------------------------
# POST /api/attempts/{attempt_id}/answer
# ---------------------------------------------------------------------------


@router.post("/{attempt_id}/answer", response_model=AnswerResult)
async def submit_answer(
    attempt_id: uuid.UUID,
    body: AnswerSubmit,
    db: Annotated[AsyncSession, Depends(get_async_db)],
    student: Annotated[User, Depends(require_student)],
) -> AnswerResult:
    attempt = await _get_student_attempt_or_404(attempt_id, student.id, db)
    await _require_in_progress(attempt)

    # Verify question belongs to this attempt
    aq = (
        await db.execute(
            select(AttemptQuestion).where(
                AttemptQuestion.attempt_id == attempt_id,
                AttemptQuestion.question_id == body.question_id,
            )
        )
    ).scalar_one_or_none()
    if not aq:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Question not in this attempt")
    if aq.position is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"detail": "Question has not been presented yet", "code": "QUESTION_NOT_PRESENTED"},
        )
    if aq.is_answered:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"detail": "Question already answered", "code": "QUESTION_ALREADY_ANSWERED"},
        )

    # Load question
    question = (await db.execute(select(Question).where(Question.id == body.question_id))).scalar_one()

    # Grade
    is_correct, score = grade_answer(question.type, body.answer, question.correct_answer)

    # Persist answer
    db.add(Answer(
        id=uuid.uuid4(),
        attempt_id=attempt_id,
        question_id=body.question_id,
        student_answer=body.answer,
        is_correct=is_correct,
        score=score,
    ))

    # Mark question as answered
    aq.is_answered = True

    # Increment pending_review_count for open_answer
    if question.type == "open_answer":
        attempt.pending_review_count += 1

    # Update tier/streak and schedule the next question.
    # open_answer is skipped (is_correct=None) — doesn't affect streak.
    if is_correct is not None:
        new_tier, new_streak = update_tier_and_streak(
            attempt.current_tier, attempt.consecutive_streak, is_correct
        )
        attempt.current_tier = new_tier
        attempt.consecutive_streak = new_streak
    await db.flush()

    next_aq = await pick_next_question(attempt_id, attempt.current_tier, attempt.theta, db)
    if next_aq:
        next_aq.position = aq.position + 1

    await db.commit()

    return AnswerResult(
        is_correct=is_correct,
        score=score,
        correct_answer=question.correct_answer,
    )


# ---------------------------------------------------------------------------
# POST /api/attempts/{attempt_id}/finish
# ---------------------------------------------------------------------------


@router.post("/{attempt_id}/finish", response_model=AttemptFinishResponse)
async def finish_attempt(
    attempt_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_async_db)],
    student: Annotated[User, Depends(require_student)],
) -> AttemptFinishResponse:
    attempt = await _get_student_attempt_or_404(attempt_id, student.id, db)
    await _require_in_progress(attempt)

    now = _now()
    test = (await db.execute(select(Test).where(Test.id == attempt.test_id))).scalar_one()

    time_spent = int((now - attempt.started_at).total_seconds())
    if test.time_limit_minutes:
        time_spent = min(time_spent, test.time_limit_minutes * 60)

    attempt.status = "completed"
    attempt.finished_at = now
    attempt.time_spent_seconds = time_spent

    score, max_score = await calculate_attempt_score(attempt_id, db)
    attempt.score = score
    attempt.max_score = max_score

    await db.commit()

    # Delete Redis timer key
    await redis_client.delete(f"timer:{attempt_id}")

    # Enqueue IRT recalculation if no open answers pending review
    if attempt.pending_review_count == 0:
        from app.tasks.irt_tasks import recalculate_theta
        recalculate_theta.delay(str(attempt_id))

    return AttemptFinishResponse(
        attempt_id=attempt.id,
        status=attempt.status,
        score=attempt.score,
        max_score=attempt.max_score,
        pending_review_count=attempt.pending_review_count,
        time_spent_seconds=attempt.time_spent_seconds,
    )


# ---------------------------------------------------------------------------
# GET /api/attempts/{attempt_id}/result
# ---------------------------------------------------------------------------


@router.get("/{attempt_id}/result", response_model=AttemptResult)
async def get_attempt_result(
    attempt_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_async_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> AttemptResult:
    result = await db.execute(select(Attempt).where(Attempt.id == attempt_id))
    attempt = result.scalar_one_or_none()
    if not attempt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found")

    # Students can only view their own attempts; instructors/admins can view any
    if current_user.role == "student" and attempt.student_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found")

    if attempt.status == "in_progress":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Attempt is still in progress"
        )

    rows = (
        await db.execute(
            select(Answer, Question.text, Question.type, Question.correct_answer, Question.options)
            .join(Question, Question.id == Answer.question_id)
            .where(Answer.attempt_id == attempt_id)
            .order_by(Answer.answered_at)
        )
    ).all()

    answers = [
        AnswerDetail(
            question_id=ans.question_id,
            question_text=q_text,
            question_type=q_type,
            question_options=q_options if q_type in ("single_choice", "multiple_choice") else None,
            student_answer=ans.student_answer,
            correct_answer=q_correct,
            is_correct=ans.is_correct,
            score=ans.score,
        )
        for ans, q_text, q_type, q_correct, q_options in rows
    ]

    # Load extra context for instructor/admin views
    student_name: str | None = None
    test_title: str | None = None
    if current_user.role in ("instructor", "admin"):
        student_row = (await db.execute(select(User).where(User.id == attempt.student_id))).scalar_one_or_none()
        test_row = (await db.execute(select(Test).where(Test.id == attempt.test_id))).scalar_one_or_none()
        student_name = student_row.full_name if student_row else None
        test_title = test_row.title if test_row else None

    return AttemptResult(
        attempt_id=attempt.id,
        attempt_number=attempt.attempt_number,
        status=attempt.status,
        score=attempt.score,
        max_score=attempt.max_score,
        pending_review_count=attempt.pending_review_count,
        time_spent_seconds=attempt.time_spent_seconds,
        answers=answers,
        student_name=student_name,
        test_title=test_title,
    )
