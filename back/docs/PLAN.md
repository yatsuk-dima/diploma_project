# План розробки: Adaptive Knowledge Testing System

## Загальна структура

| Фаза | Назва | Тривалість |
|------|-------|------------|
| 1 | Інфраструктура та фундамент | 3 дні |
| 2 | Аутентифікація та управління користувачами | 3 дні |
| 3 | Тести та питання (CRUD) | 4 дні |
| 4 | Логіка тестування (спроби, відповіді) | 5 днів |
| 5 | Адаптивний алгоритм та оцінювання | 4 дні |
| 6 | Аналітика та перевірка відповідей | 3 дні |
| 7 | Frontend: інструктор | 6 днів |
| 8 | Frontend: студент | 4 дні |
| 9 | Інтеграція, безпека, деплой | 4 дні |

**Загальна орієнтовна тривалість: ~36 робочих днів**

---

## Фаза 1 — Інфраструктура та фундамент

**Мета:** все запускається локально, є база та скелет FastAPI.

### Завдання

#### 1.1 Docker Compose
- [ ] `docker-compose.yml`: postgres, redis, backend, celery, celery-beat, nginx, frontend
- [ ] `nginx/nginx.conf`: reverse proxy → backend:8000, frontend:3000; TLS-termination (self-signed для dev)
- [ ] `.env.example` з усіма змінними зі SPEC.md
- [ ] Перевірити `docker-compose up --build` — всі сервіси стартують

#### 1.2 Backend: скелет проекту
- [ ] `requirements.txt`: fastapi, uvicorn[standard], sqlalchemy[asyncio], asyncpg, psycopg2-binary, alembic, PyJWT, passlib[bcrypt], celery[redis], catsim, pydantic-settings
- [ ] `app/config.py`: `Settings` через `pydantic-settings`, читає `.env`
- [ ] `app/database.py`: async engine (`asyncpg`) + sync engine (`psycopg2`) для Celery
- [ ] `app/main.py`: FastAPI app, CORS, підключення роутерів, `/health` endpoint
- [ ] `backend/Dockerfile`: multi-stage build

#### 1.3 Alembic
- [ ] `alembic init alembic` та налаштування `env.py` (async)
- [ ] Початкова міграція: всі таблиці зі SPEC.md (user, refresh_token, group, test, test_assignment, question, attempt, attempt_question, answer)
- [ ] `CHECK CONSTRAINT` на `test_assignment`
- [ ] Перевірити `alembic upgrade head`

#### 1.4 CLI
- [ ] `app/cli.py`: команда `create-instructor --login --password --name`

**Критерій завершення:** `docker-compose up` → `GET /health` → 200, міграції проходять.

---

## Фаза 2 — Аутентифікація та управління користувачами

**Мета:** login/logout, JWT з refresh tokens, CRUD користувачів і груп.

### Завдання

#### 2.1 Моделі SQLAlchemy
- [ ] `models/user.py`: User
- [ ] `models/refresh_token.py`: RefreshToken
- [ ] `models/group.py`: Group

#### 2.2 Auth service (`services/auth_service.py`)
- [ ] `hash_password(plain)` / `verify_password(plain, hashed)` через passlib bcrypt
- [ ] `create_access_token(user_id, role)` → PyJWT, TTL з config
- [ ] `create_refresh_token(user_id)` → random UUID, зберігати SHA-256 хеш у БД
- [ ] `verify_access_token(token)` → payload або 401
- [ ] `rotate_refresh_token(old_token)` → анулювати старий, видати новий
- [ ] `revoke_all_tokens(user_id)` → при зміні пароля

#### 2.3 Auth router (`routers/auth.py`)
- [ ] `POST /api/auth/login` — rate limit 10 req/min через slowapi
- [ ] `POST /api/auth/refresh`
- [ ] `POST /api/auth/logout`
- [ ] `GET /api/auth/me`

#### 2.4 Dependencies (`dependencies.py`)
- [ ] `get_current_user` → витягує user із JWT
- [ ] `require_instructor` → 403 якщо role != instructor
- [ ] `require_student` → 403 якщо role != student

#### 2.5 Users router (`routers/users.py`)
- [ ] `GET /api/users` (пагінація, фільтр role/group_id)
- [ ] `POST /api/users`
- [ ] `PUT /api/users/{id}`
- [ ] `DELETE /api/users/{id}` (soft delete: is_active=false, revoke tokens)
- [ ] `POST /api/users/bulk` (CSV: full_name, login, password, role, group_id)

#### 2.6 Groups router (`routers/groups.py`)
- [ ] `GET /api/groups`
- [ ] `POST /api/groups`
- [ ] `PUT /api/groups/{id}`
- [ ] `GET /api/groups/{id}/students`

#### 2.7 Celery Beat: прибирання токенів
- [ ] `tasks/cleanup_tasks.py`: `DELETE FROM refresh_token WHERE expires_at < now()` — щодня о 03:00

**Критерій завершення:** login → access+refresh token → refresh → новий токен → logout → старий refresh відхилено.

---

## Фаза 3 — Тести та питання (CRUD)

**Мета:** інструктор може створювати тести, питання, публікувати та призначати.

### Завдання

#### 3.1 Моделі
- [ ] `models/test.py`: Test, TestAssignment
- [ ] `models/question.py`: Question

#### 3.2 Schemas (Pydantic)
- [ ] `schemas/test.py`: TestCreate, TestUpdate, TestSchema, TestListSchema, TestAssignmentCreate
- [ ] `schemas/question.py`: QuestionCreate, QuestionUpdate, QuestionSchema, QuestionForStudent (без correct_answer)

#### 3.3 Tests router (`routers/tests.py`)
- [ ] `GET /api/tests` (інструктор: власні; студент: призначені активні; пагінація)
- [ ] `POST /api/tests`
- [ ] `GET /api/tests/{id}`
- [ ] `PUT /api/tests/{id}` (тільки власник)
- [ ] `DELETE /api/tests/{id}` (soft delete; заборонено якщо є in_progress спроби)
- [ ] `POST /api/tests/{id}/publish` (перемикач; заборонено без питань)
- [ ] `POST /api/tests/{id}/assign`

#### 3.4 Questions router (`routers/questions.py`)
- [ ] `GET /api/tests/{id}/questions`
- [ ] `POST /api/tests/{id}/questions`
- [ ] `PUT /api/questions/{id}` (заборонено якщо є завершені спроби і тест опублікований)
- [ ] `DELETE /api/questions/{id}` (те саме обмеження)
- [ ] `PATCH /api/questions/{id}/difficulty`

**Критерій завершення:** повний lifecycle тесту через API (create → add questions → publish → assign).

---

## Фаза 4 — Логіка тестування (спроби та відповіді)

**Мета:** студент може проходити тест, таймер працює, auto-timeout через Celery Beat.

### Завдання

#### 4.1 Моделі
- [ ] `models/attempt.py`: Attempt
- [ ] `models/attempt_question.py`: AttemptQuestion
- [ ] `models/answer.py`: Answer

#### 4.2 Schemas
- [ ] `schemas/attempt.py`: AttemptCreate, AttemptSchema, AnswerSubmit, AnswerResult, AttemptResult

#### 4.3 Grading service (`services/grading_service.py`)
- [ ] `grade_single_choice(student_answer, correct_answer)` → 0.0 або 1.0
- [ ] `grade_multiple_choice(student_answer, correct_answer)` → [0.0..1.0], penalty_weight=0.5
- [ ] `grade_open_answer(student_answer_text, keywords, min_match)` → score + is_correct (авто)
- [ ] `calculate_attempt_score(attempt_id)` → sum/max * 100, враховує null (pending)

#### 4.4 Adaptive service (`services/adaptive_service.py`)
- [ ] `generate_question_sequence(test_id, attempt_number, theta)` → ordered list of question_ids
  - attempt_number == 1: sort by `order`
  - attempt_number > 1: sort by `|effective_difficulty - theta|`, tie-break by `order`
- [ ] `get_effective_difficulty(question)` → override ?? (auto if count>=30) ?? 0.0
- [ ] `get_next_unanswered(attempt_id)` → наступний AttemptQuestion де is_answered=false

#### 4.5 Attempts router (`routers/attempts.py`)
- [ ] `POST /api/attempts` — старт спроби, запис AttemptQuestion, Redis timer
- [ ] `GET /api/attempts/{id}/next`
- [ ] `POST /api/attempts/{id}/answer` — grade + оновити AttemptQuestion.is_answered
- [ ] `POST /api/attempts/{id}/finish`
- [ ] `GET /api/attempts/{id}/result`
- [ ] `GET /api/attempts/my`

#### 4.6 Redis timer
- [ ] При старті: `SET timer:{attempt_id} {...} EX (limit+100)`
- [ ] `GET /api/attempts/{id}` повертає `started_at` + `server_time` для frontend-відліку

#### 4.7 Celery Beat: auto-timeout
- [ ] `tasks/timeout_tasks.py`: `check_timed_out_attempts` кожні 60 сек
- [ ] Логіка: знайти in_progress спроби де `started_at + limit < now()` → status=timeout, calculate_score

**Критерій завершення:** повний сценарій тестування (start → answer all → finish → result) + timeout спрацьовує.

---

## Фаза 5 — Адаптивний алгоритм та IRT

**Мета:** theta оновлюється після спроби, наступна спроба адаптується, auto-calibration β.

### Завдання

#### 5.1 IRT tasks (`tasks/irt_tasks.py`)

- [ ] `recalculate_theta(attempt_id)`:
  ```
  1. Завантажити всі Answer для attempt (тільки is_correct != null)
  2. Зібрати пари (effective_difficulty, is_correct)
  3. catsim.estimation.estimate() → новий theta
  4. Зберегти Attempt.theta
  ```

- [ ] `recalibrate_question_difficulty(question_id)`:
  ```
  1. Агрегувати всі відповіді на це питання по всіх студентах
  2. Якщо count >= 30: catsim.estimation на агрегованих даних → новий irt_difficulty_auto
  3. Оновити irt_response_count
  ```

- [ ] `finalize_attempt_after_review(attempt_id)`:
  ```
  1. Викликається коли pending_review_count → 0
  2. recalculate_attempt_score()
  3. recalculate_theta()
  4. recalibrate_difficulty для кожного питання
  ```

#### 5.2 Orchestration
- [ ] `POST /api/attempts/{id}/finish` → enqueue `recalculate_theta` якщо `pending_review_count == 0`
- [ ] `POST /api/review/answers/{id}` → якщо `pending_review_count → 0` → enqueue `finalize_attempt_after_review`

#### 5.3 Тестування алгоритму
- [ ] Unit tests для `generate_question_sequence` (перша vs наступні спроби)
- [ ] Unit tests для `get_effective_difficulty` (всі три гілки)
- [ ] Integration test: 2 спроби → theta оновлюється → порядок питань змінюється

**Критерій завершення:** після першої спроби theta ≠ 0.0, друга спроба має інший порядок питань.

---

## Фаза 6 — Аналітика та перевірка відкритих відповідей

**Мета:** інструктор бачить статистику, може оцінювати відкриті відповіді.

### Завдання

#### 6.1 Open Answer Review router
- [ ] `GET /api/review/pending` (фільтр test_id, пагінація)
- [ ] `POST /api/review/answers/{id}` (is_correct + score, trigger finalize якщо потрібно)

#### 6.2 Analytics service (`services/analytics_service.py`)
- [ ] `get_student_analytics(student_id, filters)`
- [ ] `get_group_analytics(group_id, filters)`
- [ ] `get_test_analytics(test_id, filters)`
- [ ] `get_question_stats(test_id)`

#### 6.3 Analytics router (`routers/analytics.py`)
- [ ] `GET /api/analytics/students/{id}`
- [ ] `GET /api/analytics/groups/{id}`
- [ ] `GET /api/analytics/tests/{id}`
- [ ] `GET /api/analytics/tests/{id}/questions`

**Критерій завершення:** всі analytics endpoints повертають дані з правильними фільтрами.

---

## Фаза 7 — Frontend: інструктор

**Мета:** інструктор може виконати повний workflow через UI.

### Завдання

#### 7.1 Базова інфраструктура frontend
- [ ] Vite + React 18 + Tailwind CSS налаштування
- [ ] `api/client.js`: axios instance, interceptors для JWT (auto-refresh при 401)
- [ ] `store/authStore.js`: Zustand або Context (user, tokens, login/logout)
- [ ] `ProtectedRoute.jsx`: redirect на /login якщо не авторизований
- [ ] Базовий layout: sidebar, header

#### 7.2 LoginPage.jsx
- [ ] Форма login/password
- [ ] Збереження access + refresh token (httpOnly cookie або localStorage — обрати одне)
- [ ] Redirect після логіну: instructor → /instructor/dashboard, student → /student/dashboard

#### 7.3 Instructor: DashboardPage.jsx
- [ ] Загальна статистика: кількість тестів, студентів, pending reviews

#### 7.4 Instructor: TestsPage.jsx + TestEditorPage.jsx
- [ ] Список тестів з статусом (draft/published), кнопки create/edit/delete
- [ ] Форма тесту: title, description, time_limit, max_attempts
- [ ] Publish/unpublish toggle

#### 7.5 Instructor: QuestionEditorPage.jsx
- [ ] Список питань тесту з drag-and-drop для зміни order
- [ ] Форма питання: тип (radio), текст, варіанти відповідей (додати/видалити), позначення правильних
- [ ] Для open_answer: поле keywords (тег-інпут), min_match
- [ ] Відображення `effective_difficulty` та `irt_difficulty_auto` (якщо count>=30)
- [ ] Override difficulty: inline edit

#### 7.6 Instructor: AssignPage.jsx
- [ ] Вибір тесту, вибір групи або конкретного студента
- [ ] Датапікери available_from / available_until

#### 7.7 Instructor: AnalyticsPage.jsx
- [ ] Tabs: По студенту / По групі / По тесту
- [ ] Таблиці з фільтрами (дата, група, score range)
- [ ] Theta progression chart (recharts або chart.js)
- [ ] Per-question difficulty stats таблиця

#### 7.8 Instructor: OpenAnswerReviewPage.jsx
- [ ] Список pending відповідей з пагінацією
- [ ] Для кожної: питання, ключові слова, відповідь студента, кнопки "Правильно/Неправильно" + score input
- [ ] Лічильник pending у sidebar

**Критерій завершення:** інструктор може через UI: створити тест → додати питання → опублікувати → призначити групі → переглянути аналітику.

---

## Фаза 8 — Frontend: студент

**Мета:** студент може проходити тест з таймером.

### Завдання

#### 8.1 Student: DashboardPage.jsx
- [ ] Список призначених активних тестів
- [ ] Для кожного: назва, deadline, кількість спроб (використано / максимум), кнопка "Почати"

#### 8.2 Student: TestingPage.jsx
- [ ] `Timer.jsx`: зворотній відлік, обчислюється з `started_at + limit - server_time`
- [ ] `ProgressBar.jsx`: N з M питань
- [ ] Відображення поточного питання:
  - `SingleChoiceQuestion.jsx`: radio buttons
  - `MultipleChoiceQuestion.jsx`: checkboxes
  - `OpenAnswerQuestion.jsx`: textarea
- [ ] Кнопка "Відповісти" → `POST /api/attempts/{id}/answer`
- [ ] Після відповіді → показати правильну відповідь (1-2 сек) → `GET /attempts/{id}/next`
- [ ] Auto-submit при таймері = 0: `POST /api/attempts/{id}/finish`
- [ ] Відновлення стану при рефреші (запит поточної спроби + next question)

#### 8.3 Student: ResultsPage.jsx
- [ ] Підсумок: бал, витрачений час, статус (completed/timeout)
- [ ] Якщо є pending review: повідомлення "N відповідей на перевірці, бал буде оновлено"
- [ ] Список питань: правильно/неправильно, бал за кожне
- [ ] Кнопка "Спробувати ще" (якщо attempt_number < max_attempts)

**Критерій завершення:** студент може пройти повний тест, побачити результат, спробувати ще раз з іншим порядком питань.

---

## Фаза 9 — Інтеграція, безпека, деплой

**Мета:** готово до запуску на сервері інституту.

### Завдання

#### 9.1 Безпека
- [ ] Rate limiting: `slowapi` на `/api/auth/login` (10 req/min per IP)
- [ ] Перевірка що студент не може отримати `correct_answer` через API (QuestionForStudentSchema)
- [ ] Перевірка що студент може відповідати тільки на власні спроби (row-level ownership check)
- [ ] HTTP Security headers в nginx: `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`
- [ ] `SECRET_KEY` та `REFRESH_SECRET_KEY` — різні значення в `.env`

#### 9.2 Обробка помилок
- [ ] Глобальний exception handler у FastAPI: повертає `{"detail": "...", "code": "..."}` для всіх 4xx/5xx
- [ ] Коди помилок для frontend: `ATTEMPT_LIMIT_REACHED`, `TEST_NOT_AVAILABLE`, `QUESTION_ALREADY_ANSWERED` тощо
- [ ] Frontend: axios interceptor → toast-нотифікації для помилок

#### 9.3 Тестування
- [ ] Backend: pytest + pytest-asyncio
  - Unit: grading_service (всі три типи питань)
  - Unit: adaptive_service (generate_question_sequence)
  - Integration: повний flow спроби (start → answer → finish → theta update)
- [ ] Frontend: Playwright або Cypress E2E
  - Smoke test: login, start test, answer all, see result

#### 9.4 Продуктивність
- [ ] Індекси БД: `attempt(student_id, test_id)`, `answer(attempt_id)`, `attempt_question(attempt_id, is_answered)`, `refresh_token(token_hash)`, `refresh_token(expires_at)` (для cleanup)
- [ ] Connection pooling: `pool_size=10, max_overflow=20` для async engine

#### 9.5 Деплой
- [ ] `nginx.conf`: TLS (сертифікат інституту або self-signed), gzip, proxy headers
- [ ] `docker-compose.yml`: `restart: unless-stopped` для всіх сервісів
- [ ] Документ `DEPLOY.md`: кроки деплою, оновлення, backup БД
- [ ] Перевірка деплою на чистій машині за `DEPLOY.md`

**Критерій завершення:** система розгорнута за DEPLOY.md, прохід E2E smoke test, rate limiting спрацьовує.

---

## Послідовність залежностей

```
Фаза 1 (інфраструктура)
    └── Фаза 2 (auth + users)
            └── Фаза 3 (tests + questions)
                    └── Фаза 4 (attempts + answers)
                            ├── Фаза 5 (IRT algorithm)
                            └── Фаза 6 (analytics + review)
                                    └── Фаза 7 (frontend instructor)
                                                └── Фаза 8 (frontend student)
                                                            └── Фаза 9 (integration + deploy)
```

Фази 5 і 6 можна вести паралельно після завершення Фази 4.
Фази 7 і 8 можна починати паралельно з Фазою 6 (моки API на frontend).

---

## Ключові технічні рішення

| Рішення | Обґрунтування |
|---|---|
| Послідовність питань у `AttemptQuestion` | `GET /next` детермінований, стійкий до рестарту Redis |
| Sync DB URL для Celery | Celery tasks синхронні; asyncpg не сумісний без asyncio.run() |
| SHA-256 хеш refresh token у БД | Витік БД не компрометує активні токени |
| IRT calibration threshold = 30 | MLE нестабільна на малій вибірці (стандартна рекомендація) |
| Soft delete для users та tests | Збереження цілісності attempt/answer history |
| PyJWT замість python-jose | Активна підтримка, немає відкритих CVE |
| Celery Beat для таймаутів | Надійніше ніж тільки frontend (мережеві збої, закритий браузер) |
