# Система адаптивного тестування — Бекенд

REST API для системи адаптивного тестування на базі Item Response Theory (IRT). Побудовано на FastAPI з PostgreSQL, Redis та Celery.

## Зміст

- [Технологічний стек](#технологічний-стек)
- [Архітектура](#архітектура)
- [Ролі та доступ](#ролі-та-доступ)
- [Демонстраційні дані](#демонстраційні-дані)
- [Швидкий старт](#швидкий-старт)
- [Змінні середовища](#змінні-середовища)
- [API](#api)
- [Бази даних та міграції](#бази-даних-та-міграції)
- [Тестування](#тестування)
- [Celery-задачі](#celery-задачі)
- [IRT-алгоритм](#irt-алгоритм)
- [Деплой](#деплой)

---

## Технологічний стек

| Компонент | Технологія | Версія |
|---|---|---|
| Web framework | FastAPI | 0.115.5 |
| ASGI server | Uvicorn | 0.32.1 |
| ORM | SQLAlchemy (async) | 2.0.36 |
| DB driver (async) | asyncpg | 0.30.0 |
| DB driver (sync) | psycopg2-binary | 2.9.10 |
| Migrations | Alembic | 1.14.0 |
| Auth | PyJWT + passlib[bcrypt] | 2.10.1 / 1.7.4 |
| Task queue | Celery + Redis | 5.4.0 / 5.2.1 |
| IRT | catsim | 0.17.0 |
| Validation | Pydantic v2 | 2.x |
| Rate limiting | slowapi | 0.1.9 |
| Tests | pytest + pytest-asyncio | 8.3.4 |

---

## Архітектура

```
┌─────────────────────────────────────────────────────────────┐
│                        nginx :80                            │
│          /api/* → backend:8000   /  → frontend:80          │
└────────────────────┬────────────────────────────────────────┘
                     │
          ┌──────────▼──────────┐
          │   FastAPI :8000     │
          │  (Uvicorn ASGI)     │
          └──────────┬──────────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
   ┌────▼────┐  ┌────▼────┐  ┌───▼────────┐
   │PostgreSQL│  │  Redis  │  │   Celery   │
   │  :5432  │  │  :6379  │  │  Worker +  │
   └─────────┘  └─────────┘  │    Beat    │
                              └────────────┘
```

**Потік запиту:**
1. Nginx приймає HTTP-запит
2. `/api/*` проксується на FastAPI
3. FastAPI виконує бізнес-логіку через SQLAlchemy (asyncpg)
4. Важкі IRT-розрахунки передаються Celery через Redis
5. Celery worker виконує задачі з sync-сесією (psycopg2)

---

## Ролі та доступ

Система має три ролі з різними правами:

| Роль | Можливості |
|---|---|
| **admin** | Керує дисциплінами, користувачами, групами; призначає групи до дисциплін |
| **instructor** | Прив'язаний до однієї дисципліни; створює/редагує тести та питання, переглядає аналітику, перевіряє відкриті відповіді |
| **student** | Прив'язаний до групи; бачить дисципліни своєї групи та їхні опубліковані тести; проходить тестування |

**Видимість тестів для курсанта:** курсант → група → `group_disciplines` → дисципліна → опубліковані тести.

**Адаптивність:** при першій спробі питання йдуть в порядку `Question.order`; при повторних — сортуються за `|effective_difficulty − θ|`, щоб відповідати поточному рівню знань курсанта.

---

## Демонстраційні дані

Після запуску `docker compose exec backend python seed.py`:

### Адміністратор
| Логін | Пароль |
|---|---|
| `admin` | `Admin123!` |

### Викладачі
| Логін | Пароль | Дисципліна |
|---|---|---|
| `kovalenko_iv` | `Instructor1!` | Мережеві технології та протоколи |
| `petrov_mv` | `Instructor2!` | Захист інформації та кібербезпека |
| `melnyk_op` | `Instructor3!` | Операційні системи та адміністрування |

### Курсанти (пароль: `Student123!`)
| Логін | ПІБ | Взвод |
|---|---|---|
| `petrov_s` | Петров Сергій Олексійович | Взвод 101 |
| `kovalenko_m` | Коваленко Михайло Вікторович | Взвод 101 |
| `shevchenko_o` | Шевченко Олег Андрійович | Взвод 101 |
| `melnyk_v` | Мельник Василь Іванович | Взвод 101 |
| `bondarenko_d` | Бондаренко Денис Романович | Взвод 101 |
| `kravchenko_a` | Кравченко Андрій Миколайович | Взвод 102 |
| `tkachenko_i` | Ткаченко Ігор Степанович | Взвод 102 |
| `lysenko_p` | Лисенко Павло Олексійович | Взвод 102 |
| `marchenko_n` | Марченко Наталія Іванівна | Взвод 102 |
| `savchenko_y` | Савченко Юрій Петрович | Взвод 102 |

### Тести
| Код заняття | Дисципліна |
|---|---|
| Л-1.1, Г/з-1.2 | Мережеві технології та протоколи |
| Л-2.1, Г/з-2.2 | Захист інформації та кібербезпека |
| Л-3.1, Г/з-3.2 | Операційні системи та адміністрування |

---

## Швидкий старт

### Docker Compose (рекомендовано)

> `docker-compose.yml` знаходиться в **корені** репозиторію. Всі команди виконувати звідти.

```bash
# 1. Налаштувати змінні середовища (в корені репо)
cp .env.example .env

# 2. Збілдити і запустити стек
docker compose up -d --build

# 3. Застосувати міграції БД
docker compose exec backend alembic upgrade head

# 4. Завантажити демонстраційні дані
docker compose exec backend python seed.py
```

Застосунок доступний на **`http://localhost`** · API-документація: **`http://localhost/api/docs`**

### Локальна розробка (без Docker)

**Передумови:** Python 3.12, PostgreSQL 15, Redis 7, Node.js 20

**Термінал 1 — бекенд:**
```bash
cd back
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # вкажіть DATABASE_URL і REDIS_URL
alembic upgrade head
python seed.py
uvicorn app.main:app --reload --port 8000
```

**Термінал 2 — Celery worker:**
```bash
cd back && source .venv/bin/activate
celery -A app.celery_app worker --loglevel=info
```

**Термінал 3 — фронтенд:**
```bash
cd front && npm install && npm run dev
```

Застосунок доступний на **`http://localhost:3000`**, API проксюється на `http://localhost:8000`.

---

## Змінні середовища

Файл `.env`:

```dotenv
# JWT
SECRET_KEY=<64-символьний випадковий рядок>
REFRESH_SECRET_KEY=<інший 64-символьний рядок>
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=30

# PostgreSQL
POSTGRES_USER=testing_user
POSTGRES_PASSWORD=<пароль>
POSTGRES_DB=adaptive_testing
DATABASE_URL=postgresql+asyncpg://<user>:<pass>@postgres:5432/<db>
SYNC_DATABASE_URL=postgresql+psycopg2://<user>:<pass>@postgres:5432/<db>

# Redis
REDIS_URL=redis://redis:6379/0

# CORS (кома-розділений список)
CORS_ORIGINS=https://your.domain.com

# IRT (мінімум відповідей для авто-калібрування складності)
IRT_MIN_RESPONSE_COUNT=30
```

Генерація ключів:
```bash
openssl rand -hex 32   # виконати двічі
```

---

## API

Після запуску: **Swagger UI** — `http://localhost/api/docs` · **ReDoc** — `http://localhost/api/redoc`

### Ендпоінти

#### Автентифікація `/api/auth`
| Метод | Шлях | Опис |
|---|---|---|
| POST | `/api/auth/login` | Вхід (login + password) |
| POST | `/api/auth/refresh` | Оновлення access token |
| POST | `/api/auth/logout` | Вихід |
| GET | `/api/auth/me` | Поточний користувач |

#### Дисципліни `/api/disciplines`
| Метод | Шлях | Доступ | Опис |
|---|---|---|---|
| GET | `/api/disciplines` | всі | Список (admin: всі; instructor: своя; student: через групу) |
| POST | `/api/disciplines` | admin | Створити |
| PUT | `/api/disciplines/{id}` | admin | Оновити |
| DELETE | `/api/disciplines/{id}` | admin | Видалити |
| POST | `/api/disciplines/{id}/groups/{gid}` | admin | Прив'язати групу |
| DELETE | `/api/disciplines/{id}/groups/{gid}` | admin | Відв'язати групу |

#### Користувачі `/api/users` *(admin/instructor)*
| Метод | Шлях | Опис |
|---|---|---|
| GET | `/api/users` | Список (фільтр: role, group_id) |
| POST | `/api/users` | Створити |
| PUT | `/api/users/{id}` | Оновити |
| DELETE | `/api/users/{id}` | Деактивувати |
| POST | `/api/users/bulk` | Масове завантаження з CSV |

#### Групи `/api/groups` *(admin/instructor)*
| Метод | Шлях | Опис |
|---|---|---|
| GET | `/api/groups` | Список груп |
| POST | `/api/groups` | Створити |
| PUT | `/api/groups/{id}` | Перейменувати |
| DELETE | `/api/groups/{id}` | Видалити |

#### Тести `/api/tests`
| Метод | Шлях | Доступ | Опис |
|---|---|---|---|
| GET | `/api/tests` | обидва | Список (instructor: свої; student: опубліковані в дисципліні) |
| POST | `/api/tests` | instructor | Створити (discipline_id береться з профілю викладача) |
| GET | `/api/tests/{id}` | обидва | Деталі |
| PUT | `/api/tests/{id}` | instructor | Оновити |
| DELETE | `/api/tests/{id}` | instructor | Видалити |
| POST | `/api/tests/{id}/publish` | instructor | Відкрити/закрити тест (toggle is_published) |

#### Питання
| Метод | Шлях | Опис |
|---|---|---|
| GET | `/api/tests/{id}/questions` | Список питань |
| POST | `/api/tests/{id}/questions` | Додати питання |
| PUT | `/api/questions/{id}` | Оновити |
| DELETE | `/api/questions/{id}` | Видалити |
| PATCH | `/api/questions/{id}/difficulty` | Встановити IRT складність вручну |

#### Спроби `/api/attempts` *(student)*
| Метод | Шлях | Опис |
|---|---|---|
| POST | `/api/attempts` | Почати нову спробу |
| GET | `/api/attempts/my` | Мої спроби |
| GET | `/api/attempts/{id}` | Стан (таймер) |
| GET | `/api/attempts/{id}/next` | Наступне питання |
| POST | `/api/attempts/{id}/answer` | Відповісти |
| POST | `/api/attempts/{id}/finish` | Завершити |
| GET | `/api/attempts/{id}/result` | Результати |

#### Перевірка відкритих відповідей `/api/review` *(instructor)*
| Метод | Шлях | Опис |
|---|---|---|
| GET | `/api/review/pending` | Відповіді на перевірку |
| POST | `/api/review/answers/{id}` | Оцінити відповідь |

#### Аналітика `/api/analytics` *(instructor)*
| Метод | Шлях | Опис |
|---|---|---|
| GET | `/api/analytics/students/{id}` | Аналітика курсанта |
| GET | `/api/analytics/groups/{id}` | Аналітика групи |
| GET | `/api/analytics/tests/{id}` | Аналітика тесту |
| GET | `/api/analytics/tests/{id}/questions` | Статистика питань |

### Формат помилок

```json
{ "detail": "Повідомлення про помилку", "code": "MACHINE_READABLE_CODE" }
```

Коди: `TEST_NOT_FOUND`, `TEST_NOT_AVAILABLE`, `ATTEMPT_ALREADY_ACTIVE`, `ATTEMPT_LIMIT_REACHED`, `ATTEMPT_NOT_IN_PROGRESS`, `QUESTION_ALREADY_ANSWERED`, `VALIDATION_ERROR`, `INTERNAL_ERROR`.

---

## Бази даних та міграції

### Схема

```
disciplines ──── group_disciplines ──── groups ──── users (student)
     │
     └── tests ──── questions
           │
     users (instructor)
           │
     attempts ──── attempt_questions ──── answers
```

### Управління міграціями

```bash
alembic upgrade head              # застосувати всі
alembic downgrade -1              # відкотити на одну
alembic revision --autogenerate -m "опис"  # нова міграція
alembic current                   # поточна версія
alembic history                   # історія
```

### Бекап

```bash
# Дамп
docker compose exec -T postgres pg_dump -U testing_user adaptive_testing \
  | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz

# Відновлення
gunzip -c backup_*.sql.gz | docker compose exec -T postgres \
  psql -U testing_user adaptive_testing
```

---

## Тестування

```bash
# Юніт-тести (без БД)
docker compose run --rm backend pytest
docker compose run --rm backend pytest -m "not integration"

# Один файл
docker compose run --rm backend pytest tests/test_grading.py -v

# Інтеграційні (потребують реальних БД/Redis)
docker compose run --rm backend pytest --run-integration tests/test_integration.py -v
```

---

## Celery-задачі

### За розкладом (celery-beat)

| Задача | Розклад | Призначення |
|---|---|---|
| `check_timed_out_attempts` | кожні 60 сек | Завершує спроби з вичерпаним часом |
| `cleanup_expired_tokens` | щодня о 3:00 | Видаляє прострочені refresh tokens |

### За подією

| Задача | Тригер | Призначення |
|---|---|---|
| `recalculate_theta` | після завершення спроби | Оновлює θ курсанта (IRT) |
| `recalibrate_question_difficulty` | після `recalculate_theta` | Перераховує складність питання |
| `finalize_attempt_after_review` | після останньої перевірки | Перераховує бал + запускає IRT |

```bash
# Моніторинг
docker compose exec celery celery -A app.celery_app inspect active
docker compose restart celery
```

---

## IRT-алгоритм

Система використовує **модель Раша** (1-параметрична IRT) через бібліотеку `catsim`.

### Оцінка здібності (θ)

- Початкове значення θ = 0 (середній рівень)
- Після кожної завершеної спроби θ оновлюється Celery-задачею
- При наступній спробі питання впорядковуються за `|difficulty − θ|`

### Складність питань

- `effective_difficulty = irt_difficulty_override ?? irt_difficulty_auto ?? 0.0`
- Авто-калібрування: `difficulty = -log(p / (1 - p))` де `p = correct / total`
- Авто-калібрування вмикається після **30 відповідей** (`IRT_MIN_RESPONSE_COUNT`)
- Інструктор може вручну задати рівень: Простий / Середній / Складний (`difficulty_level`)

> Рівень складності питань **не показується курсантам** — лише викладачу в редакторі питань.

---

## Деплой

```bash
# Перший запуск
git clone <repo> && cd diploma_project
cp .env.example .env   # встановити SECRET_KEY, паролі, CORS_ORIGINS
docker compose up -d --build
docker compose exec backend alembic upgrade head
docker compose exec backend python seed.py

# Оновлення
git pull
docker compose up -d --build
docker compose exec backend alembic upgrade head
```

Детальна інструкція з TLS та резервним копіюванням: [`docs/DEPLOY.md`](docs/DEPLOY.md).
