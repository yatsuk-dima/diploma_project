from app.celery_app import celery_app


@celery_app.task(name="app.tasks.irt_tasks.recalculate_theta")
def recalculate_theta(attempt_id: str) -> None:
    """Update student θ after a completed / timed-out attempt."""
    import uuid

    from sqlalchemy import select

    from app.database import SyncSessionLocal
    from app.models.answer import Answer
    from app.models.attempt import Attempt
    from app.models.question import Question
    from app.services.irt_service import estimate_theta

    db = SyncSessionLocal()
    try:
        attempt = db.execute(
            select(Attempt).where(Attempt.id == uuid.UUID(attempt_id))
        ).scalar_one_or_none()
        if not attempt:
            return

        # Load answered questions alongside their graded answers (skip open_answer pending review)
        rows = db.execute(
            select(Question, Answer.is_correct)
            .join(Answer, Answer.question_id == Question.id)
            .where(Answer.attempt_id == attempt.id, Answer.is_correct.isnot(None))
        ).all()

        if not rows:
            return

        difficulties = [q.effective_difficulty for q, _ in rows]
        responses = [bool(is_correct) for _, is_correct in rows]

        attempt.theta = estimate_theta(difficulties, responses, initial_theta=attempt.theta or 0.0)
        db.commit()

        # Trigger difficulty recalibration for each question
        answered_q_ids = list({str(q.id) for q, _ in rows})
        for qid in answered_q_ids:
            recalibrate_question_difficulty.delay(qid)

    finally:
        db.close()


@celery_app.task(name="app.tasks.irt_tasks.recalibrate_question_difficulty")
def recalibrate_question_difficulty(question_id: str) -> None:
    """Recompute irt_difficulty_auto for a question from all non-null answers."""
    import uuid

    from sqlalchemy import case, func, select

    from app.database import SyncSessionLocal
    from app.models.answer import Answer
    from app.models.question import Question
    from app.services.irt_service import estimate_item_difficulty

    db = SyncSessionLocal()
    try:
        q_uuid = uuid.UUID(question_id)
        question = db.execute(
            select(Question).where(Question.id == q_uuid)
        ).scalar_one_or_none()
        if not question:
            return

        row = db.execute(
            select(
                func.count(Answer.id).label("total"),
                func.sum(case((Answer.is_correct == True, 1), else_=0)).label("correct"),
            ).where(Answer.question_id == q_uuid, Answer.is_correct.isnot(None))
        ).one()

        total = row.total or 0
        correct = int(row.correct or 0)

        question.irt_response_count = total
        new_difficulty = estimate_item_difficulty(correct, total)
        if new_difficulty is not None:
            question.irt_difficulty_auto = new_difficulty

        db.commit()
    finally:
        db.close()


@celery_app.task(name="app.tasks.irt_tasks.finalize_attempt_after_review")
def finalize_attempt_after_review(attempt_id: str) -> None:
    """Called when an instructor finishes reviewing all open answers for an attempt."""
    import uuid

    from sqlalchemy import select

    from app.database import SyncSessionLocal
    from app.models.attempt import Attempt
    from app.services.grading_service import calculate_attempt_score_sync

    db = SyncSessionLocal()
    try:
        attempt = db.execute(
            select(Attempt).where(Attempt.id == uuid.UUID(attempt_id))
        ).scalar_one_or_none()
        if not attempt or attempt.pending_review_count != 0:
            return

        score, max_score = calculate_attempt_score_sync(attempt.id, db)
        attempt.score = score
        attempt.max_score = max_score
        db.commit()

        recalculate_theta.delay(attempt_id)
    finally:
        db.close()
