import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_async_db
from app.dependencies import get_current_user, require_instructor
from app.models.answer import Answer
from app.models.attempt import Attempt
from app.models.question import Question
from app.models.test import Test
from app.models.user import User
from app.schemas.question import (
    DifficultyPatch,
    DifficultyResponse,
    QuestionCreate,
    QuestionForStudent,
    QuestionSchema,
    QuestionUpdate,
)

router = APIRouter(tags=["questions"])

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _get_test_or_404(test_id: uuid.UUID, db: AsyncSession) -> Test:
    result = await db.execute(select(Test).where(Test.id == test_id, Test.is_deleted.is_(False)))
    test = result.scalar_one_or_none()
    if not test:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test not found")
    return test


async def _has_completed_attempts(test_id: uuid.UUID, db: AsyncSession) -> bool:
    count = (
        await db.execute(
            select(func.count(Attempt.id)).where(
                Attempt.test_id == test_id,
                Attempt.status.in_(["completed", "timeout"]),
            )
        )
    ).scalar_one()
    return count > 0


def _to_schema(q: Question) -> QuestionSchema:
    return QuestionSchema(
        id=q.id,
        test_id=q.test_id,
        type=q.type,
        text=q.text,
        options=q.options,
        correct_answer=q.correct_answer,
        difficulty_level=q.difficulty_level,
        irt_difficulty_auto=q.irt_difficulty_auto,
        irt_difficulty_override=q.irt_difficulty_override,
        irt_response_count=q.irt_response_count,
        effective_difficulty=q.effective_difficulty,
        order=q.order,
        created_at=q.created_at,
    )


# ---------------------------------------------------------------------------
# GET /api/tests/{test_id}/questions
# ---------------------------------------------------------------------------


@router.get("/api/tests/{test_id}/questions")
async def list_questions(
    test_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_async_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[QuestionSchema] | list[QuestionForStudent]:
    test = await _get_test_or_404(test_id, db)

    if current_user.role == "instructor" and test.created_by != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your test")

    questions = (
        await db.execute(
            select(Question)
            .where(Question.test_id == test_id)
            .order_by(Question.order)
        )
    ).scalars().all()

    if current_user.role == "instructor":
        return [_to_schema(q) for q in questions]
    return [QuestionForStudent.model_validate(q) for q in questions]


# ---------------------------------------------------------------------------
# POST /api/tests/{test_id}/questions
# ---------------------------------------------------------------------------


@router.post(
    "/api/tests/{test_id}/questions",
    response_model=QuestionSchema,
    status_code=status.HTTP_201_CREATED,
)
async def create_question(
    test_id: uuid.UUID,
    body: QuestionCreate,
    db: Annotated[AsyncSession, Depends(get_async_db)],
    instructor: Annotated[User, Depends(require_instructor)],
) -> QuestionSchema:
    test = await _get_test_or_404(test_id, db)
    if test.created_by != instructor.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your test")

    if isinstance(body.options, dict):
        options_data = body.options
    elif body.options:
        options_data = [o.model_dump() for o in body.options]
    else:
        options_data = None

    question = Question(
        id=uuid.uuid4(),
        test_id=test_id,
        type=body.type,
        text=body.text,
        options=options_data,
        correct_answer=body.correct_answer,
        difficulty_level=body.difficulty_level,
        order=body.order,
    )
    db.add(question)
    await db.commit()
    await db.refresh(question)
    return _to_schema(question)


# ---------------------------------------------------------------------------
# PUT /api/questions/{question_id}
# ---------------------------------------------------------------------------


@router.put("/api/questions/{question_id}", response_model=QuestionSchema)
async def update_question(
    question_id: uuid.UUID,
    body: QuestionUpdate,
    db: Annotated[AsyncSession, Depends(get_async_db)],
    instructor: Annotated[User, Depends(require_instructor)],
) -> QuestionSchema:
    result = await db.execute(select(Question).where(Question.id == question_id))
    question = result.scalar_one_or_none()
    if not question:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")

    test = await _get_test_or_404(question.test_id, db)
    if test.created_by != instructor.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your test")

    if test.is_published and await _has_completed_attempts(test.id, db):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot modify questions: test is published and has completed attempts",
        )

    if body.text is not None:
        question.text = body.text
    if "options" in body.model_fields_set:
        if isinstance(body.options, dict):
            question.options = body.options
        elif body.options:
            question.options = [o.model_dump() for o in body.options]
        else:
            question.options = None
    if body.correct_answer is not None:
        question.correct_answer = body.correct_answer
    if body.order is not None:
        question.order = body.order
    if "difficulty_level" in body.model_fields_set:
        question.difficulty_level = body.difficulty_level

    await db.commit()
    await db.refresh(question)
    return _to_schema(question)


# ---------------------------------------------------------------------------
# DELETE /api/questions/{question_id}
# ---------------------------------------------------------------------------


@router.delete("/api/questions/{question_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_question(
    question_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_async_db)],
    instructor: Annotated[User, Depends(require_instructor)],
) -> None:
    result = await db.execute(select(Question).where(Question.id == question_id))
    question = result.scalar_one_or_none()
    if not question:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")

    test = await _get_test_or_404(question.test_id, db)
    if test.created_by != instructor.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your test")

    if test.is_published and await _has_completed_attempts(test.id, db):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete questions: test is published and has completed attempts",
        )

    await db.delete(question)
    await db.commit()


# ---------------------------------------------------------------------------
# PATCH /api/questions/{question_id}/difficulty
# ---------------------------------------------------------------------------


@router.patch("/api/questions/{question_id}/difficulty", response_model=DifficultyResponse)
async def patch_difficulty(
    question_id: uuid.UUID,
    body: DifficultyPatch,
    db: Annotated[AsyncSession, Depends(get_async_db)],
    instructor: Annotated[User, Depends(require_instructor)],
) -> DifficultyResponse:
    result = await db.execute(select(Question).where(Question.id == question_id))
    question = result.scalar_one_or_none()
    if not question:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")

    test = await _get_test_or_404(question.test_id, db)
    if test.created_by != instructor.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your test")

    question.irt_difficulty_override = body.override
    await db.commit()
    await db.refresh(question)

    return DifficultyResponse(
        irt_difficulty_override=question.irt_difficulty_override,
        irt_difficulty_auto=question.irt_difficulty_auto,
        effective_difficulty=question.effective_difficulty,
    )
