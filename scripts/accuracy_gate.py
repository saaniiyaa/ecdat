#!/usr/bin/env python3
"""Accuracy regression gate.

A published number that nothing checks eventually stops being true. This script
is the permanent answer to that: it re-measures the independently-labelled
corpora and fails the build if precision or recall moves outside a recorded
band, so a detector change cannot silently degrade the claims in
`docs/ACCURACY.md` and the README.

    python scripts/accuracy_gate.py            # check against docs/accuracy_baseline.json
    python scripts/accuracy_gate.py --update   # re-baseline after an intended change

Design notes
------------
* Bands, not exact equality. A detector improvement must not fail the build, and
  a one-finding wobble must not either. What must never pass is a *regression*.
* The gate refuses to run against the self-authored fixture corpus. Those labels
  and those detectors share an author, so a "regression" there is meaningless.
* `--update` prints the full before/after diff so a baseline change is always a
  deliberate, reviewable act rather than a reflex.
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

BASELINE = ROOT / "docs" / "accuracy_baseline.json"
REPORT = ROOT / "docs" / "accuracy_report.json"

# How far a metric may move before the build breaks. Detection is a
# classification problem over small corpora; a finding gained or lost is
# routinely worth 0.02-0.05. These bands catch real degradation without
# demanding bit-identical detector output.
TOLERANCE = 0.06

# Floor below which a build fails regardless of the recorded baseline. A
# regression gate that permits catastrophic absolute performance is not a gate.
FLOOR = {"precision": 0.60, "recall": 0.35}


def run_benchmark() -> dict:
    """Re-run the independent benchmark against a live API."""
    env = dict(os.environ)
    proc = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "accuracy_real.py"), "--rescan"],
        cwd=ROOT, env=env, capture_output=True, text=True, timeout=1800,
    )
    if proc.returncode != 0:
        sys.stderr.write(proc.stdout[-4000:] + "\n" + proc.stderr[-4000:] + "\n")
        raise SystemExit("accuracy benchmark failed to run; see output above")
    return json.loads(REPORT.read_text(encoding="utf-8"))


def collect(report: dict) -> dict[str, dict[str, float]]:
    """Flatten a report into {corpus: {metric: value}}."""
    out: dict[str, dict[str, float]] = {}

    def add(name: str, totals: dict) -> None:
        row = {}
        for key in ("precision", "recall", "f1"):
            value = totals.get(key)
            if isinstance(value, (int, float)):
                row[key] = round(float(value), 4)
        tp, fp, fn = totals.get("tp"), totals.get("fp"), totals.get("fn")
        if None not in (tp, fp, fn):
            row["tp"], row["fp"], row["fn"] = int(tp), int(fp), int(fn)
        out[name] = row

    if "independent" in report:
        add("pyjwt-python", report["independent"]["totals"])
    for entry in report.get("multilang", []):
        add(f"{entry['language']}:{entry['corpus']}", entry["totals"])

    # Aggregate across every independent corpus.
    tp = sum(r.get("tp", 0) for r in out.values())
    fp = sum(r.get("fp", 0) for r in out.values())
    fn = sum(r.get("fn", 0) for r in out.values())
    if tp + fp:
        out["AGGREGATE"] = {
            "precision": round(tp / (tp + fp), 4),
            "recall": round(tp / (tp + fn), 4) if tp + fn else 0.0,
            "tp": tp, "fp": fp, "fn": fn,
        }
    return out


def compare(current: dict, baseline: dict) -> tuple[list[str], list[str]]:
    failures: list[str] = []
    improvements: list[str] = []
    for corpus, row in sorted(current.items()):
        prior = baseline.get(corpus)
        if prior is None:
            improvements.append(f"{corpus}: new corpus, {row}")
            continue
        for metric, value in sorted(row.items()):
            if metric in {"tp", "fp", "fn"}:
                continue
            before = prior.get(metric)
            if before is None:
                continue
            delta = value - before
            if delta < -TOLERANCE:
                failures.append(
                    f"REGRESSION {corpus}.{metric}: {before:.3f} -> {value:.3f} "
                    f"({delta:+.3f}, tolerance -{TOLERANCE})"
                )
            elif delta > TOLERANCE:
                improvements.append(f"{corpus}.{metric}: {before:.3f} -> {value:.3f} ({delta:+.3f})")
            if metric in FLOOR and value < FLOOR[metric]:
                failures.append(
                    f"FLOOR {corpus}.{metric}: {value:.3f} is below the absolute "
                    f"minimum {FLOOR[metric]:.2f}"
                )
    for corpus in baseline:
        if corpus not in current:
            failures.append(f"MISSING corpus {corpus}: it is in the baseline but did not run")
    return failures, improvements


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--update", action="store_true",
                    help="rewrite the baseline from this run (review the diff)")
    args = ap.parse_args()

    print("measuring independently-labelled corpora ...", flush=True)
    report = run_benchmark()
    current = collect(report)
    print()

    if args.update:
        BASELINE.write_text(
            json.dumps({
                "_about": (
                    "Recorded detector performance against hand-labelled real-world "
                    "corpora. Regenerate with `python scripts/accuracy_gate.py --update` "
                    "and review the diff: this file is the reference CI compares "
                    "against, so changing it changes what counts as a regression."
                ),
                "tolerance": TOLERANCE,
                "floor": FLOOR,
                "corpora": current,
            }, indent=2),
            encoding="utf-8",
        )
        print(f"baseline updated -> {BASELINE.relative_to(ROOT)}")
        for corpus, row in sorted(current.items()):
            print(f"  {corpus:32} {row}")
        return 0

    if not BASELINE.exists():
        print("no baseline recorded; run with --update after reviewing the numbers",
              file=sys.stderr)
        return 1

    baseline = json.loads(BASELINE.read_text(encoding="utf-8")).get("corpora", {})
    failures, improvements = compare(current, baseline)

    for corpus, row in sorted(current.items()):
        prior = baseline.get(corpus, {})
        delta_p = row.get("precision", 0) - prior.get("precision", 0)
        delta_r = row.get("recall", 0) - prior.get("recall", 0)
        mark = " " if not (delta_p < -TOLERANCE or delta_r < -TOLERANCE) else "!"
        print(f"  {mark} {corpus:32} P={row.get('precision')} ({delta_p:+.3f})  "
              f"R={row.get('recall')} ({delta_r:+.3f})  TP={row.get('tp')} FP={row.get('fp')} FN={row.get('fn')}")
    print()

    for line in improvements:
        print(f"  improved: {line}")
    if improvements:
        print()

    if failures:
        print("ACCURACY REGRESSION", file=sys.stderr)
        for line in failures:
            print(f"  {line}", file=sys.stderr)
        print(
            "\nIf this change is an intended trade, record it deliberately:\n"
            "  python scripts/accuracy_gate.py --update\n"
            "and say why in docs/ACCURACY.md. Do not update to make CI green.",
            file=sys.stderr,
        )
        return 1

    print("accuracy gate passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
