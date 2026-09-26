# Deployment notes

Two supported shapes, one image, one schema.

## A. Laptop / demo (default, $0)

```bash
make install && make init-db && make serve
```

SQLite file `ecdat.db`, WAL mode, foreign keys on. No network calls in the request path.
Verify: `curl -s localhost:8000/api/v1/health`.

## B. Container + PostgreSQL

```bash
docker compose --profile postgres up --build
```

Brings up `api` (non-root, healthcheck on `/api/v1/health`) and `postgres:17-alpine`.
For a managed database, set `DATABASE_URL=postgresql+psycopg://…?sslmode=require` and run only the
`api` service; the schema is created on boot (`python -m app.manage init-db` runs in the CMD) and
Alembic is stamped at head.

## Migrations

```bash
python -m app.manage stamp head        # once, on a schema created by create_all
python -m app.manage revision -m "…"   # after a model change (autogenerate)
python -m app.manage upgrade head      # apply
python -m app.manage current           # verify
```

Rollback: `alembic downgrade -1`, or for the demo `make clean` and re-init (data is disposable).

## Backups

```bash
python -m app.manage backup --out-dir backups          # SQLite: online .backup API
DATABASE_URL=postgresql+psycopg://… python -m app.manage backup   # pg_dump --format=custom
python -m app.manage restore backups/<file>.sqlite3
python -m app.manage stats                              # confirm row counts after a restore
```

Recommended cadence: hourly `pg_dump` with 7-day rotation; SQLite demo → copy before every
presentation. A backup is only real after a restore has been tested once.

## Production checklist

- [ ] `ECDAT_API_KEYS` set to rotated per-client keys (never the dev default)
- [ ] `ECDAT_CORS_ORIGINS` set to the frontend origin (not `*`)
- [ ] `ECDAT_SIGNING_KEY_B64` set → dossiers stop reporting `key_origin: ephemeral_demo`
- [ ] TLS terminated at the proxy; the app listens on plain HTTP behind it
- [ ] `/api/v1/metrics` scraped; alert on `ecdat_errors_total` and p95 latency
- [ ] `ECDAT_ALLOW_LIVE_PROBE=false` unless a probe is explicitly required and allow-listed
- [ ] Log retention and `scan_events` pruning scheduled (events are append-only)
- [ ] `ECDAT_MAX_UPLOAD_BYTES` matched to the proxy's body limit
