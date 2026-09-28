#!/usr/bin/env python3
"""Every published number must be a number we measured today.

The accuracy gate proves a detector did not regress. It does not stop a
markdown file from quoting a figure the measurement no longer supports - and
that is the quieter failure, because the number keeps looking authoritative long
after it stopped being true.

This script closes that gap. It reads the machine-written report
(`docs/accuracy_report.json`) and the hand-written documents that quote it, and
fails when a document asserts a precision/recall figure that contradicts the
current measurement.

    python scripts/check_claims.py
    python scripts/check_claims.py --docs docs/ACCURACY.md README.md

How it works
------------
Every "N.NNN" token in a document is treated as a *candidate* claim. A token is
checked only if it is plausibly a detector metric, and it is matched against
the set of values the current measurement actually produced (rounded the same
way). A document quoting a detector metric that the measurement does not
produce is a stale claim, and the build says so.

This is deliberately conservative. It never edits a document and it never
guesses intent - it reports the file, the line and both numbers, and a human
decides. A tool that silently rewrites published claims is a tool nobody should
trust with published claims.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
REPORT = ROOT / "docs" / "accuracy_report.json"
DEFAULT_DOCS = ("docs/ACCURACY.md", "README.md", "frontend/WHAT_REMAINS.md")

# Contexts where a number is a detector metric. Requiring one of these near the
# number is what keeps the checker from flagging a port number or a test count.
METRIC_CONTEXT = re.compile(
    r"(precision|recall|f1|accuracy|F1|score)", re.I
)
# A line that narrates a before/after measurement. Those numbers are supposed to
# disagree with today - a document that quotes only current values has stopped
# being an honest account of how the tool got here.
HISTORICAL = re.compile(
    r"(was|were|previously|before|originally|started at|moved|improved|"
    r"\bfrom\b|->|→|recall 0\.154|0\.154|regression|starting point)",
    re.I,
)
# A three-decimal or two-decimal float.
FLOAT = re.compile(r"(?<![\w.])(\d\.\d{2,3})(?![\w.])")

# Numbers that are measurements but are not detector metrics. Listed so the
# checker knows they are expected to vary and should not be demanded.
KNOWN_MEASUREMENT_PREFIXES = ("coverage",)


def measured_values(report: dict) -> set[float]:
    """Every precision/recall/F1 value the current report actually produced."""
    values: set[float] = set()

    def absorb(totals: dict | None) -> None:
        if not totals:
            return
        for key in ("precision", "recall", "f1", "f1_score"):
            v = totals.get(key)
            if isinstance(v, (int, float)):
                values.add(round(float(v), 3))
                values.add(round(float(v), 2))
        tp, fp, fn = totals.get("tp"), totals.get("fp"), totals.get("fn")
        if None not in (tp, fp, fn):
            if tp + fp:
                values.add(round(tp / (tp + fp), 3))
            if tp + fn:
                values.add(round(tp / (tp + fn), 3))

    absorb(report.get("independent", {}).get("totals"))
    for entry in report.get("multilang", []):
        absorb(entry.get("totals"))

    # The aggregate across every independent corpus, computed identically to
    # scripts/accuracy_gate.py so both tools agree on what "current" means.
    tp = fp = fn = 0
    for entry in [report.get("independent")] + report.get("multilang", []):
        t = (entry or {}).get("totals") or {}
        tp += t.get("tp", 0) or 0
        fp += t.get("fp", 0) or 0
        fn += t.get("fn", 0) or 0
    if tp + fp:
        values.add(round(tp / (tp + fp), 3))
        values.add(round(tp / (tp + fp), 2))
    if tp + fn:
        values.add(round(tp / (tp + fn), 3))
        values.add(round(tp / (tp + fn), 2))
    return values


def check(path: pathlib.Path, allowed: set[float]) -> list[str]:
    problems: list[str] = []
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError as exc:
        return [f"{path.name}: cannot read ({exc})"]

    in_code_block = False
    for number, text in enumerate(lines, start=1):
        stripped = text.strip()
        if stripped.startswith("```"):
            in_code_block = not in_code_block
            continue
        # Code blocks and table separators hold literal command output, which
        # the measurement owns and markdown does not.
        if in_code_block or set(stripped) <= set("-| :"):
            continue
        if not METRIC_CONTEXT.search(text):
            continue
        if HISTORICAL.search(text):
            continue
        for token in FLOAT.finditer(text):
            value = float(token.group(1))
            if round(value, 3) in allowed or round(value, 2) in allowed:
                continue
            problems.append(
                f"{path}:{number}: quotes {value} in a metric context, but the "
                f"current measurement does not produce it"
            )
    return problems


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("docs", nargs="*", help="documents to check")
    args = ap.parse_args()

    if not REPORT.exists():
        print(f"{REPORT.relative_to(ROOT)} missing - run scripts/accuracy_real.py first",
              file=sys.stderr)
        return 1
    report = json.loads(REPORT.read_text(encoding="utf-8"))
    allowed = measured_values(report)
    if not allowed:
        print("report contains no metrics; refusing to check", file=sys.stderr)
        return 1

    targets = [ROOT / d for d in (args.docs or DEFAULT_DOCS)]
    problems: list[str] = []
    for path in targets:
        if path.exists():
            problems.extend(check(path, allowed))

    if problems:
        print("STALE OR UNSUPPORTED CLAIMS", file=sys.stderr)
        for line in problems:
            print(f"  {line}", file=sys.stderr)
        print(
            "\nA detector number in prose that the measurement no longer supports is\n"
            "worse than no number: it looks authoritative and is not. Re-run\n"
            "  python scripts/accuracy_real.py --rescan\n"
            "and correct the document in the same commit.",
            file=sys.stderr,
        )
        return 1

    print(f"claim check passed ({len(targets)} documents, {len(allowed)} measured values)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
