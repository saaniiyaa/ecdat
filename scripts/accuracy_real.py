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


def ensure_scan(base_url: str, api_key: str, target: str) -> dict:
    """Return a completed scan for `target`, creating one if none exists."""
    for scan in _items(_get("/scans?limit=20", base_url, api_key)):
        if scan.get("target_uri", "").rstrip("/").endswith(target.rstrip("/")):
            if scan.get("status") in {"completed", "succeeded", "ready"}:
                return scan
    slug = re.sub(r"[^a-z0-9]+", "-", target.split("/")[-1]).strip("-")
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


def _matches(expected: str, detected: str) -> bool:
    """True when a detected label is consistent with an expected one.

    Substring containment either way is accepted: a detector may report
    RSA-2048 where the label says RSA, or RSA where the label says RSA-2048.
    Both describe the same surface at different specificity.
    """
    e, d = _normalise(expected), _normalise(detected)
    return e == d or e in d or d in e


def score_file(expected: list[str], detected: list[str]) -> dict:
    """Score one file. Detections are matched at most once (greedy, longest first)."""
    remaining = list(detected)
    tp: list[tuple[str, str]] = []
    for exp in expected:
        match = next((d for d in remaining if _matches(exp, d)), None)
        if match is not None:
            tp.append((exp, match))
            remaining.remove(match)
    return {
        "expected": expected,
        "detected": detected,
        "true_positives": tp,
        "false_positives": list(remaining),
        "false_negatives": [e for e in expected if e not in [t[0] for t in tp]],
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
    ap.add_argument("--base-url", default=DEFAULT_BASE_URL)
    ap.add_argument("--api-key", default=DEFAULT_API_KEY)
    ap.add_argument("--independent", action="store_true",
                    help="skip the self-authored fixture benchmark")
    args = ap.parse_args()

    report: dict = {
        "generated_at": __import__("datetime").datetime.now(
            __import__("datetime").timezone.utc
        ).isoformat(),
        "tool": "scripts/accuracy_real.py",
    }

    print("scanning fixtures/pyjwt_repo ...", flush=True)
    scan = ensure_scan(args.base_url, args.api_key, "fixtures/pyjwt_repo")
    findings = fetch_findings(scan["id"], args.base_url, args.api_key)
    print(f"  {len(findings)} findings across the corpus\n", flush=True)

    report["independent"] = independent_report(findings)
    if not args.independent:
        demo = ensure_scan(args.base_url, args.api_key, "fixtures/demo_repo")
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
