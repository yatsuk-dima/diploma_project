import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_async_db
from app.dependencies import require_instructor
from app.models.answer import Answer
from app.models.attempt import Attempt
from app.models.question import Question
from app.models.user import User
from app.schemas.review import (
    PaginatedPendingAnswers,
    PendingAnswerItem,
    ReviewResult,
    ReviewSubmit,
)

router = APIRouter(prefix="/api/review", tags=["review"])


# ---------------------------------------------------------------------------
# GET /api/review/pending
# ---------------------------------------------------------------------------


@router.get("/pending", response_model=PaginatedPendingAnswers)
async def list_pending_reviews(
    db: Annotated[AsyncSession, Depends(get_async_db)],
    _: Annotated[User, Depends(require_instructor)],
    test_id: uuid.UUID | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
) -> PaginatedPendingAnswers:
    base_filters = [
        Answer.is_correct.is_(None),
        Attempt.status.in_(["completed", "timeout"]),
    ]
    if test_id:
        base_filters.append(Attempt.test_id == test_id)

    base_query = (
        select(Answer)
        .join(Attempt, Attempt.id == Answer.attempt_id)
        .where(*base_filters)
    )

    total = (
        await db.execute(select(func.count()).select_from(base_query.subquery()))
    ).scalar_one()

    rows = (
        await db.execute(
            select(
                Answer.id,
                Answer.attempt_id,
                Answer.question_id,
                Answer.student_answer,
                Answer.score,
                Answer.answered_at,
                Question.text.label("question_text"),
                Attempt.student_id,
                User.full_name.label("student_name"),
            )
            .join(Attempt, Attempt.id == Answer.attempt_id)
            .join(Question, Question.id == Answer.question_id)
            .join(User, User.id == Attempt.student_id)
            .where(*base_filters)
            .order_by(Answer.answered_at.asc())
            .offset((page - 1) * per_page)
            .limit(per_page)
        )
    ).all()

    items = [
        PendingAnswerItem(
            answer_id=r.id,
            attempt_id=r.attempt_id,
            student_id=r.student_id,
            student_name=r.student_name,
            question_id=r.question_id,
            question_text=r.question_text,
            student_answer=r.student_answer,
            auto_score=r.score,
            answered_at=r.answered_at,
        )
        for r in rows
    ]

    return PaginatedPendingAnswers(items=items, total=total, page=page, per_page=per_page)


# ---------------------------------------------------------------------------
# POST /api/review/answers/{answer_id}
# ---------------------------------------------------------------------------


@router.post("/answers/{answer_id}", response_model=ReviewResult)
async def review_answer(
    answer_id: uuid.UUID,
    body: ReviewSubmit,
    db: Annotated[AsyncSession, Depends(get_async_db)],
    _: Annotated[User, Depends(require_instructor)],
) -> ReviewResult:
    answer = (
        await db.execute(select(Answer).where(Answer.id == answer_id))
    ).scalar_one_or_none()
    if not answer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Answer not found")
    if answer.is_correct is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Answer already reviewed"
        )

    attempt = (
        await db.execute(select(Attempt).where(Attempt.id == answer.attempt_id))
    ).scalar_one()
    if attempt.status == "in_progress":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot review answers while attempt is in progress",
        )

    # Apply review
    answer.is_correct = body.is_correct
    answer.score = body.score
    attempt.pending_review_count = max(0, attempt.pending_review_count - 1)

    await db.commit()

    # Enqueue finalization if all reviews done
    if attempt.pending_review_count == 0:
        from app.tasks.irt_tasks import finalize_attempt_after_review
        finalize_attempt_after_review.delay(str(attempt.id))

    return ReviewResult(
        answer_id=answer.id,
        is_correct=body.is_correct,
        score=body.score,
        attempt_pending_review_count=attempt.pending_review_count,
    )
