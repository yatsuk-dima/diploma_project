# Адаптивна система тестування — Технічна специфікація MVP

## Контекст проекту

Веб-система адаптивного тестування для військового інституту (~100 одночасних користувачів).
Система автоматично коригує складність питань між спробами за допомогою теорії відповіді на
завдання (модель Раша). Розгортається на власному сервері інституту через Docker.

---

## Технічний стек

| Компонент | Технологія |
|---|---|
| Backend | Python 3.11, FastAPI, SQLAlchemy 2.0 (async) |
| IRT-алгоритм | catsim (Rasch model) |
| Frontend | React 18, Vite, Tailwind CSS |
| База даних | PostgreSQL 15 |
| Кеш / Черга | Redis 7, Celery 5 + Celery Beat |
| Аутентифікація | JWT (PyJWT ≥ 2.8), bcrypt (passlib) |
| Контейнеризація | Docker, Docker Compose |
| Протокол | HTTPS обов'язковий (TLS termination на Nginx reverse proxy) |

> **Примітка:** Використовується `PyJWT`, а не `python-jose` — остання бібліотека має
> невиправлені CVE (CVE-2024-33663 та ін.) і більше не підтримується активно.

---

## Структура проекту

```
adaptive-testing/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── models/
│   │   │   ├── user.py
│   │   │   ├── group.py
│   │   │   ├── test.py
│   │   │   ├── question.py
│   │   │   ├── attempt.py
│   │   │   ├── attempt_question.py   # послідовність питань у спробі
│   │   │   ├── answer.py
│   │   │   └── refresh_token.py      # зберігання refresh tokens
│   │   ├── schemas/
│   │   │   ├── user.py
│   │   │   ├── test.py
│   │   │   ├── question.py
│   │   │   └── attempt.py
│   │   ├── routers/
│   │   │   ├── auth.py
│   │   │   ├── users.py
│   │   │   ├── groups.py
│   │   │   ├── tests.py
│   │   │   ├── questions.py
│   │   │   ├── attempts.py
│   │   │   └── analytics.py
│   │   ├── services/
│   │   │   ├── auth_service.py
│   │   │   ├── adaptive_service.py
│   │   │   ├── grading_service.py
│   │   │   └── analytics_service.py
│   │   ├── tasks/
│   │   │   ├── irt_tasks.py
│   │   │   └── timeout_tasks.py      # Celery Beat: перевірка прострочених спроб
│   │   └── dependencies.py
│   ├── alembic/
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx
│   │   ├── api/
│   │   │   └── client.js
│   │   ├── store/
│   │   │   └── authStore.js
│   │   ├── pages/
│   │   │   ├── LoginPage.jsx
│   │   │   ├── instructor/
│   │   │   │   ├── DashboardPage.jsx
│   │   │   │   ├── TestsPage.jsx
│   │   │   │   ├── TestEditorPage.jsx
│   │   │   │   ├── QuestionEditorPage.jsx
│   │   │   │   ├── AssignPage.jsx
│   │   │   │   ├── AnalyticsPage.jsx
│   │   │   │   └── OpenAnswerReviewPage.jsx  # новий: ручна перевірка відкритих відповідей
│   │   │   └── student/
│   │   │       ├── DashboardPage.jsx
│   │   │       ├── TestingPage.jsx
│   │   │       └── ResultsPage.jsx
│   │   └── components/
│   │       ├── questions/
│   │       │   ├── SingleChoiceQuestion.jsx
│   │       │   ├── MultipleChoiceQuestion.jsx
│   │       │   └── OpenAnswerQuestion.jsx
│   │       ├── Timer.jsx
│   │       ├── ProgressBar.jsx
│   │       └── ProtectedRoute.jsx
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── Dockerfile
├── nginx/
│   └── nginx.conf                    # TLS termination, proxy до backend/frontend
├── docker-compose.yml
└── .env.example
```

---

## Моделі даних

### User
```
id:              UUID (PK)
full_name:       String
login:           String (unique)
password_hash:   String
role:            Enum ['instructor', 'student']
group_id:        UUID (FK → Group, nullable — у інструкторів null)
is_active:       Boolean (default: true)
created_at:      DateTime
```

### RefreshToken
```
id:              UUID (PK)
user_id:         UUID (FK → User)
token_hash:      String (SHA-256 хеш токена — сам токен не зберігається)
expires_at:      DateTime
revoked:         Boolean (default: false)
created_at:      DateTime
```
> Refresh token зберігається як хеш. При logout або зміні пароля — `revoked = true`.
> Celery Beat прибирає прострочені записи щодня.

### Group
```
id:          UUID (PK)
name:        String (напр. "Курс 3, Взвод 2")
created_at:  DateTime
```

### Test
```
id:                   UUID (PK)
title:                String
description:          Text (nullable)
created_by:           UUID (FK → User)
time_limit_minutes:   Integer (nullable — null означає без ліміту)
max_attempts:         Integer (default: 3)
is_published:         Boolean (default: false)
is_deleted:           Boolean (default: false)  # soft delete
created_at:           DateTime
```

### TestAssignment
```
id:               UUID (PK)
test_id:          UUID (FK → Test)
group_id:         UUID (FK → Group, nullable)
student_id:       UUID (FK → User, nullable)
available_from:   DateTime
available_until:  DateTime (nullable)

CONSTRAINT chk_assignment_target:
  CHECK (group_id IS NOT NULL OR student_id IS NOT NULL)
```

### Question
```
id:                       UUID (PK)
test_id:                  UUID (FK → Test)
type:                     Enum ['single_choice', 'multiple_choice', 'open_answer']
text:                     Text
options:                  JSONB (nullable — масив {id, text} для питань з вибором)
correct_answer:           JSONB
  — single_choice:        {"option_id": "uuid"}
  — multiple_choice:      {"option_ids": ["uuid1", "uuid2"]}
  — open_answer:          {"keywords": ["слово1", "слово2"], "min_match": 2}
irt_difficulty_auto:      Float (nullable — MLE-оцінка β, розраховується автоматично)
irt_difficulty_override:  Float (nullable — ручне перевизначення інструктором)
irt_response_count:       Integer (default: 0 — кількість відповідей для цього питання)
order:                    Integer
created_at:               DateTime
```

**Активне значення β (використовується в алгоритмі):**
```
effective_difficulty = irt_difficulty_override
                       if irt_difficulty_override IS NOT NULL
                       else irt_difficulty_auto
                       if irt_difficulty_auto IS NOT NULL AND irt_response_count >= 30
                       else 0.0
```
> `irt_difficulty_auto` ігнорується, поки `irt_response_count < 30` — MLE нестабільна
> на малій вибірці. Поріг 30 відповідей є мінімальним для надійної IRT-оцінки.

### Attempt
```
id:                    UUID (PK)
test_id:               UUID (FK → Test)
student_id:            UUID (FK → User)
attempt_number:        Integer
theta:                 Float (IRT-оцінка здібності, default: 0.0)
status:                Enum ['in_progress', 'completed', 'timeout']
score:                 Float (nullable — заповнюється при завершенні)
max_score:             Float (nullable)
pending_review_count:  Integer (default: 0 — кількість відкритих відповідей на перевірці)
started_at:            DateTime
finished_at:           DateTime (nullable)
time_spent_seconds:    Integer (nullable)
```

### AttemptQuestion
```
id:            UUID (PK)
attempt_id:    UUID (FK → Attempt)
question_id:   UUID (FK → Question)
position:      Integer  # порядковий номер у цій спробі (0-based)
is_answered:   Boolean (default: false)
```
> Таблиця фіксує послідовність питань для кожної спроби на момент старту.
> Це дозволяє `GET /attempts/{id}/next` бути детермінованим та стійким до рестарту Redis.

### Answer
```
id:              UUID (PK)
attempt_id:      UUID (FK → Attempt)
question_id:     UUID (FK → Question)
student_answer:  JSONB
is_correct:      Boolean (nullable — null для open_answer до перевірки)
score:           Float
answered_at:     DateTime
```

---

## API: Endpoints та схеми

### Auth

**POST /api/auth/login**
```json
// Request
{ "login": "string", "password": "string" }

// Response 200
{
  "access_token": "string",
  "refresh_token": "string",
  "token_type": "bearer",
  "expires_in": 3600
}
```

**POST /api/auth/refresh**
```json
// Request
{ "refresh_token": "string" }

// Response 200
{
  "access_token": "string",
  "refresh_token": "string",  // rotating refresh token
  "token_type": "bearer",
  "expires_in": 3600
}
```
> Rotating refresh tokens: кожен refresh видає новий refresh token і анулює попередній.

**POST /api/auth/logout**
```json
// Request (Authorization: Bearer <access_token>)
{ "refresh_token": "string" }

// Response 204 No Content
```
> Встановлює `revoked = true` для вказаного refresh token.

**GET /api/auth/me**
```json
// Response 200
{
  "id": "uuid",
  "full_name": "string",
  "login": "string",
  "role": "instructor|student",
  "group_id": "uuid|null"
}
```

---

### Users (тільки інструктор)

**GET /api/users**
```
Query params:
  role:     "instructor"|"student" (optional)
  group_id: uuid (optional)
  page:     int (default: 1)
  per_page: int (default: 50, max: 200)

Response 200:
{
  "items": [ UserSchema ],
  "total": int,
  "page": int,
  "per_page": int
}
```

**POST /api/users**
```json
// Request
{
  "full_name": "string",
  "login": "string",
  "password": "string",
  "role": "instructor|student",
  "group_id": "uuid|null"
}

// Response 201
{ "id": "uuid", "full_name": "string", "login": "string", "role": "string", "group_id": "uuid|null" }
```

**PUT /api/users/{id}**
```json
// Request (усі поля optional)
{
  "full_name": "string",
  "login": "string",
  "password": "string",
  "group_id": "uuid|null",
  "is_active": true
}
// Response 200: UserSchema
```

**DELETE /api/users/{id}**
```
// Soft delete: is_active = false
// Response 204 No Content
```

**POST /api/users/bulk**
```
Content-Type: multipart/form-data
file: CSV

// Формат CSV (заголовки обов'язкові):
full_name,login,password,role,group_id
Іваненко Іван,ivanen,pass123,student,uuid-групи
Петренко Петро,petrenko,pass456,student,uuid-групи

// Правила:
// - group_id може бути порожнім для інструкторів
// - При дублікаті login — запис пропускається, повертається у списку помилок

// Response 200:
{
  "created": 45,
  "skipped": [
    { "login": "ivanen", "reason": "login already exists" }
  ]
}
```

---

### Groups (тільки інструктор)

**GET /api/groups**
```json
// Response 200
{ "items": [ { "id": "uuid", "name": "string", "student_count": int } ] }
```

**POST /api/groups**
```json
// Request
{ "name": "string" }
// Response 201: GroupSchema
```

**PUT /api/groups/{id}**
```json
// Request
{ "name": "string" }
// Response 200: GroupSchema
```

**GET /api/groups/{id}/students**
```json
// Response 200
{ "items": [ UserSchema ] }
```

---

### Tests

**GET /api/tests**
```
// Інструктор: усі власні тести (is_deleted=false)
// Студент: призначені активні тести
Query params:
  page:     int (default: 1)
  per_page: int (default: 20, max: 100)

Response 200:
{
  "items": [ TestListSchema ],
  "total": int,
  "page": int,
  "per_page": int
}
```

**POST /api/tests** *(тільки інструктор)*
```json
// Request
{
  "title": "string",
  "description": "string|null",
  "time_limit_minutes": "int|null",
  "max_attempts": 3
}
// Response 201: TestSchema
```

**GET /api/tests/{id}**
```json
// Response 200: TestSchema з question_count та assignment_count
```

**PUT /api/tests/{id}** *(тільки інструктор, тільки власні тести)*
```json
// Request: ті самі поля що й POST, усі optional
// Response 200: TestSchema
```

**DELETE /api/tests/{id}** *(тільки інструктор)*
```
// Soft delete: is_deleted = true
// Заборонено якщо є активні спроби (status='in_progress')
// Response 204 No Content
```

**POST /api/tests/{id}/publish** *(тільки інструктор)*
```json
// Перемикач: is_published = !is_published
// Заборонено публікувати тест без питань
// Response 200: { "is_published": true }
```

**POST /api/tests/{id}/assign** *(тільки інструктор)*
```json
// Request
{
  "group_id": "uuid|null",
  "student_id": "uuid|null",
  "available_from": "datetime",
  "available_until": "datetime|null"
}
// Валідація: group_id або student_id — хоча б одне обов'язкове
// Response 201: TestAssignmentSchema
```

---

### Questions (тільки інструктор)

**GET /api/tests/{id}/questions**
```json
// Response 200: масив QuestionSchema (без correct_answer — для студентів)
// Для інструктора — з correct_answer та обома полями difficulty
```

**POST /api/tests/{id}/questions**
```json
// Request
{
  "type": "single_choice|multiple_choice|open_answer",
  "text": "string",
  "options": [
    { "id": "uuid", "text": "string" }
  ],
  "correct_answer": {
    // single_choice:
    "option_id": "uuid"
    // multiple_choice:
    // "option_ids": ["uuid1", "uuid2"]
    // open_answer:
    // "keywords": ["слово1", "слово2"], "min_match": 2
  },
  "order": 1
}
// Response 201: QuestionSchema
```

**PUT /api/questions/{id}**
```json
// Request: ті самі поля що й POST, усі optional
// Заборонено якщо тест опубліковано і є завершені спроби
// Response 200: QuestionSchema
```

**DELETE /api/questions/{id}**
```
// Заборонено якщо тест опубліковано і є завершені спроби
// Response 204 No Content
```

**PATCH /api/questions/{id}/difficulty**
```json
// Request
{ "override": 1.5 }  // null — зняти перевизначення
// Response 200: { "irt_difficulty_override": 1.5, "irt_difficulty_auto": 0.3, "effective_difficulty": 1.5 }
```

---

### Attempts (студент)

**POST /api/attempts**
```json
// Request
{ "test_id": "uuid" }

// Валідація:
// - тест опубліковано та призначено студенту
// - available_from <= now <= available_until (якщо задано)
// - attempt_number < max_attempts
// - немає активної спроби (status='in_progress') для цього тесту

// Логіка генерації послідовності питань:
// - attempt_number = 1: питання у порядку order (стандартний режим)
// - attempt_number > 1: питання відсортовані за |effective_difficulty - theta|
//   (від найближчих до поточного рівня студента)
// Послідовність записується в таблицю AttemptQuestion

// Response 201:
{
  "attempt_id": "uuid",
  "attempt_number": 1,
  "total_questions": 10,
  "time_limit_minutes": 60,
  "first_question": QuestionForStudentSchema
}
```

**GET /api/attempts/{id}/next**
```json
// Повертає наступне непройдене питання за position у AttemptQuestion
// Якщо всі питання відповіді — повертає 404 з { "detail": "all_answered" }
// Ідемпотентний: повторний виклик повертає те саме питання

// Response 200:
{
  "question": QuestionForStudentSchema,
  "position": 3,
  "total": 10,
  "is_last": false
}
```

**POST /api/attempts/{id}/answer**
```json
// Request
{
  "question_id": "uuid",
  "answer": {
    // single_choice:
    "option_id": "uuid"
    // multiple_choice:
    // "option_ids": ["uuid1", "uuid2"]
    // open_answer:
    // "text": "рядок відповіді студента"
  }
}

// Валідація:
// - спроба belongs to current user
// - спроба in_progress
// - question_id є в AttemptQuestion для цієї спроби
// - питання ще не відповіли (is_answered = false в AttemptQuestion)

// Response 200:
{
  "is_correct": true,          // null для open_answer
  "score": 1.0,                // null для open_answer до перевірки
  "correct_answer": { ... }    // показується тільки після відповіді
}
```

**POST /api/attempts/{id}/finish**
```json
// Завершує спробу (можна викликати до відповіді на всі питання)
// Запускає Celery task: перерахунок theta + IRT calibration

// Response 200:
{
  "attempt_id": "uuid",
  "status": "completed",
  "score": 78.5,
  "max_score": 100.0,
  "pending_review_count": 2,   // кількість open_answer на ручній перевірці
  "time_spent_seconds": 1823
}
```

**GET /api/attempts/{id}/result**
```json
// Response 200:
{
  "attempt_id": "uuid",
  "attempt_number": 1,
  "status": "completed",
  "score": 78.5,
  "max_score": 100.0,
  "pending_review_count": 2,
  "answers": [
    {
      "question_id": "uuid",
      "question_text": "string",
      "question_type": "single_choice",
      "student_answer": { ... },
      "correct_answer": { ... },
      "is_correct": true,
      "score": 1.0
    }
  ]
}
```

**GET /api/attempts/my**
```
Query params:
  test_id:  uuid (optional)
  page:     int (default: 1)
  per_page: int (default: 20)

Response 200:
{
  "items": [ AttemptSummarySchema ],
  "total": int
}
```

---

### Open Answer Review (тільки інструктор)

**GET /api/review/pending**
```
// Список усіх відповідей типу open_answer з is_correct = null
Query params:
  test_id:  uuid (optional)
  page:     int (default: 1)
  per_page: int (default: 50)

Response 200:
{
  "items": [
    {
      "answer_id": "uuid",
      "attempt_id": "uuid",
      "student_name": "string",
      "question_text": "string",
      "correct_keywords": ["слово1", "слово2"],
      "min_match": 2,
      "student_answer_text": "string",
      "answered_at": "datetime"
    }
  ],
  "total": int
}
```

**POST /api/review/answers/{id}**
```json
// Ручна оцінка відкритої відповіді інструктором
// Request
{
  "is_correct": true,
  "score": 0.75   // від 0.0 до 1.0 (нормалізований бал за питання)
}

// Логіка після оцінки:
// - Оновити Answer: is_correct, score
// - Декрементувати Attempt.pending_review_count
// - Якщо pending_review_count = 0: перерахувати Attempt.score
// - Запустити Celery task для IRT recalibration (якщо pending_review_count = 0)

// Response 200:
{
  "answer_id": "uuid",
  "is_correct": true,
  "score": 0.75
}
```

---

### Analytics (тільки інструктор)

**GET /api/analytics/students/{id}**
```
Query params:
  date_from:    date (optional)
  date_to:      date (optional)
  test_id:      uuid (optional)

Response 200:
{
  "student": UserSchema,
  "attempts": [ AttemptAnalyticsSchema ],
  "average_score": 72.3,
  "theta_progression": [ { "attempt_number": 1, "theta": 0.0 }, ... ]
}
```

**GET /api/analytics/groups/{id}**
```
Query params:
  date_from:  date (optional)
  date_to:    date (optional)
  test_id:    uuid (optional)
  score_min:  float (optional, 0-100)
  score_max:  float (optional, 0-100)

Response 200:
{
  "group": GroupSchema,
  "students": [
    {
      "student": UserSchema,
      "average_score": float,
      "attempts_count": int,
      "last_attempt_at": datetime
    }
  ]
}
```

**GET /api/analytics/tests/{id}**
```
Query params:
  date_from:    date (optional)
  date_to:      date (optional)
  group_id:     uuid (optional)
  score_min:    float (optional)
  score_max:    float (optional)

Response 200:
{
  "test": TestSchema,
  "total_attempts": int,
  "completed_attempts": int,
  "average_score": float,
  "score_distribution": { "0-20": 3, "21-40": 5, ... }
}
```

**GET /api/analytics/tests/{id}/questions**
```json
// Response 200:
{
  "questions": [
    {
      "question_id": "uuid",
      "question_text": "string",
      "response_count": 42,
      "correct_rate": 0.67,
      "effective_difficulty": 0.5,
      "irt_difficulty_auto": 0.48,
      "irt_difficulty_override": null
    }
  ]
}
```

---

## Функціональні вимоги

### Аутентифікація та авторизація

- JWT access token (TTL: 60 хв), JWT refresh token (TTL: 30 днів)
- Rotating refresh tokens: кожен `/refresh` анулює попередній refresh token
- Зберігання refresh token як SHA-256 хеш у таблиці `refresh_token`
- При logout — анулювання refresh token; при зміні пароля — анулювання всіх токенів користувача
- Розподіл ролей: `instructor` / `student`. Студент не має доступу до instructor-endpoints
- Rate limiting на `/api/auth/login`: 10 запитів / хвилину з однієї IP

### Функції інструктора

- Створення, редагування, soft-delete тестів
- Додавання питань трьох типів: single_choice, multiple_choice, open_answer
- Для single/multiple_choice: варіанти відповідей, позначення правильних
- Для open_answer: ключові слова та мінімальна кількість збігів
- Перегляд автоматичного `irt_difficulty_auto` (тільки якщо `irt_response_count >= 30`)
- Ручне перевизначення складності питання
- Публікація/скасування публікації тесту
- Призначення тесту групі або конкретному студенту з діапазоном дат
- Перегляд та оцінювання відкритих відповідей студентів (`/api/review/pending`)
- Аналітика з фільтрацією за датою, групою, діапазоном балів

### Функції студента

- Список призначених активних тестів
- Початок спроби (з перевіркою `max_attempts` та `available_from/until`)
- Відповідь на питання по одному із зворотним відліком таймера
- Стан таймера персистується в Redis (`timer:{attempt_id}` → `{start_epoch, limit_seconds}`)
  та може бути відновлений з `Attempt.started_at` при рестарті Redis
- Автоматичне завершення при закінченні таймера (Celery Beat task, опис нижче)
- Перегляд результатів після завершення: бал, правильні/неправильні відповіді

---

## Адаптивний алгоритм

### Принцип роботи

Система використовує спрощений IRT-підхід між спробами, а не всередині спроби (не справжній CAT).
`catsim` використовується для post-hoc оцінки θ та калібрування β питань.

### Перша спроба
- `theta = 0.0`
- Питання показуються у порядку поля `order` (стандартний режим)
- Послідовність фіксується в `AttemptQuestion` при старті

### Після завершення спроби (Celery task `recalculate_irt`)
1. Зібрати масив пар `(effective_difficulty[q], is_correct[q])` для всіх відповіданих питань
2. Оновити `theta` студента через `catsim.estimation.estimate()` (MLE)
3. Для кожного питання у спробі:
   - Increment `irt_response_count`
   - Якщо `irt_response_count >= 30`: оновити `irt_difficulty_auto` через
     `catsim.estimation` на агрегованих даних по всіх студентах

### Наступні спроби
- Питання сортуються за `|effective_difficulty - theta|` (від мінімального)
- Послідовність фіксується в `AttemptQuestion` при старті нової спроби
- Tie-breaking при однаковому |β - θ|: нижчий `order` має пріоритет

### Важливі обмеження
- `irt_difficulty_auto` ігнорується при `irt_response_count < 30`
- Якщо у спробі є open_answer з `is_correct = null` — IRT recalibration відкладається
  до завершення ручної перевірки (Celery task запускається при `pending_review_count → 0`)
- Theta зберігається в `Attempt` та не переноситься між тестами (theta per test)

---

## Система оцінювання

### Single choice
```
score = 1.0  якщо вибраний option_id == correct option_id
score = 0.0  інакше
```

### Multiple choice
```
C = кількість правильних варіантів у питанні
S = кількість вибраних студентом правильних варіантів
W = кількість вибраних студентом неправильних варіантів
penalty_weight = 0.5

score = max(0.0, S/C - W * penalty_weight / C)
```
> Penalty weight = 0.5: за кожен неправильно вибраний варіант знімається 0.5/C балів.
> Мінімальний бал за питання — 0 (негативний бал неможливий).

### Open answer (автоматична частина)
```
matched = кількість ключових слів, знайдених у відповіді (case-insensitive)
score = matched / total_keywords
is_correct = matched >= min_match

// Пошук ключових слів:
// - case-insensitive порівняння
// - пробіл-розділені токени у відповіді студента
// - stemming не потрібен для MVP
```
> Фінальний бал може бути скоригований інструктором при ручній перевірці.

### Фінальний бал спроби
```
total_score = sum(answer.score for all answers)
max_possible = count(questions)
attempt.score = (total_score / max_possible) * 100
```
> Для спроб з pending open_answer: `attempt.score` перераховується після завершення
> ручної перевірки всіх відкритих відповідей.

---

## Автоматичне завершення спроб (Celery Beat)

Task `check_timed_out_attempts` виконується кожні 60 секунд:

```python
# Псевдокод
attempts = db.query(Attempt).filter(
    Attempt.status == 'in_progress',
    Attempt.test.time_limit_minutes != None,
    Attempt.started_at + timedelta(minutes=time_limit) < now()
)
for attempt in attempts:
    attempt.status = 'timeout'
    attempt.finished_at = now()
    attempt.time_spent_seconds = time_limit * 60
    calculate_score(attempt)       # з наявних відповідей
    enqueue(recalculate_irt, attempt.id)
```

> Це резервний механізм. Frontend також виконує auto-submit при спрацюванні таймера.
> При конкуренції (обидва тригери одночасно) — першим виграє той, хто встановить статус
> (PostgreSQL row-level lock або optimistic concurrency через перевірку статусу).

---

## Таймер (Redis)

При старті спроби:
```
SET timer:{attempt_id} '{"start_epoch": 1700000000, "limit_seconds": 3600}' EX 3700
```

При рефреші сторінки — frontend запитує `GET /api/attempts/{id}` і отримує:
```json
{
  "started_at": "2024-11-14T12:00:00Z",
  "time_limit_minutes": 60,
  "server_time": "2024-11-14T12:15:00Z"
}
```
Frontend обчислює залишок часу з `started_at + time_limit - server_time` (не з Redis —
Redis використовується лише для швидкого доступу на бекенді).

---

## Запуск

### Передумови
- Docker 24+
- Docker Compose v2
- Домен або IP з налаштованим TLS-сертифікатом (Let's Encrypt або self-signed для локальної мережі)

### Кроки
```bash
# 1. Клонувати та налаштувати
cp .env.example .env
# Обов'язково змінити: SECRET_KEY, REFRESH_SECRET_KEY, POSTGRES_PASSWORD

# 2. Запустити всі сервіси
docker-compose up --build -d

# 3. Виконати міграції БД
docker-compose exec backend alembic upgrade head

# 4. Створити перший акаунт інструктора
docker-compose exec backend python -m app.cli create-instructor \
  --login admin --password changeme --name "Адміністратор"

# 5. Доступ
# Frontend: https://your-domain:443
# API docs: https://your-domain/api/docs
```

### Сервіси docker-compose.yml
```
postgres    — PostgreSQL 15, port 5432 (не публічний)
redis       — Redis 7, port 6379 (не публічний)
backend     — FastAPI, port 8000 (не публічний)
celery      — Celery worker (без відкритого порту)
celery-beat — Celery Beat scheduler (без відкритого порту)
nginx       — Nginx reverse proxy, ports 80→443 (HTTPS)
frontend    — React/Nginx static, внутрішній порт 3000
```

---

## Змінні середовища (.env.example)

```env
# Безпека
SECRET_KEY=change-this-to-random-64-char-string
REFRESH_SECRET_KEY=change-this-to-another-random-64-char-string
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=30

# База даних
POSTGRES_USER=testing_user
POSTGRES_PASSWORD=change-this
POSTGRES_DB=adaptive_testing
DATABASE_URL=postgresql+asyncpg://testing_user:change-this@postgres:5432/adaptive_testing
# Для Celery tasks (sync driver):
SYNC_DATABASE_URL=postgresql+psycopg2://testing_user:change-this@postgres:5432/adaptive_testing

# Redis
REDIS_URL=redis://redis:6379/0

# CORS
CORS_ORIGINS=https://your-domain

# IRT
IRT_MIN_RESPONSE_COUNT=30
```

> **Примітка про `SYNC_DATABASE_URL`:** Celery tasks є синхронними, тому вони використовують
> `psycopg2` (sync driver) окремо від основного async-з'єднання FastAPI (`asyncpg`).

---

## Поза межами MVP (не реалізовувати)

- Email-нотифікації або скидання пароля через email
- Завантаження файлів для питань (зображення, аудіо)
- Відео/аудіо типи питань
- Реальна колаборація між інструкторами
- Мобільний нативний застосунок (тільки адаптивний веб)
- Інтеграція з зовнішніми LMS (Moodle тощо)
- Логіка оплати або підписок
- Автоматизований прокторинг (веб-камера, моніторинг екрану)
- Багатомовний інтерфейс (тільки українська)
- Роль admin окремо від instructor
- OAuth / SSO логін
- Експорт результатів у PDF
- Чат або повідомлення між користувачами
- Справжній CAT (оновлення θ після кожної відповіді всередині спроби)
