# Deployment Guide

## Prerequisites

- Docker ≥ 24 and Docker Compose v2 (`docker compose` command)
- A server with at least 2 GB RAM
- A domain name pointed at the server (for TLS)
- Ports 80 (and 443 for HTTPS) open in the firewall

## First Deploy

### 1. Clone and configure

```bash
git clone <repo-url> yatsiuk
cd yatsiuk
cp .env.example .env
```

Edit `.env` with real values:

```dotenv
POSTGRES_USER=yatsiuk
POSTGRES_PASSWORD=<strong-password>
POSTGRES_DB=yatsiuk

DATABASE_URL=postgresql+asyncpg://yatsiuk:<password>@postgres:5432/yatsiuk
SYNC_DATABASE_URL=postgresql+psycopg2://yatsiuk:<password>@postgres:5432/yatsiuk
REDIS_URL=redis://redis:6379/0

SECRET_KEY=<64-char random hex>
REFRESH_SECRET_KEY=<64-char different random hex>
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=30

CORS_ORIGINS=https://your.domain.com
IRT_MIN_RESPONSE_COUNT=30
```

Generate secrets:
```bash
openssl rand -hex 32   # run twice — one for each key
```

### 2. Build and start

```bash
docker compose up -d --build
```

### 3. Run database migrations

```bash
docker compose exec backend alembic upgrade head
```

### 4. Create the first instructor account

```bash
docker compose exec backend python -c "
import asyncio
from app.database import async_session_factory
from app.models.user import User
from app.services.auth_service import hash_password
import uuid

async def create():
    async with async_session_factory() as db:
        u = User(id=uuid.uuid4(), email='admin@example.com',
                 hashed_password=hash_password('ChangeMe123!'),
                 full_name='Admin', role='instructor')
        db.add(u)
        await db.commit()
        print('Created:', u.email)

asyncio.run(create())
"
```

### 5. Verify

```bash
curl http://your.domain.com/health
# {"status":"ok"}
```

---

## Update Procedure

```bash
git pull
docker compose up -d --build
docker compose exec backend alembic upgrade head
```

If only the frontend changed, you can rebuild just that service:
```bash
docker compose up -d --build frontend nginx
```

---

## Database Migrations

Create a new migration after changing models:
```bash
docker compose exec backend alembic revision --autogenerate -m "describe change"
```

Apply:
```bash
docker compose exec backend alembic upgrade head
```

Roll back one step:
```bash
docker compose exec backend alembic downgrade -1
```

---

## Backup

### PostgreSQL

```bash
# Dump
docker compose exec -T postgres pg_dump -U yatsiuk yatsiuk | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz

# Restore
gunzip -c backup_YYYYMMDD_HHMMSS.sql.gz | docker compose exec -T postgres psql -U yatsiuk yatsiuk
```

Automate daily backups with cron:
```
0 3 * * * cd /path/to/yatsiuk && docker compose exec -T postgres pg_dump -U yatsiuk yatsiuk | gzip > /backups/db_$(date +\%Y\%m\%d).sql.gz && find /backups -name "db_*.sql.gz" -mtime +30 -delete
```

### Redis

Redis is used only for transient timer data — no backup required.

---

## TLS Setup (Let's Encrypt)

1. Install Certbot on the host:
   ```bash
   sudo apt install certbot
   ```

2. Stop nginx temporarily to free port 80:
   ```bash
   docker compose stop nginx
   sudo certbot certonly --standalone -d your.domain.com
   docker compose start nginx
   ```

3. Mount certificates into the nginx container. Add to `docker-compose.yml`:
   ```yaml
   nginx:
     volumes:
       - ./nginx/nginx.conf:/etc/nginx/conf.d/default.conf:ro
       - /etc/letsencrypt/live/your.domain.com/fullchain.pem:/etc/nginx/certs/fullchain.pem:ro
       - /etc/letsencrypt/live/your.domain.com/privkey.pem:/etc/nginx/certs/privkey.pem:ro
   ```

4. Uncomment the HTTPS server block in `nginx/nginx.conf` and set `server_name your.domain.com`.

5. Enable HSTS: uncomment the `Strict-Transport-Security` line.

6. Restart nginx:
   ```bash
   docker compose up -d nginx
   ```

7. Auto-renew (add to cron):
   ```
   0 2 * * * certbot renew --quiet && docker compose -f /path/to/yatsiuk/docker-compose.yml exec nginx nginx -s reload
   ```

---

## Celery Worker Management

View running workers:
```bash
docker compose exec celery celery -A app.celery_app inspect active
```

View queued tasks:
```bash
docker compose exec celery celery -A app.celery_app inspect reserved
```

Purge the queue (use with caution):
```bash
docker compose exec celery celery -A app.celery_app purge
```

Scale workers (e.g. to handle more IRT recalculations):
```bash
docker compose up -d --scale celery=3
```

Restart just the workers:
```bash
docker compose restart celery celery-beat
```

---

## Logs

```bash
# All services
docker compose logs -f

# Single service
docker compose logs -f backend
docker compose logs -f celery
docker compose logs -f nginx
```

---

## Monitoring Health

```bash
# Backend
curl http://localhost/health

# Celery
docker compose exec celery celery -A app.celery_app inspect ping

# Postgres
docker compose exec postgres pg_isready -U yatsiuk -d yatsiuk

# Redis
docker compose exec redis redis-cli ping
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| 502 Bad Gateway | Backend crashed or not ready | `docker compose logs backend` |
| 504 Gateway Timeout | Backend slow / DB locked | Check DB connections; restart backend |
| Blank page on reload | SPA fallback missing | Ensure `try_files $uri $uri/ /index.html` in nginx |
| IRT not recalculating | Celery worker down | `docker compose restart celery` |
| JWT errors after deploy | SECRET_KEY changed | Clear `refresh_token` from browser localStorage |
