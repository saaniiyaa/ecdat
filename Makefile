# ECDAT backend - the commands the README references, in one place.
# `make help` lists everything.

PY ?= python3
PORT ?= 8000
KEY ?= dev-ecdat-key
BASE := http://127.0.0.1:$(PORT)/api/v1

.PHONY: help install init-db stamp migrate test test-fast serve serve-reload demo demo-scale \
        backup restore stats drift docker-build docker-up docker-down openapi clean

help:
	@grep -E '^[a-zA-Z_-]+:.*?##' $(MAKEFILE_LIST) | awk -F':.*?## ' '{printf "  %-14s %s\n", $$1, $$2}'

install:  ## create .venv and install pinned dependencies
	$(PY) -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt

init-db:  ## create the schema if it does not exist (idempotent)
	$(PY) -m app.manage init-db

stamp:  ## mark the schema as owned by Alembic (run once, after init-db)
	$(PY) -m app.manage stamp head

migrate:  ## apply pending Alembic migrations
	$(PY) -m app.manage upgrade head

test:  ## full suite (detectors + risk engine + API)
	$(PY) -m pytest tests/ -q

test-fast:  ## detector + risk suites only (no HTTP)
	$(PY) -m pytest tests/test_detectors.py tests/test_risk_engine.py -q

serve:  ## run the API on $(PORT)
	$(PY) -m uvicorn app.main:app --host 0.0.0.0 --port $(PORT)

serve-reload:  ## run with auto-reload for development
	$(PY) -m uvicorn app.main:app --host 0.0.0.0 --port $(PORT) --reload

demo:  ## scan the demo estate through the running API and print the summary
	$(PY) -m app.manage demo-scan --base-url $(BASE) --api-key $(KEY) --target fixtures/demo_repo

demo-scale:  ## build a 2,020-file synthetic estate and scan it (throughput measurement)
	$(PY) scripts/scale_benchmark.py --base-url $(BASE) --api-key $(KEY)

backup:  ## consistent backup of the configured database into ./backups
	$(PY) -m app.manage backup --out-dir backups

restore:  ## restore a backup: make restore FILE=backups/ecdat-....sqlite3
	$(PY) -m app.manage restore $(FILE)

stats:  ## row counts per table
	$(PY) -m app.manage stats

drift:  ## autogenerate a revision to prove the models match the database
	$(PY) -m app.manage revision -m "drift check"

openapi:  ## write the OpenAPI contract to openapi.json (commit this: it is a contract)
	@curl -fsS $(BASE)/openapi.json -H "X-API-Key: $(KEY)" -o openapi.json || \
	  $(PY) -c "import json; from app.main import app; json.dump(app.openapi(), open('openapi.json','w'), indent=2)"
	@echo "openapi.json written"

docker-build:  ## build the image
	docker build -t ecdat-backend:1.0.0 .

docker-up:  ## run with Postgres (cloud-like, still one command)
	DATABASE_URL=postgresql+psycopg://ecdat:ecdat-dev-password@db:5432/ecdat \
	docker compose --profile postgres up --build

docker-down:  ## stop containers
	docker compose --profile postgres --profile sqlite down

clean:  ## remove caches and local databases
	rm -rf .pytest_cache .mypy_cache .ruff_cache ecdat.db ecdat.db-wal ecdat.db-shm
	find . -name __pycache__ -type d -prune -exec rm -rf {} +

benchmark:  ## regenerate docs/measurements.json (all numbers quoted in the docs)
	$(PY) scripts/measure_all.py --api-key $(KEY)
