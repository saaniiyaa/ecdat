# ECDAT Detection Accuracy

**SIH PS 26164 · National Technical Research Organisation**

Measured precision and recall against a hand-labelled corpus, plus a regression
check on our own fixtures. The two numbers are reported separately because they
mean different things, and conflating them would be the single easiest way to
misrepresent this project.

Reproduce with:

```bash
python setup_ecdat.py                       # terminal 1 - API on :8000
python scripts/accuracy_real.py --rescan    # terminal 2
```

---

## 1. Summary

| Corpus | Language | Precision | Recall | F1 | Labelled |
|---|---|---|---|---|---|
| **PyJWT 2.8.0** shipped code | Python | 0.842 | 0.727 | 0.780 | 8 files |
| **golang-jwt/jwt v5** (non-test) | Go | 1.000 | 1.000 | 1.000 | 11 files |
| **auth0/java-jwt** (non-test) | Java | 1.000 | 0.889 | 0.941 | 8 files |
| **OpenSSL 4.2.0** (C) | C | 1.000 | 1.000 | 1.000 | 8 files |
| **demo_repo** (self-authored) | multi | *n/a* | *n/a* | 1.00 agreement | — |

Four real-world projects this project did not author, hand-labelled by reading
their source. Aggregate: TP=74, FP=3, FN=7 — precision **0.961**, recall
**0.914** over 35 labelled files.

### Read the per-corpus rows, not the aggregate

The aggregate is dominated by whichever corpus is largest, and OpenSSL
contributes 30 of the 74 true positives at a perfect score. A perfect row in a
hand-built table of 8 files is weak evidence on its own; the honest reading is
**PyJWT is the only corpus with a realistic breadth of surface**, and it is the
weakest row. The Go, Java and C corpora are each narrowly chosen — JWT
libraries and a crypto library's own digest and cipher cores — and a panel
should read them as the favourable case, not the typical one.

### The scoring rule changed on 2026-09-29, and the old numbers are not comparable

PyJWT's recall moved 0.600 → 0.727 and Go's true-positive count moved 10 → 20
**without any change to the detectors**. The cause was the scorer: it used to
compare at family granularity, which could not see partial coverage inside a
family. A file declaring RS256, RS384 and RS512 scored identically whether the
detector found one or all three. It also counted `AES-128` as disagreeing with
`AES-128-GCM`, penalising a detection for being more specific than the label.

Scoring is now per expected label: same primitive family, no conflicting
specifier, and a label that does not name a mode or size does not constrain one.
`AES-128` satisfies `AES-128-GCM`. `SHA-256` does not satisfy `SHA-512`;
`HMAC-SHA256` does not satisfy `HMAC-SHA384`; `Ed25519` does not satisfy `Ed448`.

This was a fix to the measuring instrument, not an improvement in the tool. Any
comparison against a pre-2026-09-29 figure requires re-measurement. The rule and
this warning are recorded in `docs/accuracy_report.json` under `scoring`, so they
travel with the data rather than living only in prose.

---

## 2. Why there are two numbers

A precision/recall figure is only meaningful if the labels were not written by
the same author as the code being measured.

Our 22-file demo estate is authored by this project. The detectors are authored
by this project. Agreement between them proves **internal consistency** and
nothing about correctness on code we did not write. Scoring that as "accuracy"
is a category error.

The independent corpus is PyJWT 2.8.0's shipped library source, labelled by
manual line-by-line review in `fixtures/pyjwt_repo/GROUND_TRUTH.json`. Those
labels were written by reading the source, not by reading ECDAT's output.

An earlier version of this document reported 100% precision and 100% recall
from the fixture corpus alone. Those figures were not wrong arithmetically, but
they measured the wrong thing. The same measurement against independent ground
truth returned **0.667 precision / 0.154 recall**, which is the real starting
point of this work.

---

## 3. Independent corpora

**Method:** manual review of each library's non-test source.
**Scored at family granularity** — see §6.

### PyJWT 2.8.0 (Python) — 8 labelled files

| Precision | Recall | F1 |
|---|---|---|
| 0.818 | 0.600 | 0.692 |

### golang-jwt/jwt v5 (Go) — 11 labelled files

| Precision | Recall | F1 |
|---|---|---|
| 1.000 | 1.000 | 1.000 |

### auth0/java-jwt (Java) — 8 labelled files

| Precision | Recall | F1 |
|---|---|---|
| 1.000 | 0.889 | 0.941 |

### Two apparent false positives that were our labels, not the engine

`jwt/algorithms.py` reports `JWT-ALG-NONE` at line 146. **This is a true
positive that the reviewer initially mislabelled.** PyJWT's
`get_default_algorithms()` registers `"none": None` in its default algorithm
table. The presence of an unsecured algorithm in a library's default registry is
precisely the fact a cryptographic inventory exists to surface. It is retained
as a finding, and the ground truth was corrected to match.

---

## 4. The six remaining misses

| File | Missed family | Why |
|---|---|---|
| `algorithms.py` | RSA-OAEP, EC, ECDH | Declared only inside a guarded `cryptography.hazmat` import block. Import-block scanning is a deliberate precision trade: it raises noise on every optional-dependency import, so these families are reported only where constructed. |
| `api_jwk.py` | RSA, EC, ECDH | Converts between JWK member names (`kty`, `n`, `e`, `crv`) and key objects without naming a primitive. Needs JWK member names treated as cryptographic context. |

`utils.py` (BASE64URL) and `algorithms.py` (HMAC, RSA, RSA-PSS, ECDSA ×4,
Ed25519, SHA-2 ×3) are **detected**. `jwks_client.py` is correctly *not*
reported for TLS: its HTTPS is performed by the interpreter's `ssl` module
against a URL string, and crediting ourselves for inheriting a property of
`urllib` would be dishonest attribution. Transport encryption is inventoried
from certificates and the opt-in live-TLS probe instead.

### The gap that mattered, and what closed it

The original measurement was 0.154 recall. The misses shared one root cause:
**our detectors found invocations, while real libraries declare their
cryptographic surface as configuration.**

```python
def get_default_algorithms():
    return {
        "RS256": RSAAlgorithm(RSAAlgorithm.SHA256),   # a table entry
        "PS512": RSAPSSAlgorithm(RSAPSSAlgorithm.SHA512),
        "ES256": ECAlgorithm(ECAlgorithm.SHA256, SECP256R1),
    }

class HMACAlgorithm(Algorithm):
    SHA256: ClassVar[HashlibHash] = hashlib.sha256    # a class attribute
```

Nothing *calls* `RS256`. Something *names* it, and that name is the entire
security policy of the application. No amount of pattern tuning finds this.

`app/scanners/declarations.py` now resolves three declaration shapes: JOSE
algorithm registries, class-level digest bindings, and cipher/digest
configuration tables. All findings are emitted at `INFERRED` evidence, never
`PARSED_STRUCTURE` — a declaration is strong evidence of a *policy*, weaker
evidence of a reachable call site, and the evidence class is the mechanism that
says so.

---

## 5. Bugs this measurement exposed

All four were invisible before independent ground truth existed.

1. **`str.encode` reported as a critical signature bypass.** PyJWT's
   `api_jws.py:358` is `jwt.encode("utf-8")` — `str.encode`, text encoding.
   Reported as critical `JWT-ALG-NONE`. Fixed by a text-codec guard.
2. **The entire ECDSA and EdDSA families were missing from the JOSE lookup
   table.** `JWT_RSA` held RS\*/PS\* only; ES256, ES384, ES512, ES256K and EdDSA
   call sites were silently dropped. A name in a table the caller never checks
   is a finding that never happens.
3. **Unresolvable algorithms reported as `alg: none`.** A call whose algorithm
   could not be read was emitted as a critical-band signature bypass. Absence of
   evidence is not evidence of absence; it is now reported as nothing.
4. **A `.get(` regex treated every dict lookup as an HTTPS call.** 33 spurious
   TLS findings across four files. The rule now matches full dotted names of
   unambiguous network APIs only.

Each is covered by a named regression test in `tests/test_declarations.py`.

---

## 6. Scoring methodology

**Family granularity.** RS256 and RS512 are three registrations of one RSA
surface. Scoring `RSA-2048` against a label of `RSA` as a miss penalises a
detector for being precise. Family equivalence classes live in
`scripts/accuracy_real.py:FAMILY`.

**Unlabelled paths are reported, not silently dropped.** Findings in
`fixtures/pyjwt_repo/tests/` (218 of 223) are excluded from scoring: they are
largely PyJWT's own deliberate `alg:none` downgrade test cases, not live
vulnerabilities.

**A tier with no data yields `null`, never `1.0`.** An earlier version of
`scripts/accuracy.py` returned `1.0` for empty tiers, rendering
`scanner.unsupported` — with `TP=0 FP=0 FN=0` — as a perfect score.

---

## 7. What we are not claiming

- **Not a general accuracy figure.** One project, one language, 8 files.
- **No comparison against any commercial or open-source tool.** CBOMkit,
  Guardium, Tychon, Q-Insight and Interlynk have not been measured on this
  corpus, so no numbers for them are published.
- **No ML or LLM is involved in any figure here.** Every number comes from
  deterministic rules, and the corpus, labels and script are in the repository.
- **Binary and certificate tiers have no independent measurement at all.**
  `SYMBOL_INFERRED` is the weakest tier and remains unvalidated.

---

## 8. Keeping these numbers true

A measured figure decays the moment the code changes underneath it. Three
mechanisms now stop that happening quietly, and all three run in CI.

### `scripts/accuracy_gate.py` — required CI job

Re-measures all three corpora against `docs/accuracy_baseline.json` and fails
the build on a regression beyond tolerance (0.06), on an absolute
precision/recall floor, or on a missing corpus. It replaces `scripts/accuracy.py`,
which scored the detector against fixtures the same author wrote and therefore
could only ever confirm itself.

The gate is verified, not merely written. Disabling the JOSE declaration tier
was used as a deliberate regression: aggregate recall fell from 0.794 to 0.706
and the gate exited 1, naming the corpora affected.

Re-recording the baseline with `--update` is a deliberate act, and the command
output says so. A gate whose reference can be quietly rewritten is not a gate.

### `scripts/check_claims.py` — prose cannot drift from measurement

The gate proves the detector did not regress. It says nothing about
`docs/ACCURACY.md` continuing to quote a figure the measurement no longer
supports — which is the quieter failure, because the number keeps looking
authoritative long after it stopped being true. This check fails the build when
a document asserts a detector metric the current report does not produce, and
when a test count in the README disagrees with what the suite collects.

It is deliberately conservative: it never edits a document and never guesses
intent. It reports the file, the line, and both numbers.

It earned its place during this work by catching a report left on disk from the
sabotage run above, before the figures were regenerated.

### Detector failures stay visible

A detector that raises must not be able to produce a clean-looking scan. The
scan runner logs the traceback, preserves the results of the detectors that
did work, and marks the affected surfaces `partial`. A coverage index computed
over a silently shortened detector set is worse than no index, because it is
still displayed as a number.

## 9. Next work, in priority order

1. **Close the remaining measured gaps.** The six families listed in
   `known_detector_gaps` are the only justified detector work: each one is a
   known miss against hand-labelled code, not a speculative improvement.
2. **A binary corpus** with hand-read symbol tables, to validate `SYMBOL_INFERRED`,
   the weakest tier and the only one with no independent measurement at all.
3. **Import-block policy.** Decide deliberately whether guarded
   `cryptography`/`openssl` imports are cryptographic declarations, and measure
   the precision cost either way. Currently a deliberate precision trade.
4. **Server-side filters for `declared`/`called` and `source_context`.** Both
   are applied client-side in the console today, which means they filter the
   visible page rather than the scan. The UI says so rather than implying
   otherwise.
