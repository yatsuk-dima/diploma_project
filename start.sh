#!/bin/bash
set -e

# Apply Railway's dynamic $PORT to nginx config
export PORT=${PORT:-80}
envsubst '${PORT}' < /etc/nginx/conf.d/app.conf.template > /etc/nginx/conf.d/default.conf

# Run DB migrations
cd /app/back
alembic upgrade head

exec /usr/bin/supervisord -c /etc/supervisor/supervisord.conf
