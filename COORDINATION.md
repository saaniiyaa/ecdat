# Coordination Protocol — AI #1 (Backend) ⇄ Saniya's AI (Frontend)

Two engineers, one repository, one contract. This file is the working agreement; the normative
version is §8 of [`docs/BACKEND_ARCHITECTURE_AND_STRATEGY.md`](docs/BACKEND_ARCHITECTURE_AND_STRATEGY.md).

## 1. Ownership

| Path | Owner | Rule |
|------|-------|------|
| `app/**`, `tests/**`, `fixtures/**`, `migrations/**`, `scripts/**`, `Dockerfile`, `docker-compose.yml`, `Makefile`, `alembic.ini`, `requirements.txt` | **AI #1 — backend** | Do not edit from the frontend side |
| `frontend/**` | **Saniya's AI — frontend** | Do not edit from the backend side |
| `openapi.json` | **backend generates, both review** | Committed; a diff here is an API change |
| `README.md` (coordination block only), `COORDINATION.md` | **both** | Small, merged, announced in the commit |
| `docs/BACKEND_ARCHITECTURE_AND_STRATEGY.md` | **backend** | Architecture changes only |

## 2. Branching and merging

```
main                    protected, always green (pytest runs on every push)
feat/contract-<slug>    short-lived, squash-merged into main
fix/<issue>-<slug>      short-lived, squash-merged into main
```

* Trunk-based. No long-lived `develop` branch; with two engineers the merge overhead costs more
  than it saves.
* No force-push to `main`. A bad commit is reverted by a revert commit.
* Squash-merge title **is** the commit message from §3.

## 3. Commit format

```
<type>(<scope>): <imperative summary, ≤ 72 chars>

Refs: <PS26164 | BE-### | FE-###>
Scope: backend | frontend | contract | ops | docs
Affects: <API paths or modules touched, or "none">
Breaks-Api: yes|no
```

Types: `feat fix refactor perf test docs ops contract chore`

Real examples from the backend history:

```
feat(detectors): resolve cipher and key-size constants from the Python AST
Refs: BE-014 | Scope: backend | Affects: app/scanners/python_ast.py | Breaks-Api: no

fix(db): index risk_assessments.finding_id and rewire the findings page to a two-phase read
Refs: BE-031 | Scope: backend | Affects: app/models.py, app/api/routes_analysis.py | Breaks-Api: no

contract(api): declare the error envelope and correlation headers on every operation
Refs: FE-002 | Scope: contract | Affects: app/main.py, openapi.json | Breaks-Api: no

perf(api): bound synchronous exports with 413 EXPORT_TOO_LARGE
Refs: BE-036 | Scope: backend | Affects: app/api/routes_evidence.py | Breaks-Api: no
```

## 4. API compatibility policy (the rule that protects the frontend)

1. **Append-only.** New fields and new endpoints are fine. Removing, renaming or retyping a field
   requires a new engine major version and a `Breaks-Api: yes` commit.
2. **The committed `openapi.json` is the contract.** If the running code and the file disagree, the
   file plus a test wins; the code is corrected in the same change.
3. **Frozen error envelope:** `{"error":{"code","message","details"},"timestamp","request_id"}`.
   The frontend branches on `error.code` (10 documented values) and never parses prose.
4. **Frozen list envelope:** `{items,total,limit,offset,has_next}`.
5. **Correlation:** the server accepts and always returns `X-Request-Id`; it also returns
   `X-Response-Time-ms`.
6. **Algorithm names come from `GET /registry`.** If the UI hardcodes "RSA-2048" it will drift from
   the registry and from the policy pack.

## 5. Handoff ritual (4 minutes, per change)

| Step | Who | Action |
|------|-----|--------|
| 1 | backend | merge `contract(api):` → regenerate `openapi.json` (`make openapi`) → add two lines to the README coordination block |
| 2 | frontend | re-read `openapi.json`, implement against it, reply in the block |
| 3 | either | if a shape is missing, open a `contract(api):` commit **before** writing UI code |
| 4 | both | demo notes are assembled from the `Refs:` lines — no separate changelog to drift |

## 6. Definition of done (either side)

- [ ] `make test` green (backend) / `npm run build` green (frontend)
- [ ] new/changed endpoints documented in `openapi.json`
- [ ] coordination block updated if the other side needs to act
- [ ] no generated state committed (`*.db`, `backups/`, `.env`, `uploads/`)
- [ ] commit message follows §3 and states `Breaks-Api`

## 7. When the two sides disagree

1. The disagreement is about **shape** → decide in `openapi.json` first, code second.
2. The disagreement is about **priority** → the PS clause wins (catalogue → risk → classify →
   recommend), then the demo path, then everything else.
3. The disagreement is about **a number on screen** → the measured value in
   `docs/measurements.json` wins; if it is missing, measure it, do not estimate it.
4. Anything unresolved after 15 minutes goes in the coordination block as an open item and work
   continues on the other side of it.
