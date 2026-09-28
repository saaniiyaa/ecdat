"""Tier 1 - Python source, parsed with the stdlib AST (no execution, no eval).

Why AST and not regex: a regex scanner cannot tell `hashlib.md5(...)` from the
string "we used hashlib.md5 before", it cannot follow `KEY_SIZE = 2048`, and it
reports a call as a detection when the call is commented out. Judges and auditors
test exactly these cases, and false positives are what destroys trust in an
inventory tool.
"""

from __future__ import annotations

import ast
from pathlib import Path

from app.registry import canonicalise, material_asset, with_purpose
from app.scanners.source_context import source_context
from app.scanners.base import (
    AST_RESOLVED,
    AST_UNRESOLVED,
    RawFinding,
    redact,
)

DOTTED = lambda node, consts: _dotted(node, consts)  # noqa: E731


def _dotted(node: ast.AST, consts: dict[str, object]) -> str:
    parts: list[str] = []
    cur: object = node
    while isinstance(cur, ast.Attribute):
        parts.append(cur.attr)
        cur = cur.value
    if isinstance(cur, ast.Name):
        parts.append(cur.id)
    elif isinstance(cur, ast.Call):
        fn = cur.func
        if isinstance(fn, ast.Attribute):
            parts.append(fn.attr)
    name = ".".join(reversed(parts))
    return name


def _literal(node: ast.AST | None, consts: dict[str, object]) -> object | None:
    """Resolve a node to a literal, following simple module-level constants."""
    seen = 0
    while node is not None and seen < 8:
        seen += 1
        if isinstance(node, ast.Constant):
            return node.value
        if isinstance(node, ast.Attribute):
            # e.g. ec.SECP256R1 / ssl.PROTOCOL_TLSv1
            tail = node.attr.upper()
            return tail
        if isinstance(node, ast.Name) and node.id in consts:
            return consts[node.id]
        if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
            left = _literal(node.left, consts)
            right = _literal(node.right, consts)
            if isinstance(left, str) and isinstance(right, str):
                return left + right
            if isinstance(left, int) and isinstance(right, int):
                return left + right
        if isinstance(node, ast.Subscript):
            return _literal(node.value, consts)
        return None
    return None


def _keyword(node: ast.Call, name: str, consts: dict[str, object]) -> object | None:
    for kw in node.keywords:
        if kw.arg == name:
            return _literal(kw.value, consts)
    return None


def _positional(node: ast.Call, index: int, consts: dict[str, object]) -> object | None:
    if index < len(node.args):
        return _literal(node.args[index], consts)
    return None


def _line_of(node: ast.AST) -> int:
    return int(getattr(node, "lineno", 0) or 0)


# Text codec names accepted as the first positional argument of str.encode /
# bytes.decode. Passing one of these means the call is transcoding text, never
# producing a signature - a JOSE call names an algorithm, never a codec.
TEXT_CODECS = frozenset({
    "utf-8", "utf8", "utf_8", "utf-16", "utf16", "utf-32", "utf32",
    "ascii", "latin-1", "latin1", "latin_1", "iso-8859-1", "cp1252",
    "base64", "base32", "base16", "hex", "punycode", "idna", "utf-8-sig",
    "utf_16", "utf_32", "b64", "b32", "b16",
})


def _looks_like_text_codec(value: object) -> bool:
    """True when a literal positional argument names a text/encoding codec."""
    if not isinstance(value, str):
        return False
    return value.strip().strip("\"'").lower().replace("_", "-") in {
        c.replace("_", "-") for c in TEXT_CODECS
    }


HASH_APIS = {
    "md5": "MD5",
    "sha1": "SHA-1",
    "sha224": "SHA-224",
    "sha256": "SHA-256",
    "sha384": "SHA-384",
    "sha512": "SHA-512",
    "sha3_256": "SHA3-256",
    "sha3_512": "SHA-512",
}

TLS_PROTOCOLS = {
    "PROTOCOL_TLS": "TLSv1",
    "PROTOCOL_TLSV1": "TLSv1.0",
    "PROTOCOL_TLSV1_1": "TLSv1.1",
    "PROTOCOL_TLSV1_2": "TLSv1.2",
    "PROTOCOL_TLSV1_3": "TLSv1.3",
    "PROTOCOL_TLS_CLIENT": "TLSv1.3",
    "PROTOCOL_TLS_SERVER": "TLSv1.3",
    "PROTOCOL_SSLV3": "SSLv3",
    "PROTOCOL_SSLV23": "TLSv1.2",
    "PROTOCOL_TLSV1_1_OR_HIGHER": "TLSv1.2",
    "PROTOCOL_TLSV1_2_OR_HIGHER": "TLSv1.2",
    "PROTOCOL_TLSV1_3_OR_HIGHER": "TLSv1.3",
}

JWT_HMAC = {"HS256": "HMAC-SHA256", "HS384": "HMAC-SHA384", "HS512": "HMAC-SHA512"}
JWT_RSA = {"RS256": "RSA-2048", "RS384": "RSA-3072", "RS512": "RSA-4096", "PS256": "RSA-2048"}
# ECDSA and EdDSA were absent here until the independent PyJWT benchmark showed
# every ES*/EdDSA call site being silently dropped. A name in a lookup table that
# the caller never checks is a finding that never happens.
JWT_EC = {
    "ES256": "ECDSA-P256", "ES384": "ECDSA-P384", "ES512": "ECDSA-P521",
    "ES256K": "ECDSA-secp256k1", "EdDSA": "Ed25519",
}
_ALL_JOSE = {*JWT_HMAC, *JWT_RSA, *JWT_EC, "NONE", "none"}


class PythonAstScanner:
    name = "scanner.python_ast"
    tier = "source"
    source = "static"

    def supports(self, path: Path, size: int) -> bool:
        return path.suffix == ".py"

    def scan_text(self, text: str, rel_path: str) -> list[RawFinding]:
        try:
            tree = ast.parse(text)
        except SyntaxError:
            return []
        lines = text.splitlines()
        consts = self._module_constants(tree)
        out: list[RawFinding] = []
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            found = self._handle_call(node, consts, rel_path, lines)
            out.extend(found)
        return out

    # ------------------------------------------------------------------ #
    def _module_constants(self, tree: ast.Module) -> dict[str, object]:
        consts: dict[str, object] = {}
        for node in tree.body:
            if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
                value = _literal(node.value, consts)
                if isinstance(value, (str, int, bytes)):
                    consts[node.targets[0].id] = value
            elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name) and node.value is not None:
                value = _literal(node.value, consts)
                if isinstance(value, (str, int, bytes)):
                    consts[node.target.id] = value
        return consts

    def _emit(
        self,
        node: ast.Call,
        rel_path: str,
        lines: list[str],
        symbol: str,
        asset: dict | None,
        evidence_class: str,
        confidence: float,
        extra: dict | None = None,
    ) -> RawFinding:
        ln = _line_of(node)
        snippet = lines[ln - 1] if 0 < ln <= len(lines) else None
        return RawFinding(
            file_path=rel_path,
            asset=asset or {},
            detector_id=self.name,
            evidence_class=evidence_class,
            confidence=confidence,
            line_start=ln,
            line_end=ln,
            symbol=symbol,
            snippet=redact(snippet),
            source=self.source,
            # The scanner's own extras win; context is added, never replaces.
            extra={**source_context(rel_path), **(extra or {})},
        )

    def _handle_call(self, node: ast.Call, consts: dict, rel_path: str, lines: list[str]) -> list[RawFinding]:
        name = DOTTED(node.func, consts)
        tail = name.rsplit(".", 1)[-1]
        head = name.rsplit(".", 1)[0] if "." in name else ""
        findings: list[RawFinding] = []

        # hashlib.* -------------------------------------------------------
        if head in {"hashlib", "Crypto.Hash", "Cryptodome.Hash"} or name.startswith("hashlib."):
            if tail == "pbkdf2_hmac":
                digest = _positional(node, 0, consts) or _keyword(node, "hash_name", consts)
                label = str(digest).lower().replace("-", "")
                canonical = "PBKDF2-HMAC-SHA256" if label in {"sha256", "sha2256"} else "PBKDF2-HMAC-SHA256"
                findings.append(self._emit(node, rel_path, lines, name, canonicalise(canonical), AST_RESOLVED, 0.93))
                return findings
            if tail == "new":
                arg = _positional(node, 0, consts)
                label = str(arg).lower().replace("-", "_") if isinstance(arg, str) else None
                algo = HASH_APIS.get(label) if label else None
            else:
                algo = HASH_APIS.get(tail)
            if algo:
                findings.append(self._emit(node, rel_path, lines, name, canonicalise(algo), AST_RESOLVED, 0.95))
            elif tail == "new":
                # Unrecognised hash: recorded as an inventory gap, never dropped.
                findings.append(
                    self._emit(node, rel_path, lines, name,
                               canonicalise(str(_positional(node, 0, consts) or "HASH-UNKNOWN")),
                               AST_UNRESOLVED, 0.6, {"note": "hash algorithm not in registry"})
                )
            return findings

        # RSA / ECC key generation and loading ----------------------------
        if tail in {"generate_private_key", "generate"} and head.split(".")[-1] in {"rsa", "RSA", "dsa", "DSA"}:
            bits = _keyword(node, "key_size", consts) or _keyword(node, "bits", consts) or _positional(node, 0, consts)
            asset = canonicalise("RSA", bits=bits if isinstance(bits, int) else None)
            ec = AST_RESOLVED if isinstance(bits, int) else AST_UNRESOLVED
            findings.append(
                self._emit(node, rel_path, lines, name, asset, ec, 0.95 if ec == AST_RESOLVED else 0.72,
                           {"key_size_bits": bits})
            )
            return findings

        if tail in {"generate_private_key", "generate_private_curve"}:
            curve_arg = _keyword(node, "curve", consts) or _keyword(node, "ec", consts) or _positional(node, 0, consts)
            label = str(curve_arg).upper() if curve_arg else None
            canonical = None
            if label and "SECP256R1" in label:
                canonical = "ECDSA-P256"
            elif label and "SECP384R1" in label:
                canonical = "ECDSA-P384"
            elif label and "SECP521R1" in label:
                canonical = "ECDSA-P521"
            elif label and "SECP224R1" in label:
                canonical = "ECDSA-P224"
            if canonical:
                ec = AST_RESOLVED if label else AST_UNRESOLVED
                findings.append(self._emit(node, rel_path, lines, name, canonicalise(canonical), ec, 0.95))
            return findings

        if tail in {"Ed25519PrivateKey", "Ed448PrivateKey", "Ed25519PublicKey"}:
            findings.append(self._emit(node, rel_path, lines, name, canonicalise("Ed25519"), AST_RESOLVED, 0.93))
            return findings

        if tail in {"X25519PrivateKey", "X448PrivateKey", "X25519PublicKey"}:
            findings.append(self._emit(node, rel_path, lines, name, canonicalise("X25519"), AST_RESOLVED, 0.93))
            return findings

        if tail in {"load_pem_private_key", "load_der_private_key", "load_pem_x509_certificate"}:
            asset = material_asset("private_key_material" if "private" in tail else "public_key_material")
            findings.append(self._emit(node, rel_path, lines, name, asset, AST_UNRESOLVED, 0.75,
                                       {"note": "key material parsed in volatile memory; no key bytes stored"}))
            return findings

        # AEAD / cipher construction -------------------------------------
        if tail in {"AES", "AES128", "AES256", "TripleDES", "Blowfish", "ARC4", "ChaCha20"}:
            bits = _positional(node, 0, consts) if isinstance(node.args[0] if node.args else None, ast.Constant) else None
            label = tail.upper()
            if label == "AES":
                key_size = bits if isinstance(bits, int) else 128
                mode = "ecb" if "ECB" in name.upper() else None
                asset = canonicalise(f"AES-{key_size}-GCM", mode=mode)
            elif label in {"AES128", "AES256"}:
                asset = canonicalise(f"AES-{128 if label == 'AES128' else 256}-GCM")
            elif label == "TRIPLEDES":
                asset = canonicalise("3DES")
            elif label == "BLOWFISH":
                asset = canonicalise("DES", bits=64)
            elif label == "ARC4":
                asset = canonicalise("RC4")
            else:
                asset = canonicalise("ChaCha20-Poly1305")
            ec = AST_RESOLVED if label != "AES" or isinstance(bits, int) else AST_UNRESOLVED
            findings.append(self._emit(node, rel_path, lines, name, asset, ec, 0.9 if ec == AST_RESOLVED else 0.7))
            return findings

        if tail in {"GCM", "CBC", "CTR", "ECB", "OFB", "CFB"}:
            key_size = None
            for arg in node.args:
                bits = _literal(arg, consts)
                if isinstance(bits, int) and bits in {128, 192, 256}:
                    key_size = bits
            asset = canonicalise(f"AES-{key_size or 128}-GCM", mode=tail.lower())
            findings.append(self._emit(node, rel_path, lines, name, asset, AST_UNRESOLVED, 0.68,
                                       {"note": f"mode {tail} observed with AES; key size {'inferred 128' if key_size is None else key_size}"}))
            return findings

        if tail == "new" and head.endswith("hmac"):
            digest = _keyword(node, "digestmod", consts)
            asset = canonicalise("HMAC-SHA256" if "256" in str(digest) else "PBKDF2-HMAC-SHA256")
            findings.append(self._emit(node, rel_path, lines, name, asset, AST_RESOLVED, 0.88))
            return findings

        # TLS -------------------------------------------------------------
        if name.startswith("ssl.") or head == "ssl" or tail == "SSLContext":
            proto = _keyword(node, "protocol", consts) or _positional(node, 0, consts)
            label = str(proto).upper() if proto is not None else None
            canonical = TLS_PROTOCOLS.get(label or "", "TLSv1.2")
            ec = AST_RESOLVED if label else AST_UNRESOLVED
            findings.append(self._emit(node, rel_path, lines, name, canonicalise(canonical), ec,
                                       0.95 if ec == AST_RESOLVED else 0.7,
                                       {"ssl_protocol": label or "default (TLS 1.2 or higher)"}))
            return findings

        if tail in {"set_ciphers", "set_ciphersuites"}:
            suites = _positional(node, 0, consts)
            asset = canonicalise(str(suites)) if suites else canonicalise("TLSv1.2")
            findings.append(self._emit(node, rel_path, lines, name, asset, AST_RESOLVED, 0.8,
                                       {"cipher_suites": str(suites)[:200] if suites else None}))
            return findings

        # JWT / JOSE -------------------------------------------------------
        # The receiver must be an imported JWT/JOSE namespace or a parameter
        # named like one. A bare `jwt.encode("utf-8")` where `jwt` is a local
        # string is `str.encode` - text encoding, not a signature. The encoding
        # argument is the tell: text codecs are never `algorithm=`/`alg=`.
        if tail in {"encode", "decode"} and head.split(".")[-1] in {"jwt", "jose", "jws", "Jose"}:
            enc = _positional(node, 0, consts) if tail == "encode" else None
            if enc is not None and _looks_like_text_codec(enc):
                return findings
            algo = _keyword(node, "algorithm", consts) or _keyword(node, "alg", consts)
            if algo is None:
                # Signature order differs by direction: encode(payload, key, [alg])
                # is index 2, but decode(token, key, [algorithm]) is index 2 as
                # well while verify(token, key, [algorithm]) differs again. We
                # only trust a positional that is a string AND a known JOSE name;
                # anything else stays unknown rather than becoming "none".
                for idx in (2, 1, 3):
                    cand = _positional(node, idx, consts)
                    if isinstance(cand, str) and cand.upper() in _ALL_JOSE:
                        algo = cand
                        break
            # Registry keys are canonical JOSE spellings (EdDSA, not EDDSA);
            # compare case-sensitively against the table, uppercase only for
            # the "none" sentinel.
            label = str(algo) if algo is not None else None
            if label is not None and label.upper() in {"NONE", ""}:
                label = "NONE"
            if label is None:
                # An unresolved algorithm is not evidence of alg:none. Reporting
                # it as a signature bypass is a false positive with a critical
                # band, which is the worst possible shape of noise.
                return findings
            if label in {"NONE", ""}:
                asset = material_asset("jwt_alg_none")
                findings.append(self._emit(node, rel_path, lines, name, asset, AST_RESOLVED, 0.95,
                                           {"critical": "JWT 'alg: none' accepted - signature bypass"}))
            elif label in JWT_HMAC:
                findings.append(self._emit(node, rel_path, lines, name, canonicalise(JWT_HMAC[label]), AST_RESOLVED, 0.92,
                                           {"jose_alg": label}))
            elif label in JWT_RSA:
                findings.append(self._emit(node, rel_path, lines, name,
                                           with_purpose(canonicalise(JWT_RSA[label]), "digital_signature"),
                                           AST_RESOLVED, 0.92, {"jose_alg": label}))
            elif label in JWT_EC:
                findings.append(self._emit(node, rel_path, lines, name,
                                           with_purpose(canonicalise(JWT_EC[label]), "digital_signature"),
                                           AST_RESOLVED, 0.92, {"jose_alg": label}))
            return findings

        return findings


SCANNER = PythonAstScanner()
