# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common commands

```bash
# Start all services (from back/)
cd back && docker compose up -d --build

# Apply DB migrations (first run or after new alembic revision)
docker compose exec backend alembic upgrade head

# Run tests (unit + integration)
docker compose run --rm backend pytest
# Unit only (no DB/Redis required):
docker compose run --rm backend pytest -m "not integration"

# Create a new migration
docker compose exec backend alembic revision --autogenerate -m "description"

# Frontend dev server (hot reload, proxies /api → localhost backend)
cd front && npm run dev

# Rebuild only one service after code change
docker compose up -d --build backend
```

App runs at **http://localhost** · API docs at **http://localhost/api/docs**

## Architecture overview

```
back/   FastAPI (async) + PostgreSQL + Redis + Celery
front/  React SPA (Vite, Tailwind CSS)
```

Everything is deployed via `back/docker-compose.yml` which spins up: `postgres`, `redis`, `backend` (uvicorn), `celery` (worker), `celery-beat`, and `frontend` (nginx serving the built SPA and proxying `/api` to backend).

### Backend (`back/app/`)

Layered structure — routers call services/helpers directly, no repository pattern.

| Layer | Path | Notes |
|---|---|---|
| Routers | `routers/` | One file per resource. Auth uses `get_current_user` / `require_instructor` / `require_student` from `dependencies.py`. |
| Services | `services/` | Business logic: `adaptive_service` (question sequencing), `grading_service` (scoring), `irt_service` (IRT math), `analytics_service`. |
| Models | `models/` | SQLAlchemy 2.x mapped classes. Async session via `database.get_async_db`; sync session (`SyncSessionLocal`) only in Celery tasks. |
| Schemas | `schemas/` | Pydantic v2 for request/response validation. `QuestionSchema` (instructor) vs `QuestionForStudent` (no correct_answer). |
| Tasks | `tasks/` | Celery tasks. `irt_tasks.recalculate_theta` runs after each attempt; `timeout_tasks.check_timed_out_attempts` runs every 60 s via beat. |

**Auth flow**: JWT access token (short-lived) + refresh token stored in `refresh_tokens` table. Refresh token is rotated on each use. Frontend stores it in `localStorage`.

**Adaptive logic**: On attempt 1, questions are served in `Question.order`. On re-attempts, questions are sorted by `|effective_difficulty − theta|` so the student gets questions matched to their current ability. `theta` is updated by a Celery task after each attempt using the Rasch model via `catsim`.

**Question difficulty**: `effective_difficulty` prefers `irt_difficulty_override` if set; otherwise uses `irt_difficulty_auto` once `irt_response_count >= 30`; defaults to `0.0`.

**Grading**: `single_choice` — 0 or 1. `multiple_choice` — partial credit with wrong-answer penalty (`PENALTY_WEIGHT = 0.5`). `open_answer` — keyword substring match score, `is_correct` stays `null` until instructor review; triggers `pending_review_count`.

**Instructor ↔ Discipline relationship**: Many-to-many via `instructor_disciplines` join table (in `models/discipline.py`). `User.disciplines` and `Discipline.instructors` are the two sides. Always use `selectinload(User.disciplines)` when querying users — Pydantic cannot auto-map the M2M list, so `UserSchema.discipline_ids` is built manually in a helper `_user_schema()` in `routers/users.py`.

**Scores**: Stored as `float` in `[0, 1]`. Pass threshold is `0.6`. The `analytics_service.PASS_THRESHOLD = 0.6`.

### Frontend (`front/src/`)

**Routing** (App.jsx): three protected subtrees — `/admin/*`, `/instructor/*` (both use `Layout`), and `/student/*` (no sidebar layout). Role determined from JWT via `useAuthStore` (Zustand).

| Role | Landing | Key pages |
|---|---|---|
| admin | `/admin/dashboard` | DashboardPage (overview stats + charts), DisciplinesPage, UsersPage, GroupsPage |
| instructor | `/instructor/dashboard` | DashboardPage (AnalyticsPage with overview + drill-down), TestsPage, TestEditorPage, QuestionEditorPage, AssignPage, OpenAnswerReviewPage |
| student | `/student/dashboard` | DashboardPage (test list), TestingPage (active test), ResultsPage |

**Admin vs Instructor dashboard**: `/admin/dashboard` → `pages/admin/DashboardPage.jsx` (standalone overview page). `/instructor/dashboard` → `pages/instructor/AnalyticsPage.jsx` (overview section on "Загальна" tab + drill-down tabs for per-test, per-group, per-student analytics).

**Overview API**: `GET /api/analytics/overview` — accessible to both admin and instructor. Admin gets system-wide stats; instructor gets stats scoped to their own tests/disciplines. Frontend: `api/analytics.js → getOverview()`.

**Discipline `short_name`**: Optional abbreviation field (`String(20)`), displayed as a badge before the full discipline name in the UI.

**Student test flow**: DashboardPage lists assigned tests → `POST /api/attempts` starts attempt and returns `first_question` → TestingPage polls `GET /api/attempts/{id}/next` after each answer → `POST /api/attempts/{id}/finish` on completion or timer expiry → ResultsPage.

**Question difficulty is intentionally hidden from students**: `QuestionForStudent` schema excludes `correct_answer`, `irt_*` fields and `effective_difficulty`. The instructor's QuestionEditorPage is the only place difficulty is displayed and editable.

**Terminology**: Students are referred to as "Здобувач вищої освіти" / "здобувач" throughout the UI (not "студент" or "курсант").

### Key env vars (back/.env)

`DATABASE_URL`, `SYNC_DATABASE_URL`, `REDIS_URL`, `SECRET_KEY`, `REFRESH_SECRET_KEY`, `CORS_ORIGINS`, `IRT_MIN_RESPONSE_COUNT` (default 30 — threshold for auto difficulty to activate).
