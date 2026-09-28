# Real-World Open-Source Scan Audit: PyJWT Authentication

**Target Repository:** `PyJWT` (Open-Source Authentication Library)  
**Evaluated by:** ECDAT Engine v1.0.0 (SIH PS 26164 · NTRO)  
**Scan Status:** `completed` in 3569 ms  
**Coverage Index:** `0.8195`  

---

## 1. Discovered Cryptographic Inventory

| Finding ID | Algorithm | File Location | Band | Quantum Status | Evidence Class |
|---|---|---|---|---|---|
| `f_98266fe94c` | **JWT-ALG-NONE** | `tests/test_jwt.py:17` | `critical` | `unknown` | `AST_RESOLVED` |
| `f_f453aeb415` | **TLSv1.2** | `tests/test_jwks_client.py:798` | `critical` | `shor_vulnerable` | `AST_RESOLVED` |
| `f_0a557e22f1` | **TLSv1.3** | `tests/test_jwks_client.py:793` | `critical` | `symmetric_safe` | `AST_RESOLVED` |
| `f_5a540a0569` | **TLSv1.2** | `tests/test_jwks_client.py:771` | `high` | `shor_vulnerable` | `AST_UNRESOLVED` |
| `f_959cf40f5e` | **JWT-ALG-NONE** | `tests/test_api_jwt.py:1195` | `critical` | `unknown` | `AST_RESOLVED` |
| `f_f38bd42b94` | **JWT-ALG-NONE** | `tests/test_api_jwt.py:1144` | `critical` | `unknown` | `AST_RESOLVED` |
| `f_c03907b9cf` | **JWT-ALG-NONE** | `tests/test_api_jwt.py:1131` | `critical` | `unknown` | `AST_RESOLVED` |
| `f_24924f6903` | **JWT-ALG-NONE** | `tests/test_api_jwt.py:1121` | `critical` | `unknown` | `AST_RESOLVED` |
| `f_6c274bf555` | **JWT-ALG-NONE** | `tests/test_api_jwt.py:1111` | `critical` | `unknown` | `AST_RESOLVED` |
| `f_86998b74dd` | **JWT-ALG-NONE** | `tests/test_api_jwt.py:1100` | `critical` | `unknown` | `AST_RESOLVED` |
| `f_c6432e4fa8` | **JWT-ALG-NONE** | `tests/test_api_jwt.py:1089` | `critical` | `unknown` | `AST_RESOLVED` |
| `f_48b2369c56` | **JWT-ALG-NONE** | `tests/test_api_jwt.py:1077` | `critical` | `unknown` | `AST_RESOLVED` |
| `f_d4c4278282` | **JWT-ALG-NONE** | `tests/test_api_jwt.py:1068` | `critical` | `unknown` | `AST_RESOLVED` |
| `f_0497efab5c` | **JWT-ALG-NONE** | `tests/test_api_jwt.py:1056` | `critical` | `unknown` | `AST_RESOLVED` |
| `f_d6c1864716` | **JWT-ALG-NONE** | `tests/test_api_jwt.py:1047` | `critical` | `unknown` | `AST_RESOLVED` |

---

## 2. Mosca Quantum Horizon Evaluation
- **Data Confidentiality Shelf-Life (X):** 10.0 years
- **Engineering Migration Duration (Y):** 4.0 years
- **Quantum Threat Arrival (Z):** 10.0 years
- **Verdict:** **BREACHED** (Margin: `-4.0y`, Must start by `2026-09-29`)

---

## 3. CycloneDX CBOM Verification
Exported deterministically to `docs/real_world_scan/cbom_1.7.json` conforming to CycloneDX 1.7 Cryptographic Bill of Materials specification.
