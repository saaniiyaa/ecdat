"""Where a finding lives, and what that means for how much it should count.

A scanner that reports `AES-128` from `src/crypto/aes.py` and `AES-128` from
`tests/test_aes.py` has found two occurrences of the same thing, but they are not
two exposures. Test fixtures pin a weak algorithm *on purpose* - that is how a
regression test for a downgrade guard is written. Counting it as production risk
trains users to ignore the finding list, which is how a real one gets missed.

So the context is not a filter. Nothing is hidden. Every finding carries where it
came from, the risk model reads it, and the API and UI show it. The engineer sees
one list; the triage sees priorities.
"""
from __future__ import annotations

import re

# Directory names that mark a non-production context. Matched as whole path
# segments so `latest/` or `protest/` cannot accidentally trip the rule.
_NON_PRODUCTION_DIRS = frozenset({
    "test", "tests", "testing", "__tests__", "spec", "specs", "testdata",
    "test_data", "fixtures", "fixture", "mocks", "mock", "__mocks__",
    "e2e", "integration_test", "integration_tests", "examples", "example",
    "sample", "samples", "demo", "demos", "benchmark", "benchmarks", "docs",
    "doc", "scripts", "tools", "vendor", "third_party", "build", "dist",
})

# File names that mark a test even outside a test directory.
_NON_PRODUCTION_FILES = re.compile(
    r"(^|[._-])(test|tests|spec|specs|conftest|mock|stub|fixture)([._-]|\.|$)",
    re.I,
)

NON_PRODUCTION = "non_production"
PRODUCTION = "production"
UNKNOWN = "unknown"


def classify_path(rel_path: str) -> str:
    """Classify a repository-relative path as production, test, or unknown."""
    if not rel_path:
        return UNKNOWN
    path = rel_path.replace("\\", "/")
    parts = [p for p in path.split("/") if p and p != "."]
    if not parts:
        return UNKNOWN

    stem = parts[-1]
    for suffix in (".test", ".spec", "_test", "_tests", ".tests"):
        if stem.endswith(suffix):
            return NON_PRODUCTION

    if _NON_PRODUCTION_FILES.search(stem):
        return NON_PRODUCTION

    for segment in parts[:-1]:
        if segment in _NON_PRODUCTION_DIRS:
            return NON_PRODUCTION
    if parts[-2:-1] and parts[-2] in _NON_PRODUCTION_DIRS:
        return NON_PRODUCTION
    return PRODUCTION


def source_context(rel_path: str) -> dict:
    """The `extra` payload every finding carries about its own location."""
    kind = classify_path(rel_path)
    if kind == NON_PRODUCTION:
        note = ("Found in a test, fixture, example, or vendored path. It is a real "
                "occurrence, but a test that pins a weak algorithm is usually "
                "deliberate. Review it, and do not treat it as a production "
                "exposure without confirming it ships.")
    elif kind == PRODUCTION:
        note = None
    else:
        note = None
    return {"source_context": kind, "source_context_note": note}
