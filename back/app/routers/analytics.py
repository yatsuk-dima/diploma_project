import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_async_db
from app.dependencies import require_instructor
from app.models.user import User
from app.schemas.analytics import (
    GroupAnalytics,
    OverviewStats,
    StudentAnalytics,
    TestAnalytics,
    TestQuestionStats,
)
from app.services.analytics_service import (
    get_group_analytics,
    get_overview,
    get_question_stats,
    get_student_analytics,
    get_test_analytics,
)

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


# ---------------------------------------------------------------------------
# GET /api/analytics/overview
# ---------------------------------------------------------------------------


@router.get("/overview", response_model=OverviewStats)
async def overview(
    db: Annotated[AsyncSession, Depends(get_async_db)],
    current_user: Annotated[User, Depends(require_instructor)],
) -> OverviewStats:
    instructor_id = None if current_user.role == "admin" else current_user.id
    return await get_overview(db, instructor_id=instructor_id)


# ---------------------------------------------------------------------------
# GET /api/analytics/students/{id}
# ---------------------------------------------------------------------------


@router.get("/students/{student_id}", response_model=StudentAnalytics)
async def student_analytics(
    student_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_async_db)],
    _: Annotated[User, Depends(require_instructor)],
    test_id: uuid.UUID | None = Query(None),
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
) -> StudentAnalytics:
    result = await get_student_analytics(
        student_id, db, test_id=test_id, date_from=date_from, date_to=date_to
    )
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")
    return result


# ---------------------------------------------------------------------------
# GET /api/analytics/groups/{id}
# ---------------------------------------------------------------------------


@router.get("/groups/{group_id}", response_model=GroupAnalytics)
async def group_analytics(
    group_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_async_db)],
    _: Annotated[User, Depends(require_instructor)],
    test_id: uuid.UUID | None = Query(None),
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
) -> GroupAnalytics:
    result = await get_group_analytics(
        group_id, db, test_id=test_id, date_from=date_from, date_to=date_to
    )
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")
    return result


# ---------------------------------------------------------------------------
# GET /api/analytics/tests/{id}
# ---------------------------------------------------------------------------


@router.get("/tests/{test_id}", response_model=TestAnalytics)
async def test_analytics(
    test_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_async_db)],
    _: Annotated[User, Depends(require_instructor)],
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
) -> TestAnalytics:
    result = await get_test_analytics(test_id, db, date_from=date_from, date_to=date_to)
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test not found")
    return result


# ---------------------------------------------------------------------------
# GET /api/analytics/tests/{id}/questions
# ---------------------------------------------------------------------------


@router.get("/tests/{test_id}/questions", response_model=TestQuestionStats)
async def test_question_stats(
    test_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_async_db)],
    _: Annotated[User, Depends(require_instructor)],
) -> TestQuestionStats:
    result = await get_question_stats(test_id, db)
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test not found")
    return result
