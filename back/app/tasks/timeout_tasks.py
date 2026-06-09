from app.celery_app import celery_app


@celery_app.task(name="app.tasks.timeout_tasks.check_timed_out_attempts")
def check_timed_out_attempts() -> None:
    from datetime import datetime, timedelta, timezone

    from sqlalchemy import select

    from app.database import SyncSessionLocal
    from app.models.attempt import Attempt
    from app.models.test import Test
    from app.services.grading_service import calculate_attempt_score_sync
    from app.tasks.irt_tasks import recalculate_theta

    now = datetime.now(timezone.utc)
    db = SyncSessionLocal()
    try:
        rows = db.execute(
            select(Attempt, Test)
            .join(Test, Test.id == Attempt.test_id)
            .where(
                Attempt.status == "in_progress",
                Test.time_limit_minutes.isnot(None),
            )
        ).all()

        timed_out_ids = []
        for attempt, test in rows:
            deadline = attempt.started_at + timedelta(minutes=test.time_limit_minutes)
            if deadline < now:
                attempt.status = "timeout"
                attempt.finished_at = now
                attempt.time_spent_seconds = test.time_limit_minutes * 60
                score, max_score = calculate_attempt_score_sync(attempt.id, db)
                attempt.score = score
                attempt.max_score = max_score
                if attempt.pending_review_count == 0:
                    timed_out_ids.append(str(attempt.id))

        db.commit()

        for attempt_id in timed_out_ids:
            recalculate_theta.delay(attempt_id)

    finally:
        db.close()
