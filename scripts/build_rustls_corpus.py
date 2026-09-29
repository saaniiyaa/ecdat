#!/usr/bin/env python3
"""Build the rustls fixture from a verified upstream checkout.

The corpus follows the same convention as every other corpus in this project:
shipped, non-test source only. rustls keeps its unit tests inline in
`#[cfg(test)] mod tests { ... }` blocks, which are stripped here.

Provenance is preserved rather than lost: the sha256 of every *original*
upstream file is recorded in .upstream_hashes.json alongside the upstream
commit, so anyone can verify this corpus was derived from exactly that tree.
"""
from __future__ import annotations

import hashlib
import json
import pathlib
import re
import sys

UPSTREAM_COMMIT = "99f2358cae2954837dbb866faf6727de75489ab9"

FILES = [
    "rustls/src/crypto/hash.rs",
    "rustls/src/crypto/hmac.rs",
    "rustls/src/crypto/tls13.rs",
    "rustls-ring/src/hash.rs",
    "rustls-ring/src/hmac.rs",
    "rustls-ring/src/sign.rs",
    "rustls-ring/src/tls12.rs",
    "rustls-ring/src/tls13.rs",
]

# `#[cfg(test)]` immediately followed by `mod <name> {` opens a test block that
# runs to the matching closing brace. We track brace depth from the module's
# opening brace, ignoring braces inside strings, chars and comments.
TEST_MOD = re.compile(r"^\s*#\[cfg\(test\)\]")


def strip_test_modules(text: str) -> tuple[str, int]:
    """Remove whole `#[cfg(test)] mod ... { }` blocks. Returns (text, n_removed)."""
    lines = text.splitlines(keepends=True)
    out: list[str] = []
    removed = 0
    i = 0
    n = len(lines)
    while i < n:
        if not TEST_MOD.match(lines[i]):
            out.append(lines[i])
            i += 1
            continue
        # Look ahead for the `mod name {` line, allowing attributes/other cfg
        # lines and a doc comment in between.
        j = i
        while j < n and not re.match(r"\s*(pub\s+)?mod\s+\w+\s*\{", lines[j]):
            if re.match(r"\s*(pub\s+)?(struct|enum|fn|const|static)\b", lines[j]):
                j = None  # not a test module; keep everything from here on
                break
            j += 1
        if j is None or j >= n:
            out.append(lines[i])
            i += 1
            continue
        # Consume from the attribute through the module's closing brace.
        depth = 0
        started = False
        k = j
        while k < n:
            stripped = _strip_literals_and_comments(lines[k])
            for ch in stripped:
                if ch == "{":
                    depth += 1
                    started = True
                elif ch == "}":
                    depth -= 1
            k += 1
            if started and depth <= 0:
                break
        removed += 1
        out.append("// [ecdat fixture] a cfg(test) module was removed from this "
                   "position; see .upstream_hashes.json for the original file\n")
        i = k
    return "".join(out), removed


_STR = re.compile(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|//.*$|#\[.*?\]$', re.M)


def _strip_literals_and_comments(line: str) -> str:
    return _STR.sub(" ", line)


def main() -> int:
    src = pathlib.Path(sys.argv[1])
    dst = pathlib.Path(sys.argv[2])
    hashes: dict[str, str] = {}
    summary: dict[str, dict] = {}

    for rel in FILES:
        original = (src / rel).read_bytes()
        hashes[rel] = hashlib.sha256(original).hexdigest()
        text, removed = strip_test_modules(original.decode("utf-8"))
        out = dst / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(text, encoding="utf-8")
        summary[rel] = {
            "upstream_lines": original.decode("utf-8").count("\n"),
            "fixture_lines": text.count("\n"),
            "test_modules_removed": removed,
        }
        print(f"  {rel:32} {summary[rel]['upstream_lines']:4} -> "
              f"{summary[rel]['fixture_lines']:4} lines  ({removed} test module(s) removed)")

    (dst / ".upstream_commit").write_text(UPSTREAM_COMMIT + "\n", encoding="utf-8")
    (dst / ".upstream_hashes.json").write_text(
        json.dumps({
            "upstream": "https://github.com/rustls/rustls",
            "upstream_commit": UPSTREAM_COMMIT,
            "note": "sha256 of the ORIGINAL upstream files, before #[cfg(test)] "
                    "modules were stripped for the non-test corpus convention.",
            "files": hashes,
        }, indent=1) + "\n",
        encoding="utf-8",
    )
    (dst / ".corpus_build.json").write_text(json.dumps(summary, indent=1) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
