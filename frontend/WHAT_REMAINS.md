# FRONTEND — What Is Still Needed

**Status as of commit `16d54bb`.** The P0 and P1 items below are implemented.
This file now records what was done, what it cost in API surface, and what is
genuinely still open. The original brief follows in the archive at the bottom.

## Implemented

| Item | Where | Note |
|---|---|---|
| Accuracy numbers fetched, not hardcoded | `components/common/AccuracyPanel.tsx` | Reads `GET /api/v1/accuracy`; renders per-corpus precision/recall, the aggregate, the coverage limits, and the known gaps |
| Evidence class on every row | `views/FindingsExplorer.tsx` | Was already present; now joined by the Declared and Test/fixture badges |
| Declared-vs-called filter | `views/FindingsExplorer.tsx` | Keyed off the server's reasoning string, **not** `detector_id` — see below |
| All three real corpora scannable | `components/scan/RealCorpusPanel.tsx` | PyJWT, golang-jwt, java-jwt, with per-corpus totals |
| `extra.declaration` reasoning displayed | `components/findings/FindingDetailDrawer.tsx` | Rendered verbatim; the UI does not reword the detector |
| Export count and real cap | `views/EvidenceAndExport.tsx` | Cap fetched from `/version`, buttons disable rather than returning 413 |
| Certificate expiry | `views/CertificatesView.tsx` | Server-computed `days_to_expiry`, expired and expiring-soon called out separately |
| Cross-language comparison | `views/ScanDiffView.tsx` | Labels drift vs cross-language, and shows families both languages agree on |

### The one thing worth reading twice

The declared-vs-called filter was specified to key off
`detector_id == "scanner.declarations"`. Implemented that way it would have
been **quietly wrong**: that detector is the Python-AST scanner, so every Java
JCA provider string and every Go `crypto.SHA256` binding would have gone
unbadged, and the filter would have returned "nothing to find" for two of the
three supported languages — which reads as a finding rather than as a bug.

The badge now keys off `extra.declaration`, which the server sets wherever a
detector is *inferring* rather than observing an invocation, regardless of
language. Measured across the three corpora:

| Corpus | Total findings | Declaration-shaped | Missing context |
|---|---|---|---|
| PyJWT | 157 | 84 | 0 |
| golang-jwt/jwt v5 | 61 | 12 | 0 |
| auth0/java-jwt | 110 | 47 | 0 |

## API surface this required

Three additive changes, committed as `6bba465` before the frontend work, as
`COORDINATION.md` requires:

1. `FindingOut.extra` — the detector's `extra` payload was written to the
   database and then dropped by the serializer. `declaration` never reached a
   client, which was the entire explainability story for the tier.
2. `GET /api/v1/accuracy` — serves `docs/accuracy_report.json` verbatim.
3. `VersionOut.export_max_findings` and `CertificateOut.days_to_expiry` —
   deployment-configured and date arithmetic, so the browser does neither.

## Still open

- **P2.9 Data-exposure matrix.** `GET /scans/{id}/data-exposure` is rendered as
  a flat list. A matrix of data class → crypto dependency → Mosca `X` would
  answer "what does quantum risk mean for my data" more directly. Not built.
- **P2.10 Registry view depth.** Purpose and quantum status are shown; the
  PQC `replacement_hint` is not rendered inline per row.
- **The declared-vs-called filter is client-side.** The API has no parameter for
  it, so it filters the current page and the UI says so. A server-side
  parameter would make it honest across the whole scan.
- **Source-context filter is likewise client-side**, for the same reason.
- **No frontend tests.** There is no test runner in `package.json`. The
  typechecker and the build are the only automated checks on this side, and
  both are wired into CI.

---

<details>
<summary>Original brief (archived)</summary>

## Current state at the time of writing

| | |
|---|---|
| Views | 9 built and working |
| Build | `npm run build` green, `tsc --noEmit` clean |
| API calls | All 25 endpoints verified against a live server |

## P0

1. Render the accuracy numbers — **done**, see above.
2. Show the evidence class on every finding row — **done**.
3. Surface the declaration tier explicitly — **done**.

## P1

4. Scan-launcher: three real targets, not one — **done**.
5. Scan-over-scan diff across languages — **done**.
6. Evidence drawer: show why the tool believes a declaration — **done**.
7. Export buttons must reflect the real bounds — **done**.

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

</details>
