# Adaptive Knowledge Testing System

Система адаптивного тестування для військового інституту на основі Item Response Theory (IRT).

## Репозиторії

| Директорія | Опис | Документація |
|---|---|---|
| [`back/`](back/) | FastAPI backend, PostgreSQL, Celery, IRT | [back/README.md](back/README.md) |
| [`front/`](front/) | React SPA, Vite, Tailwind CSS | [front/README.md](front/README.md) |

## Запуск

```bash
cd back
cp .env.example .env   # налаштуйте змінні
docker compose up -d --build
docker compose exec backend alembic upgrade head
```

Застосунок: **http://localhost** · API Docs: **http://localhost/api/docs**

## Структура

```
.
├── back/                 # Backend (Python / FastAPI)
│   ├── app/              # Код застосунку
│   ├── nginx/            # Reverse proxy конфігурація
│   ├── docs/             # Специфікація, план, інструкція деплою
│   ├── docker-compose.yml
│   └── README.md
│
└── front/                # Frontend (React / Vite)
    ├── src/
    ├── Dockerfile
    └── README.md
```
