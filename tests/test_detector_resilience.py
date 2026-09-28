"""A detector that crashes must not be silently invisible.

Regression for the worst failure mode this project has: a scan that reports
"no cryptographic declarations" because one detector raised and the exception
was swallowed, rather than because the file genuinely has none. A security tool
that cannot distinguish "I looked and found nothing" from "I failed to look" is
worse than no tool, because the failure is invisible in the output.
"""
from __future__ import annotations

import logging
from pathlib import Path

import pytest

from app.scanners.base import RawFinding
from app.services import scan_runner


class ExplodingScanner:
    name = "scanner.exploding"
    tier = "source"
    source = "static"

    def supports(self, path: Path, size: int) -> bool:
        return path.suffix == ".py"

    def scan_text(self, text: str, rel_path: str) -> list[RawFinding]:
        raise RuntimeError("simulated detector defect")


def _settings(tmp_path: Path):
    from app.config import Settings

    return Settings(database_url=f"sqlite:///{tmp_path / 'ecdat.db'}")


def test_failing_detector_marks_the_surface_partial(tmp_path, monkeypatch):
    root = tmp_path / "repo"
    root.mkdir()
    (root / "app.py").write_text("x = 1\n", encoding="utf-8")

    monkeypatch.setattr(scan_runner, "TEXT_SCANNERS", [ExplodingScanner()])
    record = scan_runner.scan_surface(root / "app.py", "app.py", "code", _settings(tmp_path))

    assert record.state == "partial", (
        "a surface whose detector crashed must never be reported as fully observed"
    )
    assert record.reason and "scanner.exploding" in record.reason
    assert "RuntimeError" in record.reason


def test_failing_detector_is_logged_with_a_traceback(tmp_path, monkeypatch, caplog):
    root = tmp_path / "repo"
    root.mkdir()
    (root / "app.py").write_text("x = 1\n", encoding="utf-8")

    monkeypatch.setattr(scan_runner, "TEXT_SCANNERS", [ExplodingScanner()])
    with caplog.at_level(logging.WARNING, logger="ecdat"):
        scan_runner.scan_surface(root / "app.py", "app.py", "code", _settings(tmp_path))

    assert any("scanner.exploding" in (r.getMessage()) for r in caplog.records), (
        "a detector failure must reach the log, not vanish"
    )


def test_healthy_detector_still_reports_observed(tmp_path, monkeypatch):
    """The guard must not turn every surface partial."""

    class WorkingScanner(ExplodingScanner):
        name = "scanner.working"

        def scan_text(self, text: str, rel_path: str) -> list[RawFinding]:
            return [
                RawFinding(
                    file_path=rel_path,
                    asset={"canonical_name": "SHA-256"},
                    detector_id=self.name,
                    evidence_class="INFERRED",
                    confidence=0.6,
                    line_start=1,
                )
            ]

    root = tmp_path / "repo"
    root.mkdir()
    (root / "app.py").write_text("x = 1\n", encoding="utf-8")

    monkeypatch.setattr(scan_runner, "TEXT_SCANNERS", [WorkingScanner()])
    record = scan_runner.scan_surface(root / "app.py", "app.py", "code", _settings(tmp_path))

    assert record.state == "observed"
    assert record.reason is None
    assert len(record.findings) == 1


def test_one_failing_detector_does_not_discard_a_working_one(tmp_path, monkeypatch):
    class WorkingScanner(ExplodingScanner):
        name = "scanner.working"

        def scan_text(self, text: str, rel_path: str) -> list[RawFinding]:
            return [
                RawFinding(
                    file_path=rel_path,
                    asset={"canonical_name": "HMAC-SHA256"},
                    detector_id=self.name,
                    evidence_class="PARSED_STRUCTURE",
                    confidence=0.9,
                    line_start=2,
                )
            ]

    root = tmp_path / "repo"
    root.mkdir()
    (root / "app.py").write_text("x = 1\ny = 2\n", encoding="utf-8")

    monkeypatch.setattr(scan_runner, "TEXT_SCANNERS", [ExplodingScanner(), WorkingScanner()])
    record = scan_runner.scan_surface(root / "app.py", "app.py", "code", _settings(tmp_path))

    assert [f.asset["canonical_name"] for f in record.findings] == ["HMAC-SHA256"]
    assert record.state == "partial"


# --------------------------------------------------------------------------
# Manifest scope: a lockfile parser must never run on source code
# --------------------------------------------------------------------------
def test_manifest_scanner_ignores_source_files():
    """`for` loops and `hash` fields are not dependencies.

    The lockfile parser used to run on any unrecognised file, so scanning
    golang-jwt produced LIBRARY/for, LIBRARY/hash and LIBRARY/token on ordinary
    Go source. A dependency scanner that invents dependencies is worse than one
    that misses them.
    """
    from app.scanners.manifests import SCANNER

    go = "package main\n\nfor i := 0; i < 3; i++ {\n\thash := sha256.New()\n}\n"
    java = 'String hash = obj.get("hash");\nfor (String k : keys) {}\n'
    assert SCANNER.scan_text(go, "cmd/jwt/main.go") == []
    assert SCANNER.scan_text(java, "Algorithm.java") == []


def test_real_lockfiles_are_still_parsed():
    """The scope fix must not disable the lockfile path entirely."""
    from app.scanners.manifests import SCANNER

    lock = 'pyjwt==2.8.0\njwcrypto==1.5.1\n'
    names = {
        f.asset.get("canonical_name")
        for f in SCANNER.scan_text(lock, "requirements.lock")
    }
    assert any(n and n.startswith("LIBRARY/") for n in names), names


# --------------------------------------------------------------------------
# Comment handling: a comment about a name is not a declaration of it
# --------------------------------------------------------------------------
@pytest.mark.parametrize("line", [
    "\t\tAlg() string  // returns the alg identifier (example: 'HS256')",
    "x := 1  // signs with HmacSHA256",
    "code(); /* TODO: replace RSA with ML-KEM */",
    "// standalone SHA512withRSA",
])
def test_trailing_comments_are_never_scanned(line):
    """Only the line-start anchor was checked, so every trailing comment in
    every language was treated as code."""
    from app.scanners.source_text import _is_comment

    assert _is_comment(line)


def test_hash_in_python_is_modulo_not_a_comment():
    from app.scanners.source_text import _is_comment

    assert not _is_comment("x = a % b  # modulo")
    assert not _is_comment("total = count # items")


def test_url_in_a_string_is_not_a_comment():
    """`"https://..."` contains // but is a value, not a comment."""
    from app.scanners.source_text import _is_comment

    assert not _is_comment('url := "https://example.com"')
    assert _is_comment('url := "https://example.com"  // pinned')
