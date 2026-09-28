# ECDAT Cryptographic Detection Accuracy & Precision/Recall Benchmark

**SIH PS 26164 · National Technical Research Organisation**
Deterministic benchmark measuring precision, recall, false-positive resistance, and F1-score across all 6 discovery tiers.

## 1. Executive Benchmark Summary

| Metric | Measured Score | Interpretation |
|---|---|---|
| **Precision** | **100.0%** | Of all detected cryptographic findings, 100.0% are authentic confirmed algorithms (low false-positive rate). |
| **Recall** | **100.0%** | Detected 100.0% of all ground-truth cryptographic assets in the estate. |
| **F1-Score** | **1.0000** | Harmonic mean of precision and recall. |
| **Overall Accuracy** | **100.0%** | Overall correct classifications across positive and negative controls. |
| **Negative Control Specificity** | **100.0%** | Zero false positives on clean mathematical code (`clean_math.py`), documentation (`README.md`), and raw binary (`blob.dat`). |

---

## 2. Confusion Matrix

```
                    Actual Positive    Actual Negative
Predicted Positive      TP = 54            FP = 0   
Predicted Negative      FN = 0             TN = 3   
```

---

## 3. Tier-by-Tier Detection Performance

| Ingest Tier / Detector | TP | FP | FN | TN | Precision | Recall | F1 Score | Evidence Class |
|---|---|---|---|---|---|---|---|---|
| `scanner.binary` | 8 | 0 | 0 | 1 | **1.000** | **1.000** | **1.000** | `SYMBOL_INFERRED` |
| `scanner.certificates` | 10 | 0 | 0 | 0 | **1.000** | **1.000** | **1.000** | `PARSED_STRUCTURE` |
| `scanner.config` | 15 | 0 | 0 | 0 | **1.000** | **1.000** | **1.000** | `PATTERN` |
| `scanner.manifest` | 8 | 0 | 0 | 0 | **1.000** | **1.000** | **1.000** | `DECLARED_ONLY` |
| `scanner.python_ast` | 9 | 0 | 0 | 1 | **1.000** | **1.000** | **1.000** | `AST_RESOLVED` |
| `scanner.source_text` | 4 | 0 | 0 | 0 | **1.000** | **1.000** | **1.000** | `PATTERN` |
| `scanner.unsupported` | 0 | 0 | 0 | 1 | **1.000** | **1.000** | **1.000** | `SYMBOL_INFERRED` |

---

## 4. Why Zero False-Positives Matter in Cryptographic Auditing

1. **Prose Isolation (AST over Regex):** A comment or docstring mentioning `"AES-256"` or `"hashlib.md5"` is not flagged as a vulnerability. ECDAT's Python AST scanner resolves live call expressions and constant assignments, eliminating keyword hallucinations.
2. **Evidence Class Ceilings:** Pattern-matched findings (`PATTERN` at 0.50 confidence) are strictly capped below critical severity to ensure analysts are never woken up by speculative hits.
3. **Coverage Honesty:** Unobserved or unsupported surfaces (`README.md`, unparseable binary blobs) are never marked as quantum-safe; they are explicitly registered in `coverage.unobserved_samples[]`.

---

## 5. Evaluation Methodology

- **Ground-Truth Corpus:** 22-file multi-language estate (`fixtures/demo_repo`) containing hand-verified cryptographic calls across Python, Java, Go, C/C++ ELF binaries, X.509 certs, SSH/Nginx/IPSec configs, and dependency manifests.
- **Negative Controls:** Dedicated clean files without cryptographic operations (`app/clean_math.py`, `data/blob.dat`, `README.md`) evaluated to verify zero false positives on benign codebases.
- **Automated Verification:** Reproducible via `python scripts/accuracy.py`.
