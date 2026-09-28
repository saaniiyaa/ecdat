# ECDAT Backend — Enterprise Cryptographic Discovery & Analysis Tool

**SIH PS 26164 · NTRO · Blockchain & Cybersecurity**
Deterministic, offline-capable cryptographic discovery → dual-track (classical + quantum) risk →
Mosca analysis → purpose-aware PQC migration plan → CycloneDX CBOM + signed forensic dossier.

> **Not detected is not quantum-safe.** Every scan returns a coverage index and names the surfaces
> it did not inspect.

📄 Full backend design: **[`docs/BACKEND_ARCHITECTURE_AND_STRATEGY.md`](docs/BACKEND_ARCHITECTURE_AND_STRATEGY.md)** (12 sections)
📊 Measured performance: **[`docs/measurements.json`](docs/measurements.json)** (regenerate with `make benchmark`)
🔌 API contract: **`openapi.json`** · live docs at `/docs` · [`COORDINATION.md`](COORDINATION.md)

---

## 1. Run it

### 1a. The one-liner (Windows, macOS, Linux — all the same)

```bat
python setup_ecdat.py
```

That single Python file checks your interpreter, builds `.venv`, installs the pinned requirements,
creates the 19-table database and starts the API on <http://127.0.0.1:8000>. It is the same
`setup_ecdat.py` on every platform, so there is nothing Windows-specific to learn. Other modes:

```bat
python setup_ecdat.py test      REM run the 95-test suite
python setup_ecdat.py demo      REM start the API + run the demo scan
python setup_ecdat.py install   REM install and prepare only
```

`setup_ecdat.py` is deliberately plain Python: this distribution contains **no `.bat` and no
`.ps1`**, so it runs from any shell and does not trip security software that quarantines
downloaded archives containing Windows scripts.

### 1b. Explicit steps (Linux / macOS)

```bash
cd ecdat-backend
python3 -m venv .venv && source .venv/bin/activate     # 1. environment
pip install -r requirements.txt                        # 2. dependencies (~15 s)
python -m app.manage init-db                          # 3. create ./ecdat.db (19 tables)
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000   # 4. serve
```

Python **3.11+** (developed and measured on 3.13.14). Verify:

```bash
curl -s localhost:8000/api/v1/health
# {"status":"healthy","version":"1.0.0","engine_version":"1.0.0","policy_pack_version":"pp-2026.09",
#  "database":"connected","dialect":"sqlite","uptime_seconds":4.5,"queue_depth":0,...}
```

Open the interactive contract at <http://localhost:8000/docs>.

### Or use the Makefile

```bash
make install      # venv + pinned requirements
make init-db      # create schema (idempotent)
make serve        # uvicorn on :8000
make test         # 95 tests
make demo         # scan the demo estate through the live API and print the summary
```

---

### 1c. Windows notes (cmd / PowerShell)

**First, get the files.** Download `ecdat-backend-PLAIN.zip` and *Extract All* **into**
`C:\\Users\\saniyaa\\ecdat-backend` (a *flat* archive — no top-level folder, so the files land
directly in `ecdat-backend\\`, not in `ecdat-backend\\ecdat-backend\\`). Check before continuing:

```bat
dir setup_ecdat.py
```

If that says *File Not Found*, the zip was not extracted here (or it was extracted one level
deeper) — fix the extraction before continuing.

Then, in cmd:

```bat
cd /d C:\Users\saniyaa\ecdat-backend
python setup_ecdat.py
```

`source`, `export`, `make` and `#` comments **do not exist in cmd.exe**, and cmd will not run a
batch file from the current directory unless you prefix it — which is why the entry point is
`python setup_ecdat.py` rather than a `.bat`. Two cmd-specific facts worth knowing:

* **cmd cannot activate a virtual environment.** Always call the interpreter by path, e.g.
  `.venv\Scripts\python.exe -m pytest tests/ -q`. `setup_ecdat.py` does this for you.
* **The `Makefile` targets do not work in cmd** (`&&` chains and backslash line continuations are
  POSIX shell syntax). `python setup_ecdat.py test` is the Windows equivalent of `make test`.
* **Paths in the API are always POSIX-style** (`src/main/java/App.java`), on every platform, so a
  Windows scan and a Linux scan of the same tree produce byte-identical CBOMs and the console never
  shows a backslash. Asserted by `test_stored_paths_are_posix_on_every_platform`.

The archive also carries optional `run_windows.bat` / `run_windows.ps1` thin wrappers. If you do
use the `.bat` from cmd it must be invoked as `call .\run_windows.bat`; PowerShell users can run
`powershell -ExecutionPolicy Bypass -File .\run_windows.ps1 [test|demo|setup]`.

## 2. The 60-second demo

```bash
# create a workspace
curl -s -X POST localhost:8000/api/v1/workspaces -H 'X-API-Key: dev-ecdat-key' \
  -H 'Content-Type: application/json' -d '{"slug":"vajra-bank","name":"VAJRA Bank"}'

# scan the demo estate (61 findings in ~0.4 s); wait_seconds>0 blocks and returns 201
SCAN=$(curl -s -X POST 'localhost:8000/api/v1/scans?wait_seconds=120' \
  -H 'X-API-Key: dev-ecdat-key' -H 'Content-Type: application/json' -d '{
    "target_uri": "'"$PWD"'/fixtures/demo_repo",
    "name": "vajra-payments",
    "context": {"exposure":"internet_facing","criticality":"sovereign_critical",
                "classification":"confidential","data_lifetime_years":15},
    "mosca": {"scenario":"baseline"} }' | python3 -c 'import json,sys;print(json.load(sys.stdin)["id"])')

K='X-API-Key: dev-ecdat-key'
curl -s "localhost:8000/api/v1/scans/$SCAN/risk/summary"  -H "$K"   # executive summary
curl -s "localhost:8000/api/v1/scans/$SCAN/coverage"      -H "$K"   # coverage honesty
curl -s "localhost:8000/api/v1/scans/$SCAN/findings?band=critical&limit=5" -H "$K"
curl -s "localhost:8000/api/v1/scans/$SCAN/exports/cbom?spec_version=1.7" -H "$K" -o cbom.json
curl -s -X POST "localhost:8000/api/v1/scans/$SCAN/attestation" -H "$K" \
  -H 'Content-Type: application/json' \
  -d '{"officer_name":"A. Sharma","officer_role":"principal cryptographer"}'
```

Or as one shot: `python -m app.manage demo-scan --api-key dev-ecdat-key`

<details>
<summary>What the demo estate contains (22 files) and what it proves</summary>

| Surface | Detector | What it demonstrates |
|---|---|---|
| `src/payments/signing.py` | Python AST | RSA-2048 + PKCS1v15 signature, AES-128-GCM, SHA-1 digest — resolved from **call expressions and constants**, not string matches |
| `src/main/java/.../PaymentGateway.java` | Java text + cross-line context | `DES/ECB/PKCS5Padding`, `RSA/ECB/OAEPWithSHA-256AndMGF1Padding`, key size 1024 on a different line from the generator call |
| `src/gateway/handler.go` | Go text | `ed25519`, `sha256`, X25519 ECDH |
| `config/sshd_config` | config | `ssh-rsa`, `aes128-ctr`, SHA-1 host keys |
| `certs/*.pem`, `certs/*.der`, `certs/*.p12` | X.509 | serial, issuer, validity, `days_to_expiry`, signature algorithm |
| `certs/weak_leaf.key` | key material | private key detected, **contents never stored** |
| `requirements.txt`, `pom.xml`, `package.json`, `go.mod` | manifests | declared crypto libraries cross-referenced with called APIs |
| `third_party/native/libcrypto_vendor.so` | binary | stripped ELF → `SYMBOL_INFERRED` findings, confidence capped |
| `release/bundle.zip` | container | nested archive expanded, members re-scanned |
| `data/blob.dat` | — | **coverage**: `partial` (binary content in a text-classified file) |
| `README.md` | — | **coverage**: `unsupported` (no detector for `.md`) |

</details>

---

## 3. Measured results (regenerate with `make benchmark`)

Environment: Linux, 2 vCPU, Python 3.13.14, SQLite (WAL), 4 scan workers.

| | |
|---|---|
| Test suite | **95 passed, 0 failed** (30 detector · 25 risk/Mosca · 40 API/contract) |
| API surface | 34 paths / 39 operations, error envelope on every one |
| Demo estate | 22 files → **61 findings in 362 ms**, 39 assets, **coverage 0.983** |
| Bands | critical 16 · high 25 · medium 9 · low 11 |
| Tracks | classical-critical 11 · quantum-critical 17 · PQ adopted 3 · Shor-vulnerable 8 |
| Mosca (X=15, Y=4, Z=10) | `breached`, margin −9.0 y, must start by 2026-09-26 |
| Dense estate (2 200 files) | 6 100 findings in 43.7 s (50.4 files/s, 139.8 findings/s) |
| API p95 on 6 100 findings | findings page 39.5 ms · band filter 50.7 ms · search 47.6 ms · risk summary 138.3 ms |
| Attestation | 61-leaf Merkle root + hash chain + Ed25519 → `verdict: authentic` |
| CBOM | byte-reproducible for identical target bytes (except `metadata.timestamp`); `413 EXPORT_TOO_LARGE` above 5 000 findings |

Scan is **persistence-bound** (68 % of scan time in persist + risk + recommendations); detection
runs at 214 files/s. This is disclosed rather than hidden — see §9 R6 of the design doc.

---

## 4. What the backend does

```
scan  →  detect (source, manifest, config, cert, binary, container, opt-in live TLS)
      →  canonicalise (OID, family, primitive, purpose, size, curve, mode, parameter set)
      →  score twice (classical track | quantum track, each with attributable factors)
      →  apply Mosca (X + Y > Z, three stored Z scenarios, margin + must-start-by)
      →  recommend (purpose-aware FIPS 203/204/205 + RFC 10024 hybrids, effort vs urgency)
      →  account (coverage index, unobserved surfaces, policy-excluded directories)
      →  export (CycloneDX 1.6/1.7 CBOM, SARIF 2.1.0, Markdown, CSV)
      →  attest (Merkle tree + hash chain + Ed25519, verifiable)
```

**Determinism.** Finding ids are content-addressed, the CBOM `serialNumber` is a UUIDv5 of the
target digest, and the Merkle root uses sorted hash pairs. Re-scanning identical bytes reproduces
identical documents — asserted by `test_reports_are_byte_reproducible`.

**No ML in the decision path.** Findings are produced by pure functions over AST/manifest/X.509/
symbol/constant evidence. Each finding carries an `evidence_class` (`PARSED_STRUCTURE`,
`SYMBOL_INFERRED`, `INFERRED`, `PATTERN`) and confidence caps derived from it. An LLM may summarise
a precomputed report as an optional assistant; it can never change a score, a band or a finding.

---

## 5. Configuration

Copy `.env.example` → `.env` (or export the variables). The defaults are a working laptop setup.

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./ecdat.db` | `postgresql+psycopg://…` for cloud — no code change |
| `ECDAT_API_KEYS` | `dev-ecdat-key` | comma-separated; per-client keys supported |
| `ECDAT_RATE_LIMIT_RPM` | `240` | per-key request budget |
| `ECDAT_CORS_ORIGINS` | `*` | set to the frontend origin in production |
| `ECDAT_SCAN_WORKERS` | `4` | detector threads |
| `ECDAT_EXPORT_MAX_FINDINGS` | `5000` | synchronous export bound → `413 EXPORT_TOO_LARGE` |
| `ECDAT_ALLOW_LIVE_PROBE` | `false` | opt-in TLS probing, allow-listed hosts only |
| `ECDAT_SIGNING_KEY_B64` | unset | base64 Ed25519 seed; unset ⇒ dossier records `key_origin: ephemeral_demo` |

---

## 6. Operations

```bash
python -m app.manage init-db                       # create tables (idempotent)
python -m app.manage stamp head                    # hand the schema to Alembic
python -m app.manage upgrade head                  # apply migrations
python -m app.manage revision -m "add foo"         # autogenerate a migration
python -m app.manage stats                         # row counts per table
python -m app.manage backup --out-dir backups      # consistent snapshot (SQLite .backup / pg_dump)
python -m app.manage restore backups/ecdat-*.sqlite3
python -m app.manage demo-scan --api-key dev-ecdat-key
python -m app.manage verify <attestation_id>
python -m pytest tests/ -q                         # 95 tests
python scripts/measure_all.py --api-key dev-ecdat-key   # regenerate docs/measurements.json
python scripts/scale_benchmark.py --copies 100          # throughput measurement
```

**Docker (optional, same code):**

```bash
docker compose --profile sqlite up --build          # API on :8000, SQLite volume
docker compose --profile postgres up --build       # API + PostgreSQL 17
```

---

## 7. Layout

```
app/
  config.py  ids.py  db.py  models.py  registry.py  errors.py  schemas.py  manage.py  main.py
  scanners/  python_ast  source_text  manifests  configs  certs  binaries  containers  tls_live(opt-in)
  services/  scan_runner  risk  mosca  recommend  coverage  attestation  exports  diff  serialize
  api/       routes_scans  routes_analysis  routes_evidence  routes_meta  serializers  deps
tests/       test_detectors.py  test_risk_engine.py  test_api.py  conftest.py   (95 tests)
fixtures/demo_repo/      22-file multi-language demo estate
migrations/              Alembic env + 0001_baseline
scripts/                 measure_all.py  scale_benchmark.py
docs/                    BACKEND_ARCHITECTURE_AND_STRATEGY.md  measurements.json
```

---

<!-- COORDINATION:BEGIN -->
## 🤝 Coordination block (AI #1 backend ⇄ Saniya's AI frontend)

**Backend status:** ✅ P0–P6 complete · 34 paths / 39 operations · 95 tests green · API `1.0.0`
**Contract version:** `openapi.json` @ 2026-09-26 · **0 breaking changes**
**Local base URL:** `http://127.0.0.1:8000/api/v1` · **API key:** `dev-ecdat-key` (header `X-API-Key`)

> **Saniya's AI: start with [`PROMPT_FOR_FRONTEND_AI.md`](PROMPT_FOR_FRONTEND_AI.md)** — it is your
> complete brief (what exists, the API contract, the UI rules that are not negotiable, and your
> definition of done). Your code goes in [`frontend/`](frontend/README.md). Below is the
> long-form version of the same information.

### Backend → frontend (rely on these today)

| Endpoint | Notes for the console |
|---|---|
| `GET /registry` | 38 algorithms, 34 OIDs, 42 libraries, 5 protocol profiles, policy pack — **render names from here, never hardcode** |
| `POST /scans?wait_seconds=0` | `202` + `{id, status:"queued"}`; poll `GET /scans/{id}` or stream `GET /scans/{id}/events` |
| `GET /scans` · `GET /scans/{id}` | status, phase, `progress_pct`, counts, coverage, `error_code` |
| `GET /scans/{id}/findings` | filters `band, quantum_status, evidence_class, purpose, file_path, search`; sort `risk, urgency, path, confidence`; `limit`/`offset` → `{items,total,limit,offset,has_next}` |
| `GET /scans/{id}/findings/{fid}` | `risk.factors[]` = the explainability payload; `asset` = the inventory object |
| `GET /scans/{id}/risk/summary` | `by_band[]{band,count}` · `by_family[]{family,count}` · `by_evidence_class[]{evidence_class,count}` · `tracks{}` · `mosca{}` · `top_risks[]` |
| `GET /scans/{id}/coverage` | **always render** `coverage_index`, `unobserved_pct`, `unobserved_samples[]` |
| `POST /scans/{id}/risk/simulate` | what-if Mosca; body `{"x_years","y_years","z_years","scope"}`; response uses the **same** `state`/`holds`/`margin_years` keys as `risk/summary.mosca` |
| `GET /scans/{id}/recommendations` · `GET /migration/items` | purpose-aware PQC targets; queue supports `PATCH` for owner/wave/status |
| `GET /scans/{id}/data-exposure` | which data classes depend on which crypto, and their Mosca X |
| `GET /scans/{id}/exports/*` | `cbom` (`?spec_version=1.6\|1.7`), `sarif`, `report`, `findings.csv` |
| `GET /health` · `GET /metrics` | public health; Prometheus counters |

### Rules that protect your build

* Error envelope is frozen: `{"error":{"code","message","details"},"timestamp","request_id"}` — branch on `error.code`, never on prose.
* Every response carries `X-Request-Id` and `X-Response-Time-ms`; send your own `X-Request-Id` to correlate.
* List endpoints are always `{items,total,limit,offset,has_next}`.
* Exports are bounded at 5 000 findings per scan → `413 EXPORT_TOO_LARGE`; the console should export the filtered/visible set.

### Open items

* **Backend waiting on frontend:** none.
* **Frontend waiting on backend:** none. Frontend interactive console complete, verified against live API, and serving on http://127.0.0.1:3000.
* **Frontend status:** ✅ Complete · React 18 + Vite + TypeScript · `npm run build` green · 0 breaking API changes requested.
<!-- COORDINATION:END -->
