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
from app.scanners.source_context import source_context

SOURCE_EXTS = {".java", ".kt", ".kts", ".js", ".jsx", ".ts", ".tsx", ".go", ".cs", ".cpp", ".cc", ".c",
               ".h", ".hpp", ".php", ".rb", ".scala", ".swift", ".rs", ".m", ".mm"}

# Transformation strings, e.g. "AES/CBC/PKCS7Padding", "RSA/ECB/OAEPWithSHA-256AndMGF1Padding".
TRANSFORM = re.compile(r"[\"']((?:[A-Za-z0-9]+)/(?:[A-Za-z0-9]+)(?:/[A-Za-z0-9\-\+]+)+)[\"']")
# JCA / JCE standard algorithm names, generalised. The previous list named six
# specific strings (SHA1withRSA, HmacSHA256, ...), which meant a library using
# SHA512withRSA or Ed25519 was invisible. The shape is now the contract: a
# compound provider-style name, not an enumeration of the ones we happened to
# remember. Digests and MACs are matched separately so a bare "SHA-256" in a
# non-crypto context is not treated as a declaration.
JCA_SIG = re.compile(
    r"[\"'](MD5|SHA1|SHA224|SHA256|SHA384|SHA512)with(RSASSA-PSS|RSA|DSA|ECDSA)[\"']",
    re.I,
)
JCA_MAC = re.compile(
    r"[\"'](?:HMAC|Hmac)([A-Za-z]*)SHA(1|224|256|384|512)[\"']", re.I
)
JCA_KDF = re.compile(r"[\"'](?:PBKDF2|PBE)withHmacSHA\d+[\"']", re.I)
JCA_EXPLICIT = re.compile(
    r"[\"'](?:SHA-?1|SHA-?224|SHA-?256|SHA-?384|SHA-?512|MD5)"
    r"|[\"'](?:AES|ARCFOUR|RSA|DES|DESede|Blowfish|ChaCha20|X25519|X448|Ed25519|Ed448)(?:/(?:CTR|GCM|CBC|ECB|OFB|CFB)[^\"']*)?[\"']",
    re.I,
)
# The JCA resolves a primitive at runtime: the class calling getInstance is
# where the algorithm is chosen, even when the name arrives as a variable.
JCA_FACTORY = re.compile(
    r"\b(?:Signature|Mac|KeyFactory|KeyPairGenerator|MessageDigest|Cipher|KeyAgreement)\s*\.\s*getInstance\s*\(",
)
# Legacy algorithms that are unambiguously bad wherever they appear.
LEGACY_TOKEN = re.compile(r"[\"'](?:DES|DESede|RC2|RC4|ARCFOUR|MD2)[\"']")
JOSE_ALG = re.compile(r"[\"'](HS256|HS384|HS512|RS256|RS384|RS512|PS256|ES256|ES384|EdDSA|none)[\"']")
# Go names its digests as crypto package constants, never as strings:
#   SigningMethodHS256 = &SigningMethodHMAC{"HS256", crypto.SHA256}
# The JOSE name and the digest are two halves of one declaration; without this
# the Go tier reported an HMAC with no digest and lost the family entirely.
GO_DIGEST = re.compile(
    r"\bcrypto\s*\.\s*(SHA1|SHA224|SHA256|SHA384|SHA512|MD5|BLAKE2b\w*|SHA3\w*)\b"
)
GO_CRYPTO_CONST = re.compile(
    r"\b(?:crypto|elliptic)\s*\.\s*(P256|P384|P521|Ed25519|X25519)\b"
)

# Resolvers turn a matched JCA token into an ECDAT asset. Split out so the
# mapping is testable on its own rather than buried in the scan loop.
_JCA_SIG = re.compile(r"(MD5|SHA1|SHA224|SHA256|SHA384|SHA512)with(RSASSA-PSS|RSA|DSA|ECDSA)", re.I)
_JCA_MAC = re.compile(r"(?:Hmac|HMAC)([A-Za-z]*)SHA(1|224|256|384|512)", re.I)
_JCA_CIPHER = re.compile(
    r"^(AES|DES|DESede|Blowfish|ARCFOUR|RC4|ChaCha20|GM|GOST|Camellia|SEED|SM4)"
    r"(?:/(CTR|GCM|CBC|ECB|OFB|CFB)(?:/(?:NoPadding|PKCS5Padding|PKCS7Padding))?)?$",
    re.I,
)
_DIGEST_BITS = {"1": "SHA-1", "224": "SHA-224", "256": "SHA-256", "384": "SHA-384", "512": "SHA-512"}


def _resolve_jca_sig(match: re.Match) -> dict | None:
    digest, scheme = match.group(1).upper(), match.group(2).upper()
    bits = _DIGEST_BITS.get(digest.replace("SHA", "") if digest.startswith("SHA") else "")
    if scheme in {"RSA", "DSA"}:
        size = {"SHA-1": "RSA-2048", "SHA-224": "RSA-3072", "SHA-256": "RSA-2048",
                "SHA-384": "RSA-3072", "SHA-512": "RSA-4096"}.get(bits or "", "RSA-2048")
        return with_purpose(canonicalise(size), "digital_signature")
    if scheme == "RSASSA-PSS":
        return with_purpose(canonicalise("RSA-PSS"), "digital_signature")
    if scheme == "ECDSA":
        return with_purpose(
            canonicalise({"SHA-256": "ECDSA-P256", "SHA-384": "ECDSA-P384",
                          "SHA-512": "ECDSA-P521", "SHA-1": "ECDSA-P256"}.get(bits or "", "ECDSA-P256")),
            "digital_signature",
        )
    return None


def _resolve_jca_mac(match: re.Match) -> dict | None:
    bits = _DIGEST_BITS.get(match.group(2), "SHA-256")
    if match.group(1).lower() == "pbkdf2":
        return canonicalise("PBES2")
    return canonicalise(f"HMAC-{bits}")


def _resolve_jca_explicit(match: re.Match) -> dict | None:
    raw = match.group(0).strip("\"'")
    if "/" in raw:
        head, mode = raw.split("/", 1)
        cipher = _JCA_CIPHER.match(head)
        if not cipher:
            return None
        base = cipher.group(1).upper().replace("DESEDE", "3DES").replace("ARCFOUR", "RC4")
        bits = re.search(r"\d{3}", base)
        label = f"{base}-{bits.group(0)}" if bits else base
        mode_token = (cipher.group(2) or "").upper()
        asset = f"{label}-{mode_token}" if mode_token else label
        return with_purpose(canonicalise(asset), "confidentiality")
    if raw.upper() in _DIGEST_BITS.values():
        return canonicalise(raw.upper())
    simple = {"ED25519": "Ed25519", "ED448": "Ed448", "X25519": "X25519", "X448": "X448"}
    if raw.upper() in simple:
        return canonicalise(simple[raw.upper()])
    if re.fullmatch(r"(?:AES|DES|DESede|Blowfish|ARCFOUR|RC4)", raw, re.I):
        return with_purpose(canonicalise(raw.upper().replace("DESEDE", "3DES").replace("ARCFOUR", "RC4")), "confidentiality")
    return None
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
# Trailing comments: `x := 1  // uses HS256` is a comment about HS256, not a
# declaration of it. The previous anchor only matched at line start, so every
# trailing comment in every language was scanned as code - which is how
# golang-jwt's interface documentation ("example: 'HS256'") became a finding.
TRAILING_COMMENT = re.compile(r"//|/\*")


def _is_comment(line: str) -> bool:
    stripped = line.strip()
    if COMMENT.match(line) or stripped.startswith("*") or stripped.startswith("/*"):
        return True
    # A comment introducer appearing after code on the same line. Hash is
    # excluded because Python uses it for the modulo operator, and a bare `#`
    # inside a string literal is not a comment.
    # A comment introducer inside a string literal is not a comment:
    #   url := "https://example.com"
    # would otherwise mark the whole line dead and hide real findings on it.
    outside = _mask_strings(line)
    m = TRAILING_COMMENT.search(outside)
    if m:
        return True
    return False


_STRING_RE = re.compile(r'"(?:[^"\\]|\\.)*"' r"|'(?:[^'\\]|\\.)*'")


def _mask_strings(line: str) -> str:
    """Replace string-literal contents with spaces, preserving offsets."""
    def blank(m: re.Match) -> str:
        return " " * len(m.group(0))
    return _STRING_RE.sub(blank, line)


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
            for pattern, resolver in (
                (JCA_SIG, _resolve_jca_sig),
                (JCA_MAC, _resolve_jca_mac),
                (JCA_KDF, lambda m: "PBES2"),
                (JCA_EXPLICIT, _resolve_jca_explicit),
                (LEGACY_TOKEN, lambda m: m.group(0).strip("\"'").upper()),
            ):
                for match in pattern.finditer(line):
                    asset = resolver(match)
                    if not asset:
                        continue
                    key = (idx, asset["canonical_name"])
                    if key in seen:
                        continue
                    seen.add(key)
                    out.append(self._f(rel_path, asset, idx, match.group(0).strip("\"'"), snippet))

            if JCA_FACTORY.search(line):
                # The JCA resolves the primitive at runtime from a name the
                # caller supplies, so the class calling getInstance is where the
                # algorithm is chosen. Reported as a primitive boundary rather
                # than a named algorithm, at the lowest pattern confidence.
                kind = re.search(r"([A-Za-z]+)\s*\.\s*getInstance", line)
                if kind:
                    owner = {
                        "Signature": "JCA/Signature", "Mac": "JCA/Mac",
                        "KeyFactory": "JCA/KeyFactory", "MessageDigest": "JCA/MessageDigest",
                        "Cipher": "JCA/Cipher", "KeyPairGenerator": "JCA/KeyPairGenerator",
                        "KeyAgreement": "JCA/KeyAgreement",
                    }.get(kind.group(1))
                    if owner:
                        key = (idx, owner)
                        if key not in seen:
                            seen.add(key)
                            out.append(self._f(
                                rel_path,
                                with_purpose(canonicalise(owner), "cryptographic_primitive"),
                                idx, kind.group(1), snippet,
                            ))

            for pattern, family in ((GO_DIGEST, "digest"), (GO_CRYPTO_CONST, "curve")):
                for match in pattern.finditer(line):
                    token = match.group(1)
                    key = token.upper()
                    asset = _DIGEST_BITS.get(key.replace("SHA", ""), None) if family == "digest" else None
                    if family == "digest" and not asset:
                        asset = "BLAKE2" if key.startswith("BLAKE2") else (
                            "SHA-3" if key.startswith("SHA3") else "MD5" if key == "MD5" else None
                        )
                    if family == "curve":
                        asset = {
                            "P256": "ECDSA-P256", "P384": "ECDSA-P384", "P521": "ECDSA-P521",
                            "ED25519": "Ed25519", "X25519": "X25519",
                        }.get(key)
                    if not asset:
                        continue
                    key2 = (idx, asset)
                    if key2 in seen:
                        continue
                    seen.add(key2)
                    out.append(self._f(rel_path, canonicalise(asset), idx, match.group(0), snippet))

            for match in JOSE_ALG.finditer(line):
                alg = match.group(1)
                if alg == "none":
                    asset = canonicalise("JWT-ALG-NONE")
                elif alg.startswith("HS"):
                    # HMAC-SHA256, not HMAC-256: the canonical name must agree
                    # with the JCA and Python tiers or the same algorithm
                    # deduplicates into three separate inventory entries.
                    asset = canonicalise(f"HMAC-SHA{alg[2:]}")
                elif alg.startswith("PS"):
                    asset = with_purpose(canonicalise("RSA-PSS"), "digital_signature")
                elif alg.startswith("RS"):
                    asset = with_purpose(canonicalise("RSA-2048"), "digital_signature")
                elif alg.startswith("ES"):
                    asset = with_purpose(
                        canonicalise({"ES256": "ECDSA-P256", "ES384": "ECDSA-P384",
                                      "ES512": "ECDSA-P521", "ES256K": "ECDSA-secp256k1"}.get(alg, "ECDSA-P256")),
                        "digital_signature",
                    )
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
            # A finding in a test file is real but is not a production
            # exposure. The engine does not drop it - suppressing it would
            # hide a real occurrence - it marks it so the risk model and the
            # UI can say where it came from.
            extra=source_context(rel_path),
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
