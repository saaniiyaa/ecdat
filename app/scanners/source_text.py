"""Tier 1 - polyglot source, anchored pattern detection (Java, JS/TS, Go, C#, C, PHP, Ruby).

This scanner is intentionally conservative: it only matches API call shapes and
transformation strings that appear verbatim in code, it skips comment-only lines,
and every finding it emits is capped at the `high` band by the policy pack
(evidence class PATTERN) - a textual match can never, on its own, be reported as
Critical. Python is excluded: `scanner.python_ast` is authoritative there and
double-counting would inflate the inventory.
"""

from __future__ import annotations

import re
from pathlib import Path

from app.registry import canonicalise, library_asset, with_purpose
from app.scanners.base import PATTERN, RawFinding, redact

SOURCE_EXTS = {".java", ".kt", ".kts", ".js", ".jsx", ".ts", ".tsx", ".go", ".cs", ".cpp", ".cc", ".c",
               ".h", ".hpp", ".php", ".rb", ".scala", ".swift", ".rs", ".m", ".mm"}

# Transformation strings, e.g. "AES/CBC/PKCS7Padding", "RSA/ECB/OAEPWithSHA-256AndMGF1Padding".
TRANSFORM = re.compile(r"[\"']((?:[A-Za-z0-9]+)/(?:[A-Za-z0-9]+)(?:/[A-Za-z0-9\-\+]+)+)[\"']")
# Algorithm-identifier strings, e.g. "SHA1withRSA", "EC", "RSA", "HmacSHA256".
ALGO_TOKEN = re.compile(
    r"[\"'](SHA1withRSA|SHA256withRSA|SHA256withECDSA|SHA512withECDSA|MD5withRSA|HmacSHA256|"
    r"RSA/ECB/PKCS1Padding|RSA/ECB/OAEPWithSHA-256AndMGF1Padding|NoPadding)[\"']",
    re.I,
)
JOSE_ALG = re.compile(r"[\"'](HS256|HS384|HS512|RS256|RS384|RS512|PS256|ES256|ES384|EdDSA|none)[\"']")
KEY_SIZE = re.compile(r"[\"']?(key_size|keySize|keysize|KEY_SIZE|keyLength|key_length)[\"']?\s*[:=]\s*(\d{3,4})")
CURVE = re.compile(r"[\"']?(secp256r1|secp384r1|secp521r1|prime256v1|curve25519|x25519|P-256|P-384)[\"']?", re.I)
TLS_OLD = re.compile(r"[\"']?(TLSv1(?:\.\d)?|SSLv3|SSLv2)[\"']?")
# Java/C# style key sizing: KeyPairGenerator.getInstance("RSA"); g.initialize(1024)
INIT_SIZE = re.compile(r"(?:initialize|generateKey|Init)\s*\(\s*(\d{3,4})\s*\)")
RSA_CONTEXT = re.compile(r"RSA|DSA|KeyPairGenerator|KeyGenerator|CryptoServiceProvider|ECDsa", re.I)
# Non-cryptographic RNG use. `new SecureRandom()` is deliberately NOT matched.
RANDOM = re.compile(r"(?<!Secure)\b(random\.random|Math\.random|rand\(\)|srand\(|rand_seed|new\s+Random\s*\(|"
                    r"RandomNumberGenerator\.getInstance\(\s*\)|new\s+Random\s*\(\s*\d*\s*\))")
COMMENT = re.compile(r"^\s*(//|#|\*|/\*)")


def _is_comment(line: str) -> bool:
    return bool(COMMENT.match(line)) or line.strip().startswith("*")


class SourceTextScanner:
    name = "scanner.source_text"
    tier = "source"
    source = "static"

    def supports(self, path: Path, size: int) -> bool:
        return path.suffix.lower() in SOURCE_EXTS

    def scan_text(self, text: str, rel_path: str) -> list[RawFinding]:
        out: list[RawFinding] = []
        seen: set[tuple[int, str]] = set()
        lines = text.splitlines()

        # Key-generation context is often split across lines:
        #   KeyPairGenerator g = KeyPairGenerator.getInstance("RSA");
        #   g.initialize(1024);
        # so we widen the context window rather than demanding a single line.
        rsa_lines: set[int] = set()
        for idx, line in enumerate(lines, start=1):
            if RSA_CONTEXT.search(line):
                rsa_lines.update(range(max(1, idx - 5), idx + 6))

        for idx, line in enumerate(lines, start=1):
            if _is_comment(line):
                continue
            snippet = redact(line.strip())
            for match in TRANSFORM.finditer(line):
                asset = canonicalise(match.group(1))
                if not asset:
                    continue
                key = (idx, asset["canonical_name"])
                if key in seen:
                    continue
                seen.add(key)
                out.append(self._f(rel_path, asset, idx, match.group(0).strip("\"'"), snippet))
            for match in ALGO_TOKEN.finditer(line):
                raw_name = match.group(1)
                name = raw_name.upper()
                if name.startswith(("SHA", "MD5")) and re.search(r"with", raw_name, re.I):
                    sig = re.split(r"with", raw_name, flags=re.I)[-1].upper()
                    asset = with_purpose(canonicalise(f"{sig}-2048" if sig == "RSA" else f"ECDSA-P256"), "digital_signature")
                elif name == "HMACSHA256":
                    asset = canonicalise("HMAC-SHA256")
                elif name.startswith("RSA/"):
                    asset = with_purpose(canonicalise("RSA-2048"), "key_establishment")
                else:
                    asset = canonicalise(name)
                if not asset:
                    continue
                key = (idx, asset["canonical_name"])
                if key in seen:
                    continue
                seen.add(key)
                out.append(self._f(rel_path, asset, idx, name, snippet))

            for match in JOSE_ALG.finditer(line):
                alg = match.group(1)
                if alg == "none":
                    asset = canonicalise("JWT-ALG-NONE")
                elif alg.startswith("HS"):
                    asset = canonicalise(f"HMAC-{alg[2:]}")
                elif alg.startswith(("RS", "PS")):
                    asset = with_purpose(canonicalise("RSA-2048"), "digital_signature")
                elif alg.startswith("ES"):
                    asset = with_purpose(canonicalise("ECDSA-P256"), "digital_signature")
                else:
                    asset = with_purpose(canonicalise("Ed25519"), "digital_signature")
                key = (idx, asset["canonical_name"])
                if key in seen:
                    continue
                seen.add(key)
                out.append(self._f(rel_path, asset, idx, f"jose alg {alg}", snippet))

            for match in KEY_SIZE.finditer(line):
                bits = int(match.group(2))
                if bits in {1024, 2048, 3072, 4096}:
                    asset = canonicalise(f"RSA-{bits}")
                    key = (idx, asset["canonical_name"])
                    if key in seen:
                        continue
                    seen.add(key)
                    out.append(self._f(rel_path, asset, idx, f"key size {bits}", snippet))

            if idx in rsa_lines:
                for match in INIT_SIZE.finditer(line):
                    bits = int(match.group(1))
                    if bits in {1024, 2048, 3072, 4096}:
                        asset = canonicalise(f"RSA-{bits}")
                        key = (idx, asset["canonical_name"])
                        if key in seen:
                            continue
                        seen.add(key)
                        out.append(self._f(rel_path, asset, idx, f"key size {bits}", snippet))

            for match in CURVE.finditer(line):
                token = match.group(1).lower()
                asset = canonicalise("X25519" if token in {"curve25519", "x25519"} else
                                     {"p-256": "ECDSA-P256", "prime256v1": "ECDSA-P256"}.get(token, token))
                if not asset:
                    continue
                key = (idx, asset["canonical_name"])
                if key in seen:
                    continue
                seen.add(key)
                out.append(self._f(rel_path, asset, idx, match.group(1), snippet))

            for match in TLS_OLD.finditer(line):
                asset = canonicalise(match.group(1))
                if not asset:
                    continue
                key = (idx, asset["canonical_name"])
                if key in seen:
                    continue
                seen.add(key)
                out.append(self._f(rel_path, asset, idx, match.group(1), snippet))

            if RANDOM.search(line):
                asset = {
                    "canonical_name": "NON-CSPRNG", "oid": None, "asset_type": "related_crypto_material",
                    "family": "PRNG", "primitive": "rng", "purpose": "randomness",
                    "key_size_bits": None, "curve": None, "mode": None, "padding": None,
                    "classical_security_bits": 0, "quantum_security_bits": 0, "quantum_status": "unknown",
                    "is_post_quantum": False, "nist_deprecated_after": None, "nist_disallowed_after": None,
                    "replacement_hint": "use a CSPRNG (hashlib/os.urandom/SecureRandom)",
                    "registry_source": "ecdat-policy-pack", "meta": {"rng": True},
                }
                key = (idx, "NON-CSPRNG")
                if key not in seen:
                    seen.add(key)
                    out.append(self._f(rel_path, asset, idx, "non-cryptographic RNG", snippet,
                                       confidence=0.7, evidence=PATTERN))

            for match in re.finditer(r"(?:require\(|import\s+|from\s+|using\s+)[\"']([\w\.\-]+)[\"']", line):
                lib = match.group(1).split("/")[-1] if "/" in match.group(1) else match.group(1)
                asset = library_asset(lib, None, False)
                key = (idx, asset["canonical_name"])
                if key in seen:
                    continue
                seen.add(key)
                out.append(self._f(rel_path, asset, idx, lib, snippet, confidence=0.65, evidence="DECLARED_ONLY"))
        return out

    def _f(self, rel_path: str, asset: dict, line: int, symbol: str, snippet: str | None,
           confidence: float = 0.75, evidence: str = PATTERN) -> RawFinding:
        return RawFinding(
            file_path=rel_path,
            asset=asset,
            detector_id=self.name,
            evidence_class=evidence,
            confidence=confidence,
            line_start=line,
            line_end=line,
            symbol=symbol[:120],
            snippet=snippet,
            source=self.source,
        )


SCANNER = SourceTextScanner()
