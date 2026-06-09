# Система адаптивного тестування

FastAPI + React SPA з адаптивним підбором питань на базі Item Response Theory (IRT).

---

## Швидкий старт

### 1. Клонувати репозиторій

```bash
git clone git@github.com:yatsuk-dima/diploma_project.git
cd diploma_project
```

### 2. Створити `.env` файл

```bash
cp .env.example .env
```

Відкрити `.env` і замінити паролі:

```env
SECRET_KEY=          # будь-який рядок 64+ символи
REFRESH_SECRET_KEY=  # інший рядок 64+ символи
POSTGRES_PASSWORD=   # будь-який пароль для БД
```

Генерація ключів:

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

### 3. Підняти всі сервіси

```bash
docker compose up -d --build
```

### 4. Застосувати міграції БД

```bash
docker compose exec backend alembic upgrade head
```

### 5. Заповнити тестовими даними

```bash
docker compose exec backend python seed.py
```

Застосунок: **http://localhost** · API docs: **http://localhost/api/docs**

---

## Тестові облікові записи

> Доступні після виконання `seed.py`

### Адміністратор

| Логін | Пароль |
|---|---|
| `admin` | `Admin123!` |

### Викладачі

| Логін | Пароль | Дисципліна |
|---|---|---|
| `kovalenko_iv` | `Instructor1!` | Мережеві технології |
| `petrov_mv` | `Instructor2!` | Захист інформації |
| `melnyk_op` | `Instructor3!` | ОС Linux |

### Курсанти — пароль для всіх: `Student123!`

| Логін | ПІБ | Група |
|---|---|---|
| `petrov_s` | Петров Сергій Олексійович | КІТ-21 |
| `kovalenko_m` | Коваленко Михайло Вікторович | КІТ-21 |
| `shevchenko_o` | Шевченко Олег Андрійович | КІТ-21 |
| `melnyk_v` | Мельник Василь Іванович | КІТ-21 |
| `bondarenko_d` | Бондаренко Денис Романович | КІТ-21 |
| `kravchenko_a` | Кравченко Андрій Миколайович | КІТ-22 |
| `tkachenko_i` | Ткаченко Ігор Степанович | КІТ-22 |
| `lysenko_p` | Лисенко Павло Олексійович | КІТ-22 |
| `marchenko_n` | Марченко Наталія Іванівна | КІТ-22 |
| `savchenko_y` | Савченко Юрій Петрович | КІТ-22 |

---

## Архітектура

```
back/    FastAPI (async) + PostgreSQL + Redis + Celery
front/   React SPA (Vite, Tailwind CSS)
```

`docker-compose.yml` піднімає 6 сервісів:

| Сервіс | Опис |
|---|---|
| `postgres` | PostgreSQL 15 |
| `redis` | Redis 7 |
| `backend` | FastAPI / Uvicorn (внутрішній порт 8000) |
| `celery` | Worker — IRT перерахунок після кожної спроби |
| `celery-beat` | Beat — перевірка таймаутів кожні 60 с |
| `frontend` | Nginx — React SPA + реверс-проксі `/api/` → backend |

---

## Корисні команди

```bash
# Логи
docker compose logs -f backend

# Зупинити
docker compose down

# Зупинити + видалити дані БД
docker compose down -v

# Перебудувати один сервіс
docker compose up -d --build backend

# Нова міграція
docker compose exec backend alembic revision --autogenerate -m "опис"
```

---

## Змінні середовища

Дивись `.env.example`. Критичні для продакшену:

| Змінна | Опис |
|---|---|
| `SECRET_KEY` | Підпис JWT access-токенів |
| `REFRESH_SECRET_KEY` | Підпис JWT refresh-токенів |
| `POSTGRES_PASSWORD` | Пароль PostgreSQL |
| `CORS_ORIGINS` | Дозволені origins (напр. `https://yourdomain.com`) |
