import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy.orm import selectinload

from app.database import get_async_db
from app.dependencies import get_current_user, require_instructor
from app.models.attempt import Attempt
from app.models.discipline import Discipline, group_disciplines
from app.models.question import Question
from app.models.test import Test, TestAssignment
from app.models.user import User
from app.schemas.test import (
    PaginatedTests,
    PublishResponse,
    TestAssignmentCreate,
    TestAssignmentSchema,
    TestCreate,
    TestListSchema,
    TestSchema,
    TestUpdate,
)

router = APIRouter(prefix="/api/tests", tags=["tests"])

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_question_count_sq = (
    select(func.count(Question.id))
    .where(Question.test_id == Test.id)
    .correlate(Test)
    .scalar_subquery()
)

_assignment_count_sq = (
    select(func.count(TestAssignment.id))
    .where(TestAssignment.test_id == Test.id)
    .correlate(Test)
    .scalar_subquery()
)


def _build_test_list_item(test: Test, q_count: int, discipline_name: str | None = None) -> TestListSchema:
    return TestListSchema(
        id=test.id,
        title=test.title,
        description=test.description,
        discipline_id=test.discipline_id,
        discipline_name=discipline_name,
        lesson_code=test.lesson_code,
        is_published=test.is_published,
        time_limit_minutes=test.time_limit_minutes,
        max_attempts=test.max_attempts,
        question_count=q_count,
        created_at=test.created_at,
    )


def _build_test_detail(test: Test, q_count: int, a_count: int, discipline_name: str | None = None) -> TestSchema:
    return TestSchema(
        id=test.id,
        title=test.title,
        description=test.description,
        discipline_id=test.discipline_id,
        discipline_name=discipline_name,
        lesson_code=test.lesson_code,
        is_published=test.is_published,
        is_deleted=test.is_deleted,
        time_limit_minutes=test.time_limit_minutes,
        max_attempts=test.max_attempts,
        question_count=q_count,
        assignment_count=a_count,
        created_by=test.created_by,
        created_at=test.created_at,
    )


async def _get_own_test_or_404(test_id: uuid.UUID, instructor: User, db: AsyncSession) -> Test:
    result = await db.execute(
        select(Test).where(Test.id == test_id, Test.is_deleted.is_(False))
    )
    test = result.scalar_one_or_none()
    if not test:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test not found")
    # admin can manage any test; instructor only their own
    if instructor.role == "instructor" and test.created_by != instructor.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your test")
    return test


# ---------------------------------------------------------------------------
# GET /api/tests
# ---------------------------------------------------------------------------

@router.get("", response_model=PaginatedTests)
async def list_tests(
    db: Annotated[AsyncSession, Depends(get_async_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=500),
) -> PaginatedTests:
    if current_user.role in ("instructor", "admin"):
        if current_user.role == "admin":
            filters = [Test.is_deleted.is_(False)]
        else:
            filters = [Test.created_by == current_user.id, Test.is_deleted.is_(False)]

        total = (await db.execute(select(func.count(Test.id)).where(*filters))).scalar_one()

        rows = (
            await db.execute(
                select(Test, _question_count_sq.label("q_count"), Discipline.name.label("disc_name"))
                .outerjoin(Discipline, Discipline.id == Test.discipline_id)
                .where(*filters)
                .order_by(Test.created_at.desc())
                .offset((page - 1) * per_page)
                .limit(per_page)
            )
        ).all()

        items = [_build_test_list_item(t, qc, dn) for t, qc, dn in rows]

    else:
        # Student: see published tests in their disciplines (via group)
        if not current_user.group_id:
            return PaginatedTests(items=[], total=0, page=page, per_page=per_page)

        disc_ids_sq = (
            select(group_disciplines.c.discipline_id)
            .where(group_disciplines.c.group_id == current_user.group_id)
        )

        base_filter = [
            Test.is_published.is_(True),
            Test.is_deleted.is_(False),
            Test.discipline_id.in_(disc_ids_sq),
        ]

        total = (await db.execute(select(func.count(Test.id)).where(*base_filter))).scalar_one()

        rows = (
            await db.execute(
                select(Test, _question_count_sq.label("q_count"), Discipline.name.label("disc_name"))
                .outerjoin(Discipline, Discipline.id == Test.discipline_id)
                .where(*base_filter)
                .order_by(Test.created_at.desc())
                .offset((page - 1) * per_page)
                .limit(per_page)
            )
        ).all()

        items = [_build_test_list_item(t, qc, dn) for t, qc, dn in rows]

    return PaginatedTests(items=items, total=total, page=page, per_page=per_page)


# ---------------------------------------------------------------------------
# POST /api/tests
# ---------------------------------------------------------------------------

@router.post("", response_model=TestSchema, status_code=status.HTTP_201_CREATED)
async def create_test(
    body: TestCreate,
    db: Annotated[AsyncSession, Depends(get_async_db)],
    instructor: Annotated[User, Depends(require_instructor)],
) -> TestSchema:
    # instructor auto-gets their first discipline; admin must provide explicitly
    discipline_id = body.discipline_id
    if instructor.role == "instructor":
        instr_with_discs = (await db.execute(
            select(User).where(User.id == instructor.id).options(selectinload(User.disciplines))
        )).scalar_one()
        if instr_with_discs.disciplines:
            discipline_id = instr_with_discs.disciplines[0].id

    test = Test(
        id=uuid.uuid4(),
        title=body.title,
        description=body.description,
        discipline_id=discipline_id,
        lesson_code=body.lesson_code,
        created_by=instructor.id,
        time_limit_minutes=body.time_limit_minutes,
        max_attempts=body.max_attempts,
    )
    db.add(test)
    await db.commit()
    await db.refresh(test)
    return _build_test_detail(test, 0, 0)


# ---------------------------------------------------------------------------
# GET /api/tests/{id}
# ---------------------------------------------------------------------------

@router.get("/{test_id}", response_model=TestSchema)
async def get_test(
    test_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_async_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> TestSchema:
    row = (
        await db.execute(
            select(Test, _question_count_sq.label("q_count"), _assignment_count_sq.label("a_count"), Discipline.name.label("disc_name"))
            .outerjoin(Discipline, Discipline.id == Test.discipline_id)
            .where(Test.id == test_id, Test.is_deleted.is_(False))
        )
    ).one_or_none()

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test not found")

    test, q_count, a_count, disc_name = row

    if current_user.role == "instructor" and test.created_by != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your test")

    if current_user.role == "student":
        if not test.is_published:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test not found")

    return _build_test_detail(test, q_count, a_count, disc_name)


# ---------------------------------------------------------------------------
# PUT /api/tests/{id}
# ---------------------------------------------------------------------------

@router.put("/{test_id}", response_model=TestSchema)
async def update_test(
    test_id: uuid.UUID,
    body: TestUpdate,
    db: Annotated[AsyncSession, Depends(get_async_db)],
    instructor: Annotated[User, Depends(require_instructor)],
) -> TestSchema:
    test = await _get_own_test_or_404(test_id, instructor, db)

    if body.title is not None:
        test.title = body.title
    if body.description is not None:
        test.description = body.description
    if "discipline_id" in body.model_fields_set:
        test.discipline_id = body.discipline_id
    if "lesson_code" in body.model_fields_set:
        test.lesson_code = body.lesson_code
    if "time_limit_minutes" in body.model_fields_set:
        test.time_limit_minutes = body.time_limit_minutes
    if body.max_attempts is not None:
        test.max_attempts = body.max_attempts

    await db.commit()
    await db.refresh(test)

    row = (
        await db.execute(
            select(_question_count_sq.label("q"), _assignment_count_sq.label("a"), Discipline.name.label("dn"))
            .outerjoin(Discipline, Discipline.id == test.discipline_id)
            .where(Test.id == test_id)
        )
    ).one()
    return _build_test_detail(test, row.q, row.a, row.dn)


# ---------------------------------------------------------------------------
# DELETE /api/tests/{id}
# ---------------------------------------------------------------------------

@router.delete("/{test_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_test(
    test_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_async_db)],
    instructor: Annotated[User, Depends(require_instructor)],
) -> None:
    test = await _get_own_test_or_404(test_id, instructor, db)

    in_progress = (
        await db.execute(
            select(func.count(Attempt.id)).where(
                Attempt.test_id == test_id, Attempt.status == "in_progress"
            )
        )
    ).scalar_one()
    if in_progress > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete test with active attempts",
        )

    test.is_deleted = True
    await db.commit()


# ---------------------------------------------------------------------------
# POST /api/tests/{id}/publish
# ---------------------------------------------------------------------------

@router.post("/{test_id}/publish", response_model=PublishResponse)
async def toggle_publish(
    test_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_async_db)],
    instructor: Annotated[User, Depends(require_instructor)],
) -> PublishResponse:
    test = await _get_own_test_or_404(test_id, instructor, db)

    if not test.is_published:
        q_count = (
            await db.execute(
                select(func.count(Question.id)).where(Question.test_id == test_id)
            )
        ).scalar_one()
        if q_count == 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Cannot publish a test with no questions",
            )

    test.is_published = not test.is_published
    await db.commit()
    return PublishResponse(is_published=test.is_published)


# ---------------------------------------------------------------------------
# POST /api/tests/{id}/assign  (kept for backward compat)
# ---------------------------------------------------------------------------

@router.post("/{test_id}/assign", response_model=TestAssignmentSchema, status_code=status.HTTP_201_CREATED)
async def assign_test(
    test_id: uuid.UUID,
    body: TestAssignmentCreate,
    db: Annotated[AsyncSession, Depends(get_async_db)],
    instructor: Annotated[User, Depends(require_instructor)],
) -> TestAssignment:
    from app.models.group import Group

    test = await _get_own_test_or_404(test_id, instructor, db)

    if body.group_id:
        if not (await db.execute(select(Group).where(Group.id == body.group_id))).scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")

    if body.student_id:
        student = (
            await db.execute(
                select(User).where(User.id == body.student_id, User.is_active.is_(True))
            )
        ).scalar_one_or_none()
        if not student:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")
        if student.role != "student":
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Target user is not a student",
            )

    assignment = TestAssignment(
        id=uuid.uuid4(),
        test_id=test.id,
        group_id=body.group_id,
        student_id=body.student_id,
        available_from=body.available_from,
        available_until=body.available_until,
    )
    db.add(assignment)
    await db.commit()
    await db.refresh(assignment)
    return assignment
