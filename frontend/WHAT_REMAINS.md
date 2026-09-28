# FRONTEND — What Is Still Needed

**For Saniya's AI.** Read `../PROMPT_FOR_FRONTEND_AI.md` first for the API
contract and the six UX rules. This file is only the remaining work, in
priority order, as of the current commit.

Your code goes in `frontend/`. Do not edit `app/`, `tests/`, or `fixtures/`.

---

## Current state

| | |
|---|---|
| Views | 9 built and working (ScanLauncher, ExecutiveDashboard, FindingsExplorer, FindingDetailDrawer, MigrationPlan, MoscaSimulator, RegistryView, ScanDiffView, CertificatesView, EvidenceAndExport) |
| Build | `npm run build` green, `tsc --noEmit` clean |
| API calls | All 25 endpoints verified against a live server — every one returns 200 |
| Fixed | `top_risks` shape, registry array counts, hardcoded OID total, Merkle leaf label, `key_origin` banner |

**The console works.** What follows is what makes it *win*.

---

## P0 — Blocks a credible demo

### 1. Render the accuracy numbers

The backend now publishes measured precision/recall against three real-world
projects it did not author:

| Corpus | Language | Precision | Recall |
|---|---|---|---|
| PyJWT 2.8.0 | Python | 0.818 | 0.600 |
| golang-jwt/jwt v5 | Go | 1.000 | 1.000 |
| auth0/java-jwt | Java | 1.000 | 0.889 |

Do **not** hardcode these. Fetch them. Either add a small endpoint that serves
`docs/accuracy_report.json`, or read the file at build time and inject it. A
number that changes on the backend must change on the screen.

Suggested placement: a "Validation" panel on `ExecutiveDashboard`, below the
coverage meter. Per-corpus precision/recall bars, and a line naming what the
numbers do *not* cover (one project per language, no binary or certificate
corpus).

**Why this matters more than any other item.** Every competing team will claim
complete inventory coverage. Ours is the only one that can say "we measured
0.931 precision across 27 hand-labelled files from code we didn't write, and
here are the six families we still miss." Put that on screen.

### 2. Show the evidence class on every finding row

`evidence_class` is on each finding: `PARSED_STRUCTURE`, `SYMBOL_INFERRED`,
`INFERRED`, `PATTERN`. You render it in the drawer — surface it in the findings
table too, as a compact badge.

A `PATTERN` finding can never be critical. The badge is how a reviewer knows the
tool is being honest about its own certainty.

### 3. Surface the declaration tier explicitly

`detector_id` is now `scanner.declarations` for findings that come from
configuration surfaces rather than call sites (a JOSE algorithm table, a
`ClassVar` hash binding, a JCA provider string). These are `INFERRED`, not
parsed.

Render them distinctly. In the findings explorer, a filter chip
"declared vs called" would let a reviewer ask "what does this tool find in
code that never calls a primitive?" — which is the question that separates this
project from an AST scanner.

---

## P1 — Makes the demo land

### 4. Scan-launcher: three real targets, not one

Right now the demo scans the synthetic estate. Add a target picker with the
real corpora already in the repo:

- `fixtures/pyjwt_repo` → 107 findings, Python
- `fixtures/golang_jwt_repo` → 61 findings, Go
- `fixtures/java_jwt_repo` → 110 findings, Java

Scanning all three in sequence is a far stronger demo than one synthetic
estate, and it is the proof behind the multi-language claim. Show the resulting
totals side by side.

### 5. Scan-over-scan diff across languages

`GET /scans/{id}/diff?against={other_id}` already exists. The compelling demo:
scan the same project before and after a hypothetical migration, or scan PyJWT
and java-jwt and show that RSA-PSS and EdDSA are correctly separated from
PKCS#1 v1.5 in both.

### 6. Evidence drawer: show *why* the tool believes a declaration

For `scanner.declarations` findings the `extra.declaration` field explains the
reasoning — e.g. `declared in algorithm registry (RS256, RS384, RS512)`.
Display it. This is the explainability story for the feature that
distinguishes us, and right now it is being thrown away.

### 7. Export buttons must reflect the real bounds

Exports are capped at 5,000 findings and return `413 EXPORT_TOO_LARGE` beyond
that. The UI should export the *filtered* set the user is looking at, and show
the finding count next to each export button. Do not let a user click export on
a 6,100-finding scan and get an error.

---

## P2 — Depth

### 8. Binary and certificate panels

`CertificatesView` exists. Make sure it renders `days_to_expiry` and flags
anything already expired — the demo estate has a deliberately expired leaf.

### 9. Data-exposure matrix

`GET /scans/{id}/data-exposure` maps data classes to the crypto they depend on
and the Mosca `X` for each. A small matrix visualising this is the clearest
possible answer to "what does quantum risk actually mean for my data?"

### 10. Registry view: show purpose and quantum status per algorithm

`GET /registry` returns 38 algorithms with `family`, `purpose`,
`quantum_status`, `classical_bits`, `quantum_bits`, `is_post_quantum`, and
`replacement_hint`. Render the PQC replacements inline — an auditor's first
question about an algorithm is "what do I migrate to?"

---

## Rules that still apply

- **The UI computes nothing.** No risk arithmetic, no band thresholds, no Mosca
  maths, no algorithm classification in JavaScript.
- **Never say "quantum-safe."** The strongest allowed claim is *"No vulnerable
  artefacts detected **within the scanned scope**"*, always beside the coverage
  index.
- **Every score shows its `risk.factors[]`.**
- **Algorithm names come from `GET /registry`**, never hardcoded.
- **The API is append-only.** Need a field that doesn't exist? Say so before
  writing the screen; the backend agent adds it as a `contract(api):` commit.

---

## Definition of done

- [ ] Accuracy numbers are fetched, not hardcoded, and update when the backend
      changes
- [ ] `evidence_class` visible on every findings row
- [ ] A declared-vs-called filter exists
- [ ] The demo scans all three real corpora
- [ ] `extra.declaration` reasoning is displayed
- [ ] Export shows the finding count and handles the 5,000 cap
- [ ] Commits follow the format in `COORDINATION.md`
- [ ] No API change was needed to make any of the above work — if one was,
      that was flagged to the backend agent *first*
