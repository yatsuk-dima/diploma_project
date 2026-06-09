from celery import Celery
from celery.schedules import crontab

from app.config import settings

celery_app = Celery(
    "adaptive_testing",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=[
        "app.tasks.irt_tasks",
        "app.tasks.timeout_tasks",
        "app.tasks.cleanup_tasks",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Europe/Kyiv",
    enable_utc=True,
    beat_schedule={
        "check-timed-out-attempts": {
            "task": "app.tasks.timeout_tasks.check_timed_out_attempts",
            "schedule": 60.0,
        },
        "cleanup-expired-tokens": {
            "task": "app.tasks.cleanup_tasks.cleanup_expired_tokens",
            "schedule": crontab(hour=3, minute=0),
        },
    },
)
