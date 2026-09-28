# frontend/ — ECDAT Interactive Cryptographic Console

The interactive GUI platform for **SIH PS 26164 (ECDAT), National Technical Research Organisation**.
Visualises discovery scans, dual-track risks, Mosca inequality simulations, and PQC migration roadmaps.

## 1. Quick Start

Ensure the backend is serving on `http://127.0.0.1:8000`:
```bash
# In repo root:
python setup_ecdat.py
```

Then run the frontend console:
```bash
cd frontend
npm install
npm run dev      # serves interactive GUI on http://127.0.0.1:3000
npm run build    # produces typed, production-ready bundle in dist/
```

- **Frontend Console:** <http://127.0.0.1:3000>
- **Backend API:** <http://127.0.0.1:8000/api/v1>
- **API Key:** `dev-ecdat-key` (header: `X-API-Key`)

---

## 2. Built Views & Screens

| Screen | Target Endpoints | Non-Negotiable UX Guarantees |
|---|---|---|
| **Scan Launcher** | `POST /scans` (wait_seconds support), `POST /uploads`, `GET /events` | Target path/upload, context form (exposure, criticality, classification, data lifetime), Mosca horizon selector, real-time progress stream. |
| **Executive Dashboard** | `GET /scans/{id}/risk/summary`, `GET /scans/{id}/coverage` | Dual-track classical ∥ quantum risk bars (Rule 6.3), Mosca status with must-start-by date, top risks table, **Honest Coverage Banner with unobserved samples** (Rule 6.1 & 6.4). |
| **Findings Explorer** | `GET /scans/{id}/findings`, `GET /scans/{id}/findings/{fid}` | Multi-parameter filters (`band`, `quantum_status`, `evidence_class`, `purpose`, `search`, `sort`, `order`, `limit`, `offset`), paginated table, **Finding Detail Drawer with full `risk.factors[]` attribution** (Rule 6.2) and redacted code snippets (Rule 6.5). |
| **Mosca Simulator** | `POST /scans/{id}/risk/simulate` | Interactive X, Y, Z what-if sliders and preset horizons. Evaluated 100% server-side (Rule 1). Displays margin, must-start-by, affected findings/assets, and exposed file paths. |
| **Migration Plan** | `GET /scans/{id}/recommendations`, `GET /migration/items`, `PATCH /migration/items/{id}` | Groupings by target standard (FIPS 203, FIPS 204, FIPS 205, RFC 10024). Editable migration queue with status, owner, wave, and engineering notes. |
| **Evidence & Exports** | `GET /scans/{id}/exports/*`, `POST /scans/{id}/attestation`, `GET /attestations/{id}/verify` | Deterministic CycloneDX CBOM (1.6 / 1.7), SARIF 2.1.0, Markdown security report, and CSV downloads. Ed25519-signed Merkle forensic dossier generation & real-time verification (Rule 6.6). |
| **Certificates View** | `GET /scans/{id}/certificates` | Parsed X.509 certificate inventory, validity windows, issuer/subject, and days to expiry. |
| **Algorithm Registry** | `GET /registry` | Authoritative 38-algorithm knowledge base, OID table, and policy pack (Rule 5.7). |
| **Scan Diff** | `GET /scans/{id}/diff?against={other_id}` | Scan-over-scan drift comparison (added, removed, and changed findings). |

---

## 3. Strict Contract & Architectural Rules Honoured

1. **Rule 1 (Server-Side Computation):** Zero client-side risk arithmetic, band thresholding, or Mosca mathematics. All data and scores are computed server-side.
2. **Rule 5.1 (Frozen Error Envelope):** All errors branch on `error.code` (`NOT_FOUND`, `UNAUTHORIZED`, `INVALID_INPUT`, etc.) with user-friendly recovery screens; never a blank page.
3. **Rule 5.4 (Band Vocabulary & Hex Ramp):** Critical `#b4232c`, High `#d97706`, Medium `#2563eb`, Low `#64748b`, Informational `#94a3b8`.
4. **Rule 5.5 (Evidence Classes & Caps):** Badges for `PARSED_STRUCTURE`, `SYMBOL_INFERRED`, `INFERRED`, `PATTERN` with clear `capped_by_confidence` warnings.
5. **Rule 5.7 (Registry Dynamic Naming):** Algorithm details dynamically resolved from `GET /registry`.
6. **Rule 6.1 ("Quantum-Safe" Vocabulary):** Never states "quantum-safe". Displays *"No vulnerable artefacts detected within the scanned scope"* alongside the coverage index.
7. **Rule 6.2 (Attribution Factors):** Every score renders its contributing factors from `risk.factors[]` (rule_id, delta, track, factor_value, evidence).
8. **Rule 6.3 (Dual Track Bars):** Classical and quantum tracks rendered as separate bars with distinct horizons and owners.
9. **Rule 6.4 (Name the Unobserved):** `coverage.unobserved_samples[]` displayed prominently with path, kind, state, and reason.
10. **Rule 6.5 (Evidence & Redaction):** Displays `file_path:line_start`, `detector_id`, and server-redacted snippet.
11. **Rule 6.6 (Key Origin):** Acknowledges `key_origin: ephemeral_demo` in forensic attestation panel.

---

## 4. Verification

- `npm run build`: ✅ Clean build (0 TypeScript errors)
- `python setup_ecdat.py test`: ✅ 95 automated backend tests green
- Live Demo Oracle: ✅ 61 findings, 39 assets, coverage index 0.983, Mosca breached (-9.0y margin) verified on `http://127.0.0.1:3000`.
