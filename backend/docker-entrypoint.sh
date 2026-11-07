#!/bin/sh
set -e

# Con argumentos (p. ej. `flask --app wsgi send-reminders`) ejecuta ese comando en vez del servidor.
if [ "$#" -gt 0 ]; then
  exec "$@"
fi

# Aplica las migraciones antes de arrancar (idempotente).
flask --app wsgi db upgrade

exec gunicorn wsgi:app \
  --bind "0.0.0.0:${PORT:-8000}" \
  --workers "${WEB_CONCURRENCY:-2}" \
  --threads 4 \
  --access-logfile -
