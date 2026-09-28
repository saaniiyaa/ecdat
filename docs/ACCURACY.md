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

| Corpus | Precision | Recall | F1 | What it establishes |
|---|---|---|---|---|
| **PyJWT 2.8.0** (independent) | **0.900** | **0.600** | **0.720** | How the engine behaves on code it was not written against |
| **demo_repo** (self-authored) | *n/a* | *n/a* | 1.00 agreement | That the detectors still match our own labels — a regression check, nothing more |

Precision is 0.900 against a hand-labelled independent corpus. Recall is 0.600,
and the six remaining misses are enumerated by file and reason in §4.

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

## 3. Independent corpus: PyJWT 2.8.0

**Method:** manual review of all 8 modules in `jwt/`.
**Scored at family granularity** — see §6.

| Metric | Value |
|---|---|
| Precision | 0.900 (9 TP / 10 predictions) |
| Recall | 0.600 (9 TP / 15 expected families) |
| F1 | 0.720 |

### The one false positive

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

## 8. Next work, in priority order

1. **JWK member-name detection** — `kty`/`n`/`e`/`crv` as cryptographic
   context. Closes the `api_jwk.py` gap and generalises to any JOSE library.
2. **Widen the independent corpus.** At minimum one Go and one Java project, so
   the multi-language claim is measured rather than asserted.
3. **A binary corpus** with hand-read symbol tables, to validate the weakest
   evidence tier.
4. **Test-directory awareness.** Findings under `tests/` should be labelled as
   such rather than ranked beside shipped-code findings.
5. **Import-block policy.** Decide deliberately whether guarded
   `cryptography`/`openssl` imports are cryptographic declarations, and measure
   the precision cost either way.
