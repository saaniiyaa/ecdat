#!/usr/bin/env python3
"""Independent accuracy measurement for ECDAT.

Scores the engine against a hand-labelled ground truth derived from code this
project did not write (PyJWT 2.8.0 shipped source), and reports the
self-authored fixture benchmark separately as what it actually is: a regression
test that the detectors still agree with our own labels.

    python scripts/accuracy_real.py                 # both reports
    python scripts/accuracy_real.py --independent  # real-world only

Why two numbers exist
---------------------
A precision/recall figure is only meaningful if the labels were not written by
the same author as the code being measured. Our 22-file demo estate is authored
by us and the detectors are authored by us, so agreement between them proves
internal consistency and nothing else. Reporting it as "accuracy" would be a
category error, and it is the kind of error that destroys a technical audit the
moment an expert reads the methodology.

The independent corpus is PyJWT's shipped library code, labelled by manual
line-by-line source review. It is small, it is one project, and its findings
are dominated by optional-dependency import blocks. That is stated here rather
than buried, because a reader is entitled to know how far these numbers travel.
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import re
import sys
import urllib.error
import urllib.request
from collections import defaultdict

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

DEFAULT_BASE_URL = "http://127.0.0.1:8000/api/v1"
DEFAULT_API_KEY = "dev-ecdat-key"
GROUND_TRUTH_PATH = ROOT / "fixtures" / "pyjwt_repo" / "GROUND_TRUTH.json"
MULTI_LANG_PATH = ROOT / "fixtures" / "multi_language_ground_truth.json"


# --------------------------------------------------------------------------
# HTTP
# --------------------------------------------------------------------------
def _get(path: str, base_url: str, api_key: str) -> dict:
    req = urllib.request.Request(
        f"{base_url}{path}", headers={"X-API-Key": api_key}
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.load(resp)


def _items(payload) -> list[dict]:
    """List endpoints return either a bare list or a paginated {items: [...]}."""
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        return payload.get("items", [])
    return []


def _post(path: str, body: dict, base_url: str, api_key: str) -> dict:
    req = urllib.request.Request(
        f"{base_url}{path}",
        data=json.dumps(body).encode(),
        method="POST",
        headers={"X-API-Key": api_key, "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=600) as resp:
        return json.load(resp)


def ensure_scan(base_url: str, api_key: str, target: str, force: bool = False) -> dict:
    """Return a completed scan for `target`, creating one if none exists."""
    for scan in ([] if force else _items(_get("/scans?limit=20", base_url, api_key))):
        if scan.get("target_uri", "").rstrip("/").endswith(target.rstrip("/")):
            if scan.get("status") in {"completed", "succeeded", "ready"}:
                return scan
    slug = re.sub(r"[^a-z0-9]+", "-", target.split("/")[-1]).strip("-")
    # A completed scan is reused by default so re-running is cheap; --rescan
    # forces a fresh one, which is what you need after changing a detector.
    return _post(
        "/scans?wait_seconds=300",
        {
            "target_uri": target,
            "name": f"accuracy-{slug}",
            "context": {
                "exposure": "internet_facing",
                "criticality": "core_operations",
                "classification": "confidential",
                "data_lifetime_years": 10,
            },
            "mosca": {"scenario": "baseline"},
        },
        base_url,
        api_key,
    )


def fetch_findings(scan_id: str, base_url: str, api_key: str) -> list[dict]:
    return _items(_get(f"/scans/{scan_id}/findings?limit=500", base_url, api_key))


# --------------------------------------------------------------------------
# Matching
# --------------------------------------------------------------------------
def _normalise(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


# Family-equivalence classes. A cryptographic inventory is assessed at the
# level of "is this family's cryptography present, and is the specific
# instantiation right", not by exact string equality. RS256 and RS512 are two
# registrations of one RSA surface; scoring them as two unrelated labels
# penalises a detector for being precise, and scoring "RSA" against "RSA-2048"
# as a miss does the same in the other direction.
FAMILY: dict[str, str] = {
    # RSA
    "rsa2048": "RSA", "rsa3072": "RSA", "rsa4096": "RSA", "rsa": "RSA",
    "rsapss": "RSA-PSS", "rsaoaep": "RSA-OAEP", "rsaoaep256": "RSA-OAEP",
    "rsassa": "RSA", "rsapss3072": "RSA-PSS", "rsapss4096": "RSA-PSS",
    # ECDSA / EC
    "ecdsap256": "ECDSA", "ecdsap384": "ECDSA", "ecdsap521": "ECDSA",
    "ecdsasecp256k1": "ECDSA", "ecdsa": "ECDSA", "ec": "EC",
    "ecdh": "ECDH", "ecdhp256": "ECDH", "ecdhp384": "ECDH", "ecdhp521": "ECDH",
    "ed25519": "EdDSA", "ed448": "EdDSA", "eddsa": "EdDSA",
    # HMAC / KDF
    "hmacsha256": "HMAC", "hmacsha384": "HMAC", "hmacsha512": "HMAC",
    "hmacsha1": "HMAC", "hmac": "HMAC",
    "pbkdf2hmacsha256": "PBKDF2", "pbkdf2": "PBKDF2", "pbkdf2hmac": "PBKDF2",
    "scrypt": "KDF", "argon2": "KDF", "hkdf": "KDF", "pbes2": "KDF",
    # digests
    "sha256": "SHA-2", "sha384": "SHA-2", "sha512": "SHA-2",
    "sha224": "SHA-2", "sha2": "SHA-2",
    "sha1": "SHA-1", "md5": "MD5", "sha3256": "SHA-3", "sha3512": "SHA-3",
    "blake2b512": "BLAKE2", "blake2b": "BLAKE2", "blake2s": "BLAKE2",
    # symmetric
    "aes256gcm": "AES-GCM", "aes128gcm": "AES-GCM", "aesgcm": "AES-GCM",
    "aes256cbc": "AES-CBC", "aes128cbc": "AES-CBC", "aescbc": "AES-CBC",
    "aes256kw": "AES-KW", "aes128kw": "AES-KW", "aeskw": "AES-KW",
    "aes256ecb": "AES", "chacha20poly1305": "ChaCha20-Poly1305",
    "xchacha20poly1305": "XChaCha20-Poly1305", "chacha20": "ChaCha20",
    "3des": "3DES", "des": "DES", "rc4": "RC4",
    # structure
    "jwtalgnone": "JWT-ALG-NONE", "privatekeymaterial": "KEY-MATERIAL",
    "keymaterial": "KEY-MATERIAL", "base64url": "BASE64URL",
    "tlsv12": "TLS", "tlsv13": "TLS", "tlsv11": "TLS", "tlsv10": "TLS",
    "direct": "DIRECT",
    # Java/Go primitive boundaries: the class is a crypto boundary but the
    # specific algorithm arrives as a runtime parameter.
    "jcasignature": "JCA-SIGNATURE", "jcamac": "JCA-MAC",
    "jcakdfactory": "JCA-KEYFACTORY", "jcamessagedigest": "JCA-DIGEST",
    "jcacipher": "JCA-CIPHER", "jcacheckeypair": "JCA-KEYGEN",
    "ecp256": "EC",
}


def family_of(label: str) -> str:
    key = _normalise(label)
    return FAMILY.get(key, label.upper())


def score_file(expected: list[str], detected: list[str]) -> dict:
    """Score one file at family granularity.

    A detection is a true positive when its family is one the reviewer
    expected in that file, regardless of the specific bit strength. A detection
    whose family is absent from the reviewer's list is a false positive - which
    is the check that matters, because that is how a scanner invents
    cryptography that is not there.
    """
    exp_families = {family_of(e) for e in expected}
    det_families = {family_of(d) for d in detected}
    tp = sorted(exp_families & det_families)
    fp = sorted(det_families - exp_families)
    fn = sorted(exp_families - det_families)
    return {
        "expected": expected,
        "detected": detected,
        "expected_families": sorted(exp_families),
        "detected_families": sorted(det_families),
        "true_positives": tp,
        "false_positives": fp,
        "false_negatives": fn,
    }


def aggregate(rows: list[dict]) -> dict:
    tp = sum(len(r["true_positives"]) for r in rows)
    fp = sum(len(r["false_positives"]) for r in rows)
    fn = sum(len(r["false_negatives"]) for r in rows)

    def ratio(num: int, den: int) -> float | None:
        return round(num / den, 4) if den else None

    precision = ratio(tp, tp + fp)
    recall = ratio(tp, tp + fn)
    f1 = (
        round(2 * precision * recall / (precision + recall), 4)
        if precision and recall and (precision + recall) > 0
        else None
    )
    return {
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "note": None
        if (tp + fp) and (tp + fn)
        else "undefined: no predictions and/or no expected items in scope",
    }


# --------------------------------------------------------------------------
# Report
# --------------------------------------------------------------------------
def independent_report(findings: list[dict]) -> dict:
    truth = json.loads(GROUND_TRUTH_PATH.read_text(encoding="utf-8"))
    by_file: dict[str, list[str]] = defaultdict(list)
    for f in findings:
        name = f.get("asset", {}).get("canonical_name")
        if name:
            by_file[f["file_path"]].append(name)

    rows = []
    for entry in truth["labelled_files"]:
        path = entry["file_path"]
        expected = entry.get("expected_algorithms", [])
        detected = sorted(set(by_file.get(path, [])))
        row = {"file_path": path, **score_file(expected, detected)}
        if entry.get("negative_reason"):
            row["negative_reason"] = entry["negative_reason"]
        rows.append(row)

    detected_elsewhere = sorted(
        {f["file_path"] for f in findings if f["file_path"] not in
         {e["file_path"] for e in truth["labelled_files"]}}
    )
    return {
        "corpus": "PyJWT 2.8.0 shipped library code (jwt/)",
        "method": truth["method"],
        "labelled_files": len(truth["labelled_files"]),
        "totals": aggregate(rows),
        "per_file": rows,
        "known_detector_gaps": truth.get("known_detector_gaps", []),
        "unlabelled_paths_with_findings": detected_elsewhere,
    }


def multilang_report(findings_by_corpus: dict[str, list[dict]]) -> list[dict]:
    """Score the Go and Java corpora against hand-written labels."""
    if not MULTI_LANG_PATH.exists():
        return []
    spec = json.loads(MULTI_LANG_PATH.read_text(encoding="utf-8"))
    out = []
    for corpus in spec["corpora"]:
        root = corpus["root"]
        by_file: dict[str, list[str]] = defaultdict(list)
        for f in findings_by_corpus.get(corpus["name"], []):
            name = f.get("asset", {}).get("canonical_name")
            if name:
                by_file[f["file_path"]].append(name)

        rows = []
        for entry in corpus["labelled_files"]:
            # Labels are written repo-relative; findings come back with the
            # corpus root in the path.
            rel = entry["file_path"]
            detected = sorted(set(by_file.get(rel, []) or by_file.get(f"{root}/{rel}", [])))
            row = {"file_path": rel, **score_file(entry.get("expected_algorithms", []), detected)}
            if entry.get("negative_reason"):
                row["negative_reason"] = entry["negative_reason"]
            rows.append(row)

        out.append({
            "corpus": corpus["name"],
            "language": corpus["language"],
            "method": spec["method"],
            "labelled_files": len(rows),
            "totals": aggregate(rows),
            "per_file": rows,
        })
    return out


def fixture_regression_report(findings: list[dict]) -> dict:
    """The self-authored benchmark, reported as a regression check.

    Returns agreement rate, not precision. Precision is undefined for a corpus
    whose labels and detector were produced by the same author.
    """
    sys.path.insert(0, str(ROOT / "scripts"))
    try:
        from accuracy import GROUND_TRUTH as FIXTURES  # type: ignore
    except Exception:
        return {"available": False, "reason": "scripts/accuracy.py not importable"}

    by_file: dict[str, set[str]] = defaultdict(set)
    for f in findings:
        name = f.get("asset", {}).get("canonical_name")
        if name:
            by_file[f["file_path"]].add(name)

    agreed = mismatched = 0
    disagreements = []
    for path, label in FIXTURES.items():
        expected = set(label.get("expected_algorithms", []))
        if label.get("clean"):
            found = by_file.get(path, set())
            if not found:
                agreed += 1
            else:
                mismatched += 1
                disagreements.append({"file": path, "unexpected": sorted(found)})
            continue
        detected = by_file.get(path, set())
        if detected and len(expected & detected) == len(expected & detected) and detected >= expected:
            agreed += 1
        else:
            mismatched += 1
            disagreements.append(
                {"file": path, "expected": sorted(expected), "detected": sorted(detected)}
            )

    total = agreed + mismatched
    return {
        "available": True,
        "corpus": "fixtures/demo_repo (authored by this project)",
        "labelled_files": total,
        "agreement_rate": round(agreed / total, 4) if total else None,
        "agreed": agreed,
        "disagreed": mismatched,
        "disagreements": disagreements,
        "interpretation": (
            "Regression check only. These labels and these detectors share an "
            "author, so this number bounds internal consistency and is NOT an "
            "accuracy estimate. It is reported to detect silent regressions, "
            "not to demonstrate correctness."
        ),
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--base-url",
        default=os.environ.get("ECDAT_BASE_URL", DEFAULT_BASE_URL),
        help="API base URL (default: $ECDAT_BASE_URL or %(default)s)",
    )
    ap.add_argument(
        "--api-key",
        default=os.environ.get("ECDAT_API_KEY", DEFAULT_API_KEY),
        help="API key (default: $ECDAT_API_KEY or the dev key)",
    )
    ap.add_argument("--independent", action="store_true",
                    help="skip the self-authored fixture benchmark")
    ap.add_argument("--rescan", action="store_true",
                    help="ignore cached scans and re-scan every corpus")
    ap.add_argument("--python-only", action="store_true",
                    help="score only the Python corpus (Go and Java run by default)")
    args = ap.parse_args()

    report: dict = {
        "generated_at": __import__("datetime").datetime.now(
            __import__("datetime").timezone.utc
        ).isoformat(),
        "tool": "scripts/accuracy_real.py",
    }

    corpora = [("Python", "fixtures/pyjwt_repo", "PyJWT 2.8.0 shipped code")]
    if not args.python_only:
        corpora += [
            ("Go", "fixtures/golang_jwt_repo", "golang-jwt/jwt v5 (non-test)"),
            ("Java", "fixtures/java_jwt_repo", "auth0/java-jwt (non-test)"),
        ]

    all_findings = {}
    for lang, target, label in corpora:
        print(f"scanning {target} ...", flush=True)
        scan = ensure_scan(args.base_url, args.api_key, target, force=args.rescan)
        findings = fetch_findings(scan["id"], args.base_url, args.api_key)
        all_findings[lang] = findings
        print(f"  {len(findings)} findings - {label}\n", flush=True)

    report["independent"] = independent_report(all_findings["Python"])
    if not args.python_only:
        report["multilang"] = multilang_report({
            "golang-jwt/jwt v5": all_findings["Go"],
            "auth0/java-jwt": all_findings["Java"],
        })
    if not args.independent:
        demo = ensure_scan(args.base_url, args.api_key, "fixtures/demo_repo",
                           force=args.rescan)
        report["fixture_regression"] = fixture_regression_report(
            fetch_findings(demo["id"], args.base_url, args.api_key)
        )

    out = ROOT / "docs" / "accuracy_report.json"
    out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"wrote {out.relative_to(ROOT)}\n")

    ind = report["independent"]["totals"]
    print("=" * 72)
    print("INDEPENDENT CORPUS - PyJWT 2.8.0 shipped code")
    print("=" * 72)
    print(f"  labelled files : {report['independent']['labelled_files']}")
    print(f"  TP={ind['tp']}  FP={ind['fp']}  FN={ind['fn']}")
    print(f"  precision      : {ind['precision']}")
    print(f"  recall         : {ind['recall']}")
    print(f"  F1             : {ind['f1']}")
    if ind.get("note"):
        print(f"  note           : {ind['note']}")
    for gap in report["independent"]["known_detector_gaps"]:
        print(f"\n  known gap @ {gap['location']}: {gap['missed']}")
    print()
    print("  This is a SMALL corpus from ONE project. Treat it as a floor, not")
    print("  a general accuracy claim. Negative results are reported in full.")

    for entry in report.get("multilang", []):
        t = entry["totals"]
        print()
        print("=" * 72)
        print(f"MULTI-LANGUAGE - {entry['corpus']} ({entry['language']})")
        print("=" * 72)
        print(f"  labelled files : {entry['labelled_files']}")
        print(f"  TP={t['tp']}  FP={t['fp']}  FN={t['fn']}")
        print(f"  precision      : {t['precision']}")
        print(f"  recall         : {t['recall']}")
        print(f"  F1             : {t['f1']}")
        if t.get("note"):
            print(f"  note           : {t['note']}")

    reg = report.get("fixture_regression")
    if reg and reg.get("available"):
        print()
        print("=" * 72)
        print("FIXTURE REGRESSION - self-authored, NOT an accuracy estimate")
        print("=" * 72)
        print(f"  agreement : {reg['agreement_rate']}  ({reg['agreed']}/{reg['labelled_files']})")
        print(f"  {reg['interpretation']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
