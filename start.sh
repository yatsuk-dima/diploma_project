#!/bin/bash
set -e

# Railway provides DATABASE_URL as postgresql:// or postgres://
# SQLAlchemy needs postgresql+asyncpg:// (async) and postgresql+psycopg2:// (sync)
if [[ -n "$DATABASE_URL" ]]; then
    BASE_URL="${DATABASE_URL#postgres://}"
    BASE_URL="${BASE_URL#postgresql://}"
    export DATABASE_URL="postgresql+asyncpg://${BASE_URL}"
    export SYNC_DATABASE_URL="postgresql+psycopg2://${BASE_URL}"
fi

# Apply Railway's dynamic $PORT to nginx config
export PORT=${PORT:-80}
envsubst '${PORT}' < /etc/nginx/conf.d/app.conf.template > /etc/nginx/conf.d/default.conf

# Run DB migrations
cd /app/back
alembic upgrade head

exec /usr/bin/supervisord -c /etc/supervisor/supervisord.conf
