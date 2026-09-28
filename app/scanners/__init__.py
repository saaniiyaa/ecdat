"""Scanner registry: which detector owns which surface."""

from __future__ import annotations

from app.scanners import (
    binaries,
    certs,
    configs,
    declarations,
    manifests,
    python_ast,
    source_text,
)
from app.scanners.base import RawFinding, Scanner, is_probable_text

TEXT_SCANNERS: list[Scanner] = [
    python_ast.SCANNER,
    declarations.SCANNER,
    source_text.SCANNER,
    configs.SCANNER,
    certs.SCANNER,
    manifests.SCANNER,
]

BINARY_SCANNER = binaries.SCANNER

SUPPORTED_SUFFIXES: set[str] = set()
for _scanner in TEXT_SCANNERS + [BINARY_SCANNER]:
    SUPPORTED_SUFFIXES.update(
        {".py", ".java", ".kt", ".js", ".ts", ".go", ".cs", ".c", ".h", ".cpp", ".php", ".rb", ".rs",
         ".pem", ".crt", ".cer", ".der", ".key", ".p12", ".csr", ".conf", ".cnf", ".txt", ".json",
         ".mod", ".toml", ".xml", ".gradle", ".lock", ".yaml", ".yml", ".so", ".dll", ".dylib",
         ".exe", ".bin", ".jar", ".a", ".o", ".wasm"}
    )

__all__ = [
    "TEXT_SCANNERS", "BINARY_SCANNER", "SUPPORTED_SUFFIXES", "RawFinding", "Scanner",
    "is_probable_text", "binaries", "certs", "configs", "declarations",
    "manifests", "python_ast", "source_text",
]
