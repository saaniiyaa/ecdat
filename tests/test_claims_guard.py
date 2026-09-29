"""The claims guard is itself a claim, so it gets tested.

`scripts/check_claims.py` exists to stop a number in prose from outliving the
measurement behind it. A guard that silently fails to match is worse than no
guard, so each rule is pinned here against a document written to trigger it.
"""
from __future__ import annotations

import importlib.util
import json
import pathlib
import sys

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "check_claims", ROOT / "scripts" / "check_claims.py"
)
cc = importlib.util.module_from_spec(spec)
sys.modules["check_claims"] = cc
spec.loader.exec_module(cc)


# A report with one deliberately imperfect corpus. The measured values are
# precision 0.8, recall 0.5, F1 0.615 - nothing here is 1.0.
REPORT = {
    "independent": {"totals": {"tp": 8, "fp": 2, "fn": 8,
                               "precision": 0.8, "recall": 0.5, "f1": 0.615}},
    "multilang": [{"corpus": "x", "totals": {"tp": 8, "fp": 2, "fn": 8,
                                             "precision": 0.8, "recall": 0.5,
                                             "f1": 0.615}}],
}


def write(tmp_path: pathlib.Path, body: str) -> pathlib.Path:
    p = tmp_path / "doc.md"
    p.write_text(body, encoding="utf-8")
    return p


def test_supported_decimal_is_accepted(tmp_path):
    allowed = cc.measured_values(REPORT)
    p = write(tmp_path, "Measured precision: 0.8 across the corpus.\n")
    assert cc.check(p, allowed) == []


def test_unsupported_decimal_is_rejected(tmp_path):
    allowed = cc.measured_values(REPORT)
    p = write(tmp_path, "Measured precision: 0.99 across the corpus.\n")
    problems = cc.check(p, allowed)
    assert problems and "0.99" in problems[0]


def test_percentage_overstatement_is_rejected(tmp_path):
    """The rule that would have caught "100% precision, recall & F1".

    The float pattern cannot see a percentage - "100%" is not "1.00" - so
    this claim survived a real review cycle in the README while the measured
    aggregate was 0.973 / 0.938.
    """
    allowed = cc.measured_values(REPORT)
    p = write(tmp_path, "Detector F1 100% (100% P/R) on the labelled corpus.\n")
    problems = cc.check(p, allowed)
    assert problems, "a 100% claim must be rejected when nothing measures 1.0"
    assert any("100%" in problem for problem in problems)


def test_percentage_matching_the_measurement_is_accepted(tmp_path):
    allowed = cc.measured_values(REPORT)
    p = write(tmp_path, "Measured precision of 80% on the labelled corpus.\n")
    assert cc.check(p, allowed) == []


def test_badge_url_encoding_is_not_mistaken_for_a_claim(tmp_path):
    """A shields.io badge is percent-encoded; those escapes are not prose.

    The badge text itself is still checked - it is how the real "100%" reached
    the README - but `%20` and `%25` must not be read as percentages.
    """
    allowed = cc.measured_values(REPORT)
    p = write(tmp_path,
              "[![Accuracy](https://img.shields.io/badge/Detector%20F1-0.615"
              "%20(P%2080%25%20R%2050)-brightgreen)](docs/ACCURACY.md)\n")
    assert cc.check(p, allowed) == []


def test_combined_aggregate_f1_is_a_supported_value(tmp_path):
    """A document may quote the F1 of the combined corpora, not just P and R."""
    allowed = cc.measured_values(REPORT)
    tp, fp, fn = 16, 4, 16
    p, r = tp / (tp + fp), tp / (tp + fn)
    f1 = round(2 * p * r / (p + r), 3)
    doc = write(tmp_path, f"Detector F1 {f1} across all corpora.\n")
    assert cc.check(doc, allowed) == []


def test_code_block_output_is_not_checked(tmp_path):
    """A pasted command transcript is the measurement's own text, not a claim."""
    allowed = cc.measured_values(REPORT)
    p = write(tmp_path, "```\nprecision      : 0.99\n```\n")
    assert cc.check(p, allowed) == []


def test_historical_narration_is_exempt(tmp_path):
    """A line that narrates a before/after is supposed to disagree with today."""
    allowed = cc.measured_values(REPORT)
    p = write(tmp_path, "Recall was 0.154 before the scorer fix; it is 0.5 now.\n")
    assert cc.check(p, allowed) == []


def test_stale_test_count_is_rejected(tmp_path, monkeypatch):
    monkeypatch.setattr(cc, "collected_test_count", lambda: 175)
    p = write(tmp_path, "The suite has 162 tests.\n")
    problems = cc.check_test_counts([p])
    assert problems and "162" in problems[0] and "175" in problems[0]


def test_current_test_count_is_accepted(tmp_path, monkeypatch):
    monkeypatch.setattr(cc, "collected_test_count", lambda: 175)
    p = write(tmp_path, "The suite has 175 tests.\n")
    assert cc.check_test_counts([p]) == []
