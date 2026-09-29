# Test corpora

Three kinds of fixture live here, and they are **not** interchangeable. Mixing
them up is how a project ends up claiming 100% accuracy.

## 1. `demo_repo/` — ours, synthetic, for the demo

22 files in Python, Java, Go, C, YAML, XML, JSON, PEM/DER certificates, an RSA
private key, `sshd_config`, a stripped `.so`, a zip, a binary blob and a README.

Authored by this project. Used for the live demo and for the regression check.
**Not an accuracy corpus** — we wrote both the labels and the detectors, so
agreement between them bounds internal consistency and nothing more.

## 2. `pyjwt_repo/`, `golang_jwt_repo/`, `java_jwt_repo/`, `openssl_repo/`,
##    `rustls_repo/` — real, for accuracy

Source of five widely-used open-source libraries. These are the
independently-labelled corpora behind every precision/recall figure in
[`../docs/ACCURACY.md`](../docs/ACCURACY.md).

| Corpus | Upstream | Language | Licence |
|---|---|---|---|
| `pyjwt_repo` | PyJWT 2.8.0 | Python | MIT |
| `golang_jwt_repo` | golang-jwt/jwt v5 | Go | MIT |
| `java_jwt_repo` | auth0/java-jwt | Java | MIT |
| `openssl_repo` | OpenSSL 4.2.0 | C | Apache-2.0 |
| `rustls_repo` | rustls 0.24.0-dev | Rust | MIT / Apache-2.0 / ISC |

**Provenance.** Cloned from upstream, `.git` removed. Each corpus records the
upstream commit it came from: `openssl_repo/.upstream_commit`, and for
`rustls_repo` both `.upstream_commit` and `.upstream_hashes.json` — the latter
carries the sha256 of every *original* file, so the derivation is checkable
rather than merely asserted. Each retains its upstream `LICENSE` files. Ground
truth lives in `pyjwt_repo/GROUND_TRUTH.json` and
`multi_language_ground_truth.json`, written by reading the source, not by
reading ECDAT's output.

**One deliberate modification, in one corpus.** `rustls_repo` does not keep
rustls' inline unit tests: `#[cfg(test)] mod` blocks are removed by
`scripts/build_rustls_corpus.py`, matching the non-test convention every other
corpus here already follows. The script is checked in and re-runnable, and the
hashes it records are of the files *before* stripping. Stripping removed
exactly one algorithm from the corpus — HMAC-SHA512 in
`rustls-ring/src/tls12.rs`, referenced only from a test vector — which is why
that file's labels do not expect it. `openssl_repo` and the three JWT corpora
are unmodified.

**These are large because they are real.** Trimming them to "only the
interesting files" would make the corpus easier to score and worthless as
evidence. A 1.6 MB fixture that is a real library beats a 20 KB one that is not.

**Why JWT libraries.** They are the densest real-world example of
*declaration-surface* cryptography — a security policy expressed as a table
rather than a call. That is exactly the class our call-based detectors miss,
and exactly what the measurement needed to be honest about.

**Why OpenSSL and rustls.** C and Rust are where a regex tier is weakest and
the stakes are highest: OpenSSL is the library everything else is built on, and
Rust has no algorithm strings at all — a primitive is selected by naming a
constant path. Before these corpora existed the C tier returned **zero findings
on every OpenSSL file** and there was no Rust tier at all, so "multi-language"
rested on silence. Measuring them is what turned the claim into a result.

**Scanning a corpus you did not author is the point.** If you are reading this
because you want to reproduce the numbers:

```bash
python setup_ecdat.py                  # terminal 1
python scripts/accuracy_real.py --rescan   # terminal 2
```

Expect the figure in `docs/ACCURACY.md`, not 100%. If you get 100%, something
is wrong — most likely a cached scan, which is what `--rescan` exists to
prevent.

## 3. Synthetic certificate material

`demo_repo/certs/` holds self-generated test certificates (subject "Vajra
National Systems", self-signed). They are committed deliberately: the
`.gitignore` negation is narrow and explicit, and the certificate scanner has no
input without them.
