# PHASE 2A — C and Rust tiers, measured against real libraries.

**State at this handoff:** see the commit message. Five hand-labelled corpora,
185 tests, accuracy gate and claim check both green.

This file supersedes nothing in `HANDOFF_PHASE1.md`; it records what Phase 2A
added and what Phase 2B still owes.

---

## 1. What changed, and why it was not a formality

The project claimed multi-language support. On measurement, the C tier
returned **zero findings on every OpenSSL file**, and there was no Rust tier at
all. Both claims were resting on silence.

| Corpus | Language | Precision | Recall | TP | FP | FN |
|---|---|---|---|---|---|---|
| PyJWT 2.8.0 | Python | 0.842 | 0.727 | 16 | 3 | 6 |
| golang-jwt/jwt v5 | Go | 1.000 | 1.000 | 20 | 0 | 0 |
| auth0/java-jwt | Java | 1.000 | 0.889 | 8 | 0 | 1 |
| OpenSSL 4.2.0 | C | 1.000 | 1.000 | 30 | 0 | 0 |
| rustls 0.24.0-dev | Rust | 1.000 | 1.000 | 32 | 0 | 0 |
| **Aggregate** | | **0.973** | **0.938** | **106** | **3** | **7** |

Read the per-corpus rows, not the aggregate. Four of the five are perfect and
three of those corpora are narrowly chosen by the same person who wrote the
detector. **PyJWT is the only corpus with realistic breadth, and it is the
weakest row.**

## 2. Corpus provenance

Nothing in the accuracy corpora is self-authored. Each records the upstream
commit it came from, and `rustls_repo` additionally records the sha256 of every
original file in `.upstream_hashes.json`, so the derivation can be checked
rather than believed.

The one deliberate modification is disclosed: `rustls_repo` has
`#[cfg(test)] mod` blocks stripped by `scripts/build_rustls_corpus.py`,
matching the non-test convention the other corpora already followed. This
removed exactly one algorithm (HMAC-SHA512 in `rustls-ring/src/tls12.rs`, test
vector only), and that is why `tls12.rs` does not expect it.

## 3. Bugs the measurement found

Nine, all listed in `docs/ACCURACY.md` §5. The four Rust ones are worth
knowing before touching `app/scanners/source_text.py`:

1. `ProtocolVersion::TLSv1_3` was reported as `TLSv1.0` — a legacy-protocol
   pattern matching the prefix of the newest protocol in the corpus.
2. `hmac::HMAC_SHA256` resolved to `HMAC-SHA`. A capture written as `\1` inside
   a **non-raw** string is an octal escape in Python, and the group came out
   empty. HMAC-SHA256 and HMAC-SHA384 were indistinguishable.
3. The namespace pattern required lowercase, so CamelCase Rust *type* paths
   (`SignatureScheme::ED25519`) never matched. Ed25519 and every ECDSA scheme
   were silently absent.
4. `alg_id::ECDSA_P384` fell through to the P256 registry default. The Rust
   twin of the OpenSSL `NID_aes` bug.

A tenth was not a detector bug: a bare `pytest` collected **637** tests because
the third-party corpora ship their own suites. The real suite is 185.
`pytest.ini` now scopes collection to `tests/`.

## 4. Two rules that must not be broken

- **Never edit a label to improve a score.** `scripts/accuracy_gate.py` exists
  to make that visible. The one place rustls ground truth and detector output
  differ in spelling — `RSA` vs the registry's `RSA-2048` default — is recorded
  in the corpus notes rather than resolved by changing either side.
- **A percentage in prose is a measured claim.** `scripts/check_claims.py` now
  checks `NN%` as well as decimals, because the README really did say "100%
  precision, recall & F1" while the measurement was 0.973 / 0.938, and the
  decimal-only rule could not see it.

## 5. Reproduce every published number

```
python -m pytest -q
python scripts/accuracy_gate.py
python scripts/check_claims.py
```

`accuracy_gate.py` needs a running API. `--update` re-records the baseline and
is a deliberate act, not a way to make CI green.

## 6. What Phase 2B still owes

- Server-side `declared` / `called` and `source_context` filters.
- Data-exposure matrix.
- Registry PQC `replacement_hint` presentation.
- Frontend test runner and the remaining console gaps in
  `frontend/WHAT_REMAINS.md`.
- **The binary and certificate tier has no independent measurement at all.**
  `SYMBOL_INFERRED` is the weakest tier and is still unvalidated. A certificate
  corpus and hand-read binary symbol evidence are required before that tier is
  described as working.
