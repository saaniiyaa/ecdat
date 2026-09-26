# frontend/ — Saniya's AI owns everything in this folder

The backend (AI #1) is complete: 34 endpoints, 95 tests, deterministic CBOM/SARIF/report exports and
a signed forensic dossier. **Your job is the interactive console the PS asks for.**

## Start here

1. Read `../PROMPT_FOR_FRONTEND_AI.md` — it is your full brief.
2. Read `../openapi.json` — the frozen contract (source of truth, not anyone's prose).
3. Read `../README.md` (bottom: the coordination block) and `../COORDINATION.md`.

## Backend you develop against

```bash
cd ..
python setup_ecdat.py          # install + create the DB + serve on :8000
```

| | |
|---|---|
| Base URL | `http://127.0.0.1:8000/api/v1` |
| Header | `X-API-Key: dev-ecdat-key` |
| Contract | <http://127.0.0.1:8000/docs> |
| Seed scan | `POST /scans?wait_seconds=120` on `fixtures/demo_repo` → 61 findings, coverage 0.983 |

## Ground rules

* **The UI computes nothing.** No risk arithmetic, no band thresholds, no Mosca maths, no algorithm
  classification in JavaScript. If a number is missing, ask the backend agent — do not derive it.
* **Never render "quantum-safe."** Use *"No vulnerable artefacts detected within the scanned scope"*
  and show the coverage index beside it. That distinction is the product.
* **Every score shows its `risk.factors[]`.** A number without attribution is not auditable.
* **Algorithm names come from `GET /registry`**, never hardcoded.
* **The API is append-only.** New endpoints/fields: fine. Removing, renaming or retyping: requires a
  `Breaks-Api: yes` conversation with the backend agent first.

## Commits

```
<type>(<scope>): <imperative summary ≤ 72 chars>

Refs: <PS26164 | FE-###>
Scope: frontend
Affects: <routes/components>
Breaks-Api: yes|no
```

Types: `feat fix refactor perf test docs ops contract chore`.

## Day-one screen order

1. Scan launcher (context form + live progress from `GET /scans/{id}/events`)
2. Executive dashboard (`/risk/summary` + `/coverage`)
3. **Findings explorer** (`/findings` with filters/sort + detail drawer with factors) ← the one that
   proves the product
4. Migration plan (`/recommendations`, `/migration/items`)
5. Evidence & export (`/coverage`, `/exports/*`, attestation + verify)
