import uuid
from datetime import datetime, timezone

from sqlalchemy import case, cast, distinct, func, select, Date
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.answer import Answer
from app.models.attempt import Attempt
from app.models.discipline import Discipline, instructor_disciplines
from app.models.group import Group
from app.models.question import Question
from app.models.test import Test
from app.models.user import User
from app.schemas.analytics import (
    AttemptStat,
    DayCount,
    GroupAnalytics,
    OverviewStats,
    QuestionStat,
    StudentAnalytics,
    StudentSummary,
    TestAnalytics,
    TestQuestionStats,
    TopTest,
)

PASS_THRESHOLD = 0.6


# ---------------------------------------------------------------------------
# Student analytics
# ---------------------------------------------------------------------------


async def get_student_analytics(
    student_id: uuid.UUID,
    db: AsyncSession,
    *,
    test_id: uuid.UUID | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> StudentAnalytics | None:
    # Check student exists
    user = (
        await db.execute(select(User).where(User.id == student_id, User.role == "student"))
    ).scalar_one_or_none()
    if not user:
        return None

    filters = [Attempt.student_id == student_id]
    if test_id:
        filters.append(Attempt.test_id == test_id)
    if date_from:
        filters.append(Attempt.started_at >= date_from)
    if date_to:
        filters.append(Attempt.started_at <= date_to)

    # Aggregation
    agg = (
        await db.execute(
            select(
                func.count(Attempt.id).label("total"),
                func.count(
                    case((Attempt.status.in_(["completed", "timeout"]), 1))
                ).label("completed"),
                func.avg(Attempt.score).label("avg_score"),
                func.max(Attempt.score).label("best_score"),
            ).where(*filters)
        )
    ).one()

    # Attempt list
    rows = (
        await db.execute(
            select(Attempt, Test.title)
            .join(Test, Test.id == Attempt.test_id)
            .where(*filters)
            .order_by(Attempt.started_at.desc())
        )
    ).all()

    attempts = [
        AttemptStat(
            attempt_id=a.id,
            test_id=a.test_id,
            test_title=title,
            attempt_number=a.attempt_number,
            score=a.score,
            theta=a.theta,
            status=a.status,
            time_spent_seconds=a.time_spent_seconds,
            started_at=a.started_at,
        )
        for a, title in rows
    ]

    return StudentAnalytics(
        student_id=user.id,
        full_name=user.full_name,
        total_attempts=agg.total,
        completed_attempts=agg.completed,
        avg_score=round(float(agg.avg_score), 2) if agg.avg_score is not None else None,
        best_score=round(float(agg.best_score), 2) if agg.best_score is not None else None,
        attempts=attempts,
    )


# ---------------------------------------------------------------------------
# Group analytics
# ---------------------------------------------------------------------------


async def get_group_analytics(
    group_id: uuid.UUID,
    db: AsyncSession,
    *,
    test_id: uuid.UUID | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> GroupAnalytics | None:
    group = (
        await db.execute(select(Group).where(Group.id == group_id))
    ).scalar_one_or_none()
    if not group:
        return None

    attempt_filters = [Attempt.student_id == User.id]
    if test_id:
        attempt_filters.append(Attempt.test_id == test_id)
    if date_from:
        attempt_filters.append(Attempt.started_at >= date_from)
    if date_to:
        attempt_filters.append(Attempt.started_at <= date_to)

    # Last theta subquery per student
    last_theta_sq = (
        select(Attempt.theta)
        .where(Attempt.student_id == User.id)
        .order_by(Attempt.started_at.desc())
        .limit(1)
        .correlate(User)
        .scalar_subquery()
    )

    rows = (
        await db.execute(
            select(
                User.id,
                User.full_name,
                func.count(Attempt.id).label("total_attempts"),
                func.avg(Attempt.score).label("avg_score"),
                last_theta_sq.label("last_theta"),
            )
            .outerjoin(Attempt, *attempt_filters)
            .where(User.group_id == group_id, User.is_active.is_(True), User.role == "student")
            .group_by(User.id, User.full_name)
            .order_by(User.full_name)
        )
    ).all()

    students = [
        StudentSummary(
            student_id=r.id,
            full_name=r.full_name,
            total_attempts=r.total_attempts or 0,
            avg_score=round(float(r.avg_score), 2) if r.avg_score is not None else None,
            last_theta=round(float(r.last_theta), 4) if r.last_theta is not None else 0.0,
        )
        for r in rows
    ]

    group_avg: float | None = None
    scored = [s.avg_score for s in students if s.avg_score is not None]
    if scored:
        group_avg = round(sum(scored) / len(scored), 2)

    return GroupAnalytics(
        group_id=group.id,
        group_name=group.name,
        student_count=len(students),
        group_avg_score=group_avg,
        students=students,
    )


# ---------------------------------------------------------------------------
# Test analytics
# ---------------------------------------------------------------------------


async def get_test_analytics(
    test_id: uuid.UUID,
    db: AsyncSession,
    *,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> TestAnalytics | None:
    test = (
        await db.execute(
            select(Test).where(Test.id == test_id, Test.is_deleted.is_(False))
        )
    ).scalar_one_or_none()
    if not test:
        return None

    filters = [Attempt.test_id == test_id]
    if date_from:
        filters.append(Attempt.started_at >= date_from)
    if date_to:
        filters.append(Attempt.started_at <= date_to)

    row = (
        await db.execute(
            select(
                func.count(Attempt.id).label("total"),
                func.count(distinct(Attempt.student_id)).label("unique_students"),
                func.avg(Attempt.score).label("avg_score"),
                func.count(case((Attempt.status == "completed", 1))).label("completed_count"),
                func.count(case((Attempt.status == "timeout", 1))).label("timeout_count"),
                func.count(
                    case((Attempt.score >= PASS_THRESHOLD, 1))
                ).label("pass_count"),
                func.count(case((Attempt.score.isnot(None), 1))).label("scored_count"),
            ).where(*filters)
        )
    ).one()

    pass_rate: float | None = None
    if row.scored_count:
        pass_rate = round(row.pass_count / row.scored_count * 100, 2)

    return TestAnalytics(
        test_id=test.id,
        title=test.title,
        total_attempts=row.total,
        unique_students=row.unique_students,
        avg_score=round(float(row.avg_score), 2) if row.avg_score is not None else None,
        pass_rate=pass_rate,
        completed_count=row.completed_count,
        timeout_count=row.timeout_count,
    )


# ---------------------------------------------------------------------------
# Per-question stats
# ---------------------------------------------------------------------------


async def get_question_stats(
    test_id: uuid.UUID, db: AsyncSession
) -> TestQuestionStats | None:
    test_exists = (
        await db.execute(
            select(Test.id).where(Test.id == test_id, Test.is_deleted.is_(False))
        )
    ).scalar_one_or_none()
    if not test_exists:
        return None

    rows = (
        await db.execute(
            select(
                Question.id,
                Question.text,
                Question.type,
                Question.irt_difficulty_auto,
                Question.irt_difficulty_override,
                Question.irt_response_count,
                func.count(case((Answer.is_correct.isnot(None), 1))).label("response_count"),
                func.count(case((Answer.is_correct == True, 1))).label("correct_count"),
            )
            .outerjoin(Answer, Answer.question_id == Question.id)
            .where(Question.test_id == test_id)
            .group_by(
                Question.id,
                Question.text,
                Question.type,
                Question.irt_difficulty_auto,
                Question.irt_difficulty_override,
                Question.irt_response_count,
                Question.order,
            )
            .order_by(Question.order)
        )
    ).all()

    items = []
    for r in rows:
        correct_rate: float | None = None
        if r.response_count:
            correct_rate = round(r.correct_count / r.response_count * 100, 2)

        # Compute effective_difficulty inline (mirrors the model property)
        if r.irt_difficulty_override is not None:
            eff_diff = r.irt_difficulty_override
        elif r.irt_difficulty_auto is not None and r.irt_response_count >= 30:
            eff_diff = r.irt_difficulty_auto
        else:
            eff_diff = 0.0

        items.append(
            QuestionStat(
                question_id=r.id,
                question_text=r.text,
                question_type=r.type,
                response_count=r.response_count,
                correct_rate=correct_rate,
                effective_difficulty=eff_diff,
                irt_difficulty_auto=r.irt_difficulty_auto,
                irt_difficulty_override=r.irt_difficulty_override,
            )
        )

    return TestQuestionStats(test_id=test_id, items=items)


# ---------------------------------------------------------------------------
# Overview (dashboard)
# ---------------------------------------------------------------------------


async def get_overview(
    db: AsyncSession,
    *,
    instructor_id: uuid.UUID | None = None,
) -> OverviewStats:
    # Determine test filter scope
    if instructor_id:
        test_ids_sq = (
            select(Test.id)
            .where(Test.created_by == instructor_id, Test.is_deleted.is_(False))
            .scalar_subquery()
        )
        disc_count = (
            await db.execute(
                select(func.count(Discipline.id))
                .join(instructor_disciplines, instructor_disciplines.c.discipline_id == Discipline.id)
                .where(instructor_disciplines.c.user_id == instructor_id)
            )
        ).scalar() or 0
        test_count = (
            await db.execute(
                select(func.count(Test.id))
                .where(Test.created_by == instructor_id, Test.is_deleted.is_(False))
            )
        ).scalar() or 0
        attempt_base = select(Attempt).where(Attempt.test_id.in_(test_ids_sq))
    else:
        disc_count = (
            await db.execute(select(func.count(Discipline.id)))
        ).scalar() or 0
        test_count = (
            await db.execute(
                select(func.count(Test.id)).where(Test.is_deleted.is_(False))
            )
        ).scalar() or 0
        attempt_base = select(Attempt)

    student_count = (
        await db.execute(
            select(func.count(User.id))
            .where(User.role == "student", User.is_active.is_(True))
        )
    ).scalar() or 0

    group_count = (
        await db.execute(select(func.count(Group.id)))
    ).scalar() or 0

    # Attempt aggregates
    if instructor_id:
        agg = (
            await db.execute(
                select(
                    func.count(Attempt.id).label("total"),
                    func.count(case((Attempt.status.in_(["completed", "timeout"]), 1))).label("completed"),
                    func.avg(Attempt.score).label("avg_score"),
                    func.count(case((Attempt.score >= PASS_THRESHOLD, 1))).label("pass_count"),
                    func.count(case((Attempt.score.isnot(None), 1))).label("scored_count"),
                ).where(Attempt.test_id.in_(test_ids_sq))
            )
        ).one()
    else:
        agg = (
            await db.execute(
                select(
                    func.count(Attempt.id).label("total"),
                    func.count(case((Attempt.status.in_(["completed", "timeout"]), 1))).label("completed"),
                    func.avg(Attempt.score).label("avg_score"),
                    func.count(case((Attempt.score >= PASS_THRESHOLD, 1))).label("pass_count"),
                    func.count(case((Attempt.score.isnot(None), 1))).label("scored_count"),
                )
            )
        ).one()

    pass_rate: float | None = None
    if agg.scored_count:
        pass_rate = round(agg.pass_count / agg.scored_count * 100, 1)

    # Attempts by day (last 30 days)
    from datetime import timedelta
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=29)

    if instructor_id:
        day_rows = (
            await db.execute(
                select(
                    cast(Attempt.started_at, Date).label("day"),
                    func.count(Attempt.id).label("cnt"),
                )
                .where(Attempt.test_id.in_(test_ids_sq), Attempt.started_at >= since)
                .group_by(cast(Attempt.started_at, Date))
                .order_by(cast(Attempt.started_at, Date))
            )
        ).all()
    else:
        day_rows = (
            await db.execute(
                select(
                    cast(Attempt.started_at, Date).label("day"),
                    func.count(Attempt.id).label("cnt"),
                )
                .where(Attempt.started_at >= since)
                .group_by(cast(Attempt.started_at, Date))
                .order_by(cast(Attempt.started_at, Date))
            )
        ).all()

    attempts_by_day = [DayCount(date=r.day, count=r.cnt) for r in day_rows]

    # Top 5 tests by avg score (min 1 completed attempt)
    if instructor_id:
        top_rows = (
            await db.execute(
                select(
                    Test.id,
                    Test.title,
                    func.avg(Attempt.score).label("avg_score"),
                    func.count(Attempt.id).label("total_attempts"),
                    func.count(case((Attempt.score >= PASS_THRESHOLD, 1))).label("pass_count"),
                    func.count(case((Attempt.score.isnot(None), 1))).label("scored_count"),
                )
                .join(Attempt, Attempt.test_id == Test.id)
                .where(Test.created_by == instructor_id, Test.is_deleted.is_(False))
                .group_by(Test.id, Test.title)
                .having(func.count(Attempt.id) >= 1)
                .order_by(func.avg(Attempt.score).desc().nullslast())
                .limit(5)
            )
        ).all()
    else:
        top_rows = (
            await db.execute(
                select(
                    Test.id,
                    Test.title,
                    func.avg(Attempt.score).label("avg_score"),
                    func.count(Attempt.id).label("total_attempts"),
                    func.count(case((Attempt.score >= PASS_THRESHOLD, 1))).label("pass_count"),
                    func.count(case((Attempt.score.isnot(None), 1))).label("scored_count"),
                )
                .join(Attempt, Attempt.test_id == Test.id)
                .where(Test.is_deleted.is_(False))
                .group_by(Test.id, Test.title)
                .having(func.count(Attempt.id) >= 1)
                .order_by(func.avg(Attempt.score).desc().nullslast())
                .limit(5)
            )
        ).all()

    top_tests = [
        TopTest(
            test_id=r.id,
            title=r.title,
            avg_score=round(float(r.avg_score), 2) if r.avg_score is not None else None,
            total_attempts=r.total_attempts,
            pass_rate=round(r.pass_count / r.scored_count * 100, 1) if r.scored_count else None,
        )
        for r in top_rows
    ]

    return OverviewStats(
        total_disciplines=disc_count,
        total_tests=test_count,
        active_students=student_count,
        total_groups=group_count,
        total_attempts=agg.total,
        completed_attempts=agg.completed,
        avg_score=round(float(agg.avg_score), 2) if agg.avg_score is not None else None,
        pass_rate=pass_rate,
        attempts_by_day=attempts_by_day,
        top_tests=top_tests,
    )
