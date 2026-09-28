# ECDAT Detection Accuracy

**SIH PS 26164 · National Technical Research Organisation**

Measured precision and recall against a hand-labelled corpus, plus a regression
check on our own fixtures. The two numbers are reported separately because they
mean different things, and conflating them would be the single easiest way to
misrepresent this project.

Reproduce with:

```bash
python setup_ecdat.py                 # terminal 1 - API on :8000
python scripts/accuracy_real.py       # terminal 2
```

---

## 1. Summary

| Corpus | Precision | Recall | F1 | What it establishes |
|---|---|---|---|---|
| **PyJWT 2.8.0** (independent) | **0.667** | **0.154** | **0.250** | How the engine actually behaves on code it was not written against |
| **demo_repo** (self-authored) | *n/a* | *n/a* | 1.00 agreement | That the detectors still match our own labels — a regression check, nothing more |

**Headline finding: recall is poor on real-world code.** We detect 2 of 13
independently-labelled cryptographic surfaces in PyJWT's shipped library, and we
raise one false positive. That is the honest result, and it is more useful than a
flattering one because it tells us exactly where to work.

---

## 2. Why there are two numbers

A precision/recall figure is only meaningful if the labels were not written by
the same author as the code being measured.

Our 22-file demo estate is authored by this project. The detectors are authored
by this project. Agreement between them proves **internal consistency** and
nothing whatsoever about correctness on code we did not write. Scoring that as
"100% accuracy" is a category error.

The independent corpus is PyJWT 2.8.0's shipped library source, labelled by
manual line-by-line review in `fixtures/pyjwt_repo/GROUND_TRUTH.json`. Those
labels were written by reading the source, not by reading ECDAT's output.

An earlier version of this document reported 100% precision and 100% recall
from the fixture corpus alone. Those figures were not wrong arithmetically, but
they measured the wrong thing, and a reader who understood the methodology would
have been right to reject them.

---

## 3. Independent corpus: PyJWT 2.8.0

**Method:** manual review of all 8 modules in `jwt/`.
**Findings in scan:** 223 total, of which 5 are in shipped code and 218 are in
`tests/`.

### Confusion matrix

```
                     Expected Present    Expected Absent
Detected                TP = 2              FP = 1
Not detected            FN = 11             TN = 5
```

| Metric | Value |
|---|---|
| Precision | 0.667 (2 TP / 3 predictions) |
| Recall | 0.154 (2 TP / 13 expected) |
| F1 | 0.250 |

### The one false positive

`jwt/api_jws.py:358` — reported as `JWT-ALG-NONE`, critical.

The line is `jwt = jwt.encode("utf-8")`. That is Python's `str.encode` method
performing UTF-8 text encoding. The AST detector resolved a real call
expression, correctly, and then mapped `encode` onto a cryptographic algorithm
name. A comment-free AST match is not automatically a cryptographic finding;
this is the failure mode where parse-level certainty is mistaken for semantic
certainty.

### The eleven misses, all in `algorithms.py`

| Location | Missed | Why |
|---|---|---|
| `:156-158` | RS256/RS384/RS512 | Constructed as class instances; the RSA constructor and hash selection are not adjacent to a bindable call |
| `:320,322` | `hashlib.sha256` / `sha512` | Bound to a `ClassVar`, not called in place |
| `:66-69` | `rsa_crt_dmp1/dmq1/iqmp`, `rsa_recover_prime_factors` | CRT parameters inside a guarded optional-dependency import |
| — | ECDH / EC families | Declared in the registry block, never constructed as call sites |

**Root cause:** our detectors find *invocations*. Real libraries frequently
declare their cryptographic surface as **configuration** — a registry mapping
`"RS256" → RSAAlgorithm(SHA256)`, a class attribute, a constant in a table.
Nothing in the code calls "RS256"; something references it. This is the single
largest class of recall gap and the highest-value fix available.

### What the corpus does not cover

Stated plainly so the numbers are not read as broader than they are:

- One project, one language, 8 files, ~4,000 lines of shipped code.
- Findings are dominated by optional-dependency import blocks.
- No Go, Java, C/C++ or binary corpus has been independently labelled.
- The 218 `tests/` findings are excluded from scoring. They are largely
  PyJWT's own deliberate `alg:none` downgrade test cases — **not** live
  vulnerabilities. A scanner that reported those as critical findings without
  distinguishing them would be the false-positive generator this project exists
  to avoid.

---

## 4. Fixture regression check

19 labelled files in `fixtures/demo_repo`, **19/19 agreement**.

This number is **not** an accuracy estimate and must not be presented as one.
Its labels and its detectors share an author. It exists to catch a silent
regression — someone tightens a pattern, a detector stops firing, a test goes
quietly green — and for nothing else.

---

## 5. What we are not claiming

- Not a general accuracy figure. It is one project.
- Not a comparison against any commercial or open-source tool. We have not
  measured CBOMkit, Guardium, Tychon, Q-Insight or Interlynk on this corpus, and
  we will not publish numbers we did not measure.
- No ML or LLM is involved in any figure here. Every number comes from
  deterministic rules, and the corpus, labels and script are in the repository
  for inspection.

---

## 6. Next work, in priority order

1. **Configuration-level crypto detection.** A registry table mapping
   `"RS256" → RSA(SHA256)` is as much a cryptographic declaration as a call is.
   This is worth more than any further pattern tuning.
2. **Fix the `encode` false positive.** Guard `str.encode`/`str.decode` by
   receiver type, and require a crypto-plausible argument set before mapping to
   a cryptographic algorithm.
3. **Test-directory awareness.** Findings inside `tests/` should be labelled as
   such rather than ranked alongside shipped-code findings.
4. **Widen the independent corpus.** At minimum a Go project and a Java project,
   so the multi-language claim is measured rather than asserted.
5. **Binary and certificate corpora.** `SYMBOL_INFERRED` evidence class is the
   weakest tier and has no independent measurement at all.

---

## 7. Method notes

- Ground truth: `fixtures/pyjwt_repo/GROUND_TRUTH.json`, including per-file
  negative reasons and a `known_detector_gaps` section.
- Scoring: `scripts/accuracy_real.py`. A detected label matches an expected one
  on normalised equality or substring containment in either direction, so
  `RSA` and `RSA-2048` are treated as the same surface at different
  specificity. Each detection is matched at most once (greedy, longest first).
- Per-file results including every true positive, false positive and false
  negative are written to `docs/accuracy_report.json`.
- A tier with no predictions and no expectations yields `null`, never `1.0`.
  An earlier version of `scripts/accuracy.py` returned `1.0` for empty tiers
  (divide-by-zero fallback), which rendered `scanner.unsupported` — with
  `TP=0 FP=0 FN=0` — as a perfect score.
