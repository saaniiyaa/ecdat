"""Scanner contract + shared helpers."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterator, Protocol

# Evidence classes, strongest first (see app.registry.POLICY_PACK).
AST_RESOLVED = "AST_RESOLVED"
AST_UNRESOLVED = "AST_UNRESOLVED"
PARSED_STRUCTURE = "PARSED_STRUCTURE"
OBSERVED = "OBSERVED"
PATTERN = "PATTERN"
SYMBOL_INFERRED = "SYMBOL_INFERRED"
DECLARED_ONLY = "DECLARED_ONLY"
INFERRED = "INFERRED"

_LONG_LITERAL = re.compile(r"(['\"])(.{24,}?)\1")
_PEM_PRIVATE = re.compile(r"-{4,}BEGIN [A-Z ]*PRIVATE KEY-{4,}.*?-{4,}END [A-Z ]*PRIVATE KEY-{4,}", re.S)
_BINARY_NOISE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")


@dataclass
class RawFinding:
    """One detected cryptographic use, before persistence."""

    file_path: str
    asset: dict[str, Any]
    detector_id: str
    evidence_class: str
    confidence: float
    line_start: int | None = None
    line_end: int | None = None
    symbol: str | None = None
    snippet: str | None = None
    source: str = "static"
    extra: dict[str, Any] = field(default_factory=dict)


def redact(text: str | None, limit: int = 240) -> str | None:
    """Never persist key material, long literals or binary noise in a snippet."""
    if not text:
        return None
    out = _PEM_PRIVATE.sub("-----REDACTED PRIVATE KEY-----", text)
    out = _LONG_LITERAL.sub(lambda m: f"{m.group(1)}<redacted:{len(m.group(2))}chars>{m.group(1)}", out)
    out = _BINARY_NOISE.sub(" ", out).strip()
    return out[:limit] if out else None


def is_probable_text(path: "Path", head: bytes) -> bool:
    """Null-byte heuristic: a NUL in the first block means 'not source'."""
    return b"\x00" not in head[:8192]


def printable_strings(data: bytes, min_len: int = 4, limit: int = 20000) -> Iterator[str]:
    """Bounded, single-pass ASCII string extraction from binaries."""
    buf = bytearray()
    produced = 0
    for byte in data:
        if 32 <= byte < 127:
            buf.append(byte)
        else:
            if len(buf) >= min_len:
                yield buf.decode("ascii", "ignore")
                produced += 1
                if produced >= limit:
                    return
            buf.clear()
    if len(buf) >= min_len:
        yield buf.decode("ascii", "ignore")


def dotted_name(node: Any, source_text: str) -> str:
    """Best-effort dotted symbol name for an ast expression (no execution)."""
    parts: list[str] = []
    cur = node
    while True:
        if isinstance(cur, ast.Attribute):
            parts.append(cur.attr)
            cur = cur.value
        elif isinstance(cur, ast.Name):
            parts.append(cur.id)
            break
        elif isinstance(cur, ast.Call):
            parts.append(getattr(cur.func, "id", "?"))
            cur = getattr(cur.func, "value", None)
            if cur is None:
                break
        else:
            break
    return ".".join(reversed(parts))


import ast  # noqa: E402  (used by dotted_name; imported late to keep header tidy)


class Scanner(Protocol):
    """Static detector contract. Implementations must be side-effect free."""

    name: str
    tier: str
    source: str

    def supports(self, path: Path, size: int) -> bool: ...

    def scan_text(self, text: str, rel_path: str) -> list[RawFinding]: ...
