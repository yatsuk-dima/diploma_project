from app.celery_app import celery_app


@celery_app.task(name="app.tasks.cleanup_tasks.cleanup_expired_tokens")
def cleanup_expired_tokens() -> None:
    from datetime import datetime, timezone

    from sqlalchemy import delete

    from app.database import SyncSessionLocal
    from app.models.refresh_token import RefreshToken

    db = SyncSessionLocal()
    try:
        db.execute(delete(RefreshToken).where(RefreshToken.expires_at < datetime.now(timezone.utc)))
        db.commit()
    finally:
        db.close()
