# PHASE 1 — CLOSED. Where things stand, and where to pick up.

**State at close:** `b0ee3eb`, working tree clean, all four gates green.

This file exists so tomorrow starts from facts rather than from scrollback.

---

## 1. What is done and verified

| | |
|---|---|
| Backend suite | **148 passed**, 1 warning |
| Accuracy gate (3 hand-labelled corpora) | passed — P=0.931, R=0.794 |
| Claim check (prose vs measurement) | passed |
| Frontend typecheck + build | clean, green |
| Git | clean tree, 4 commits, tagged |

The accuracy gate is verified by sabotage, not just written: disabling the
JOSE declaration tier drops aggregate recall 0.794 → 0.706 and the gate exits 1.

## 2. The four commits

| Commit | What |
|---|---|
| `b06b42f` | Accuracy gate, claim checker, baseline, JWK tier, source context |
| `6bba465` | `contract(api):` — `FindingOut.extra`, `GET /accuracy`, export cap, `days_to_expiry` |
| `16d54bb` | `feat(frontend):` — accuracy panel, declaration badges, real-corpus scans, export bounds |
| `b0ee3eb` | CI gating of claims + honest record of what is still unbuilt |

## 3. The three things most likely to be questioned

**Why the declared-vs-called badge ignores `detector_id`.** The brief said to
key it off `detector_id === "scanner.declarations"`. That is the *Python* AST
scanner, so every Java JCA literal and Go `crypto.SHA256` binding would have
gone unbadged and the filter would have silently shown nothing for two of three
supported languages — reading as a finding rather than a bug. It keys off
`extra.declaration` instead, which the server sets for any inference rather
than observation, in any language.

**Why `source_context` is a weight and not a filter.** A test that pins AES-128
is a real occurrence but not a production exposure. Hiding it would be
dishonest; ranking it beside shipped code trains people to ignore the list. So
it is labelled and downweighted (rule M-012), and `tests/test_jwk_and_context.py`
asserts that both branches are still fully assessed.

**Why the fixture regression is not counted as evidence.** We wrote both the
fixture and the expectations, so it can only catch self-inconsistency. The
console says so on screen, in those words.

## 4. Open work, in the order I would take it

1. **Windows setup instructions** — numbered, one command at a time, from
   unpacking the bundle to the console in a browser. Unwritten. This blocks
   anyone else picking the project up.
2. **Server-side filters for `declared`/`called` and `source_context`.** Both
   are client-side today, so they filter the visible page rather than the scan.
   The UI says so; it is still a shortfall. Needs a `contract(api):` commit.
3. **P2.9 data-exposure matrix** — `GET /scans/{id}/data-exposure` is a flat
   list. A data-class → crypto → Mosca `X` matrix is the clearest answer to
   "what does quantum risk mean for my data".
4. **P2.10 registry PQC hints** — `replacement_hint` not rendered inline per row.
5. **Frontend test runner** — none exists. Typecheck and build are the only
   automated checks on the UI.
6. **A binary corpus** — the only evidence tier with no independent measurement.

## 5. Deliberate precision trades — do not "fix" these without measuring

Both are recorded in `docs/accuracy_report.json` → `known_detector_gaps`, and
removing them lowers measured precision:

- **Import blocks are not declarations.** A guarded `cryptography`/`openssl`
  import names a family but constructs nothing.
- **Python recall is 0.600 and that is the honest number.** The six missed
  families are listed with reasons. Raising recall by relabelling the
  expectations would be cheating, and the gate is built to catch it.

## 6. Reproduce every published number

```
python -m pytest tests/ -q
python scripts/accuracy_gate.py
python scripts/check_claims.py
cd frontend && npm install && npx tsc --noEmit && npm run build
```

`accuracy_gate.py` needs a running API (`ECDAT_BASE_URL`). `--update` re-records
the baseline and is a deliberate act, not a way to make CI green.
