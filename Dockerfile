# syntax=docker/dockerfile:1
# Imagen única: compila el frontend y lo sirve desde Flask/gunicorn (mismo origen que la API).

# ---- 1) Frontend ----------------------------------------------------------------
FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- 2) Backend + frontend compilado ------------------------------------------------
FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    FLASK_ENV=production \
    FRONTEND_DIST=/app/frontend-dist \
    PORT=8000
WORKDIR /app

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./
COPY --from=web /web/dist /app/frontend-dist

RUN useradd --create-home --uid 10001 onmi \
    && mkdir -p /app/instance \
    && chown -R onmi:onmi /app/instance \
    && chmod +x /app/docker-entrypoint.sh
USER onmi

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD python -c "import urllib.request,os;urllib.request.urlopen(f'http://localhost:{os.environ.get(\"PORT\",\"8000\")}/api/health')"
ENTRYPOINT ["/app/docker-entrypoint.sh"]
