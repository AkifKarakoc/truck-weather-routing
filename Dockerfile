# Single image: the React app is built first, then served by Django (WhiteNoise)
# alongside the API, so the whole app lives on one origin.

FROM node:24-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build


FROM python:3.14-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DJANGO_DEBUG=false \
    FRONTEND_DIST=/app/frontend/dist

WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
COPY --from=frontend /app/frontend/dist /app/frontend/dist

RUN useradd --create-home app
USER app

# One process keeps the in-memory trip/weather cache shared; threads handle
# concurrent requests while others wait on HERE or Open-Meteo.
# exec makes gunicorn PID 1 so it receives shutdown signals; sh expands $PORT.
CMD ["sh", "-c", "exec gunicorn config.wsgi --bind 0.0.0.0:${PORT:-8000} --workers 1 --threads 8 --timeout 60 --access-logfile -"]
