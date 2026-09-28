# Test corpora

Three kinds of fixture live here, and they are **not** interchangeable. Mixing
them up is how a project ends up claiming 100% accuracy.

## 1. `demo_repo/` — ours, synthetic, for the demo

22 files in Python, Java, Go, C, YAML, XML, JSON, PEM/DER certificates, an RSA
private key, `sshd_config`, a stripped `.so`, a zip, a binary blob and a README.

Authored by this project. Used for the live demo and for the regression check.
**Not an accuracy corpus** — we wrote both the labels and the detectors, so
agreement between them bounds internal consistency and nothing more.

## 2. `pyjwt_repo/`, `golang_jwt_repo/`, `java_jwt_repo/` — real, for accuracy

Unmodified source of three widely-used open-source JWT libraries. These are the
independently-labelled corpora behind every precision/recall figure in
[`../docs/ACCURACY.md`](../docs/ACCURACY.md).

| Corpus | Upstream | Language | Licence |
|---|---|---|---|
| `pyjwt_repo` | PyJWT 2.8.0 | Python | MIT |
| `golang_jwt_repo` | golang-jwt/jwt v5 | Go | MIT |
| `java_jwt_repo` | auth0/java-jwt | Java | MIT |

**Provenance.** Cloned with `git clone --depth 1`, `.git` removed, no source
file modified. Each retains its upstream `LICENSE` file. Ground truth lives in
`pyjwt_repo/GROUND_TRUTH.json` and `multi_language_ground_truth.json`, written
by reading the source, not by reading ECDAT's output.

**These are large because they are real.** Trimming them to "only the
interesting files" would make the corpus easier to score and worthless as
evidence. A 1.6 MB fixture that is a real library beats a 20 KB one that is not.

**Why JWT libraries.** They are the densest real-world example of
*declaration-surface* cryptography — a security policy expressed as a table
rather than a call. That is exactly the class our call-based detectors miss,
and exactly what the measurement needed to be honest about.

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
