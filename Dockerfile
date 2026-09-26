# ECDAT backend - single-stage image.
# Deliberately small: the scanning core is stdlib-only (ast, hashlib, zipfile,
# tarfile, ssl, re), so there is nothing to compile and no tree-sitter/LIEF to
# install. Image size stays ~180 MB.
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    ECDAT_ENV=prod \
    DATABASE_URL=sqlite:////data/ecdat.db

# libpq is only needed for the Postgres path; curl is used by the healthcheck.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libpq5 curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY migrations ./migrations
COPY alembic.ini ./
COPY fixtures ./fixtures
COPY scripts ./scripts

# Non-root, with a writable data volume for the SQLite demo and backups.
RUN useradd --create-home --uid 10001 ecdat \
 && mkdir -p /data /app/backups \
 && chown -R ecdat:ecdat /data /app
USER ecdat

VOLUME ["/data"]
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8000/api/v1/health || exit 1

# One worker per container; scale with replicas, not with threads, so that a
# long scan cannot block the health endpoint of every other request.
CMD ["sh", "-c", "python -m app.manage init-db && python -m app.manage stamp head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1 --proxy-headers"]
