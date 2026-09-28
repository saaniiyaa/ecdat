"""Configuration-surface crypto detection.

Motivation
----------
Measured against an independently labelled corpus (PyJWT 2.8.0 shipped source,
`fixtures/pyjwt_repo/GROUND_TRUTH.json`) the call-expression detectors achieve
0.154 recall. The misses are not sloppy patterns - they are a different way of
declaring cryptography that no call-based scanner can see:

    get_default_algorithms():
        return {
            "RS256": RSAAlgorithm(RSAAlgorithm.SHA256),   # a table entry
            "PS512": RSAPSSAlgorithm(RSAPSSAlgorithm.SHA512),
            "ES256": ECAlgorithm(ECAlgorithm.SHA256, SECP256R1),
        }

    class HMACAlgorithm(Algorithm):
        SHA256: ClassVar[HashlibHash] = hashlib.sha256    # a class attribute

Nothing *calls* "RS256". Something *names* it, and the name is the entire
cryptographic contract of the application. In a JWT library, that dictionary is
the security policy; a scanner that cannot read it has not read the program.

So this module resolves declarations, in three shapes:

1. JOSE algorithm registries - a dict literal whose keys are JOSE algorithm
   names (RS256, ES512, PS384, EdDSA, HS256, ...) and whose values mention the
   family constructor.
2. Class-level hash bindings - `SHA256: ClassVar[...] = hashlib.sha256`.
3. Key/digest constant tables - `CIPHERS = {"aes-256-gcm": ...}` and similar.

Every finding is emitted at INFERRED confidence, never PARSED_STRUCTURE: a
declaration is strong evidence of a *policy*, weaker evidence of a *reachable
call site*, and the evidence class is exactly the mechanism that says so. A
declaration that later turns out to be dead code is a low-risk finding, which is
why this is the right trade: we accept some over-reporting in exchange for
closing an 85% recall gap on configuration-driven code.

This is a *recall* tier. It deliberately overlaps the call detectors; the risk
service de-duplicates on (algorithm, file) when building the inventory, so a
surface that is both called and declared is reported once with the stronger of
the two evidence classes.
"""
from __future__ import annotations

import ast
import re
from pathlib import Path

from app.registry import canonicalise, with_purpose
from app.scanners.base import INFERRED, RawFinding, redact

INFERRED = "INFERRED"

# JOSE (RFC 7518) registered algorithm names -> canonical ECDAT asset.
JOSE_ALGORITHMS: dict[str, str] = {
    # HMAC with SHA
    "HS256": "HMAC-SHA256", "HS384": "HMAC-SHA384", "HS512": "HMAC-SHA512",
    # RSASSA-PKCS1-v1_5
    "RS256": "RSA-2048", "RS384": "RSA-2048", "RS512": "RSA-2048",
    # RSASSA-PSS
    "PS256": "RSA-PSS", "PS384": "RSA-PSS", "PS512": "RSA-PSS",
    # ECDSA
    "ES256": "ECDSA-P256", "ES384": "ECDSA-P384", "ES512": "ECDSA-P521",
    "ES256K": "ECDSA-secp256k1",
    # EdDSA
    "EdDSA": "Ed25519", "EDDSA": "Ed25519",
    # Key management
    "dir": "DIRECT", "A128KW": "AES-128-KW", "A192KW": "AES-192-KW",
    "A256KW": "AES-256-KW", "A128GCMKW": "AES-128-GCM", "A256GCMKW": "AES-256-GCM",
    "RSA-OAEP": "RSA-OAEP", "RSA-OAEP-256": "RSA-OAEP",
    "PBES2-HS256+A128KW": "PBES2", "PBES2-HS384+A192KW": "PBES2",
    "PBES2-HS512+A256KW": "PBES2", "ECDH-ES": "ECDH", "ECDH-ES+A128KW": "ECDH",
    "ECDH-ES+A256KW": "ECDH",
    # none
    "none": "JWT-ALG-NONE", "None": "JWT-ALG-NONE",
}

# The family constructor a JOSE name implies. Used to confirm that a table entry
# is cryptographic configuration rather than an unrelated constant map.
FAMILY_HINTS: dict[str, tuple[str, ...]] = {
    "HMAC-SHA256": ("hmac", "hmacalgorithm"),
    "HMAC-SHA384": ("hmac",),
    "HMAC-SHA512": ("hmac",),
    "RSA-2048": ("rsaalgorithm", "rsa"),
    "RSA-PSS": ("rsapssalgorithm", "rsa"),
    "RSA-OAEP": ("rsaalgorithm", "rsa"),
    "ECDSA-P256": ("ecalgorithm", "ec"),
    "ECDSA-P384": ("ecalgorithm", "ec"),
    "ECDSA-P521": ("ecalgorithm", "ec"),
    "ECDSA-secp256k1": ("ecalgorithm", "ec"),
    "Ed25519": ("okpalgorithm", "ed25519", "eddsa"),
    "ECDH": ("ecdhalgorithm", "ecdh"),
    "AES-256-KW": ("aesalgorithm", "aes"),
    "AES-128-KW": ("aesalgorithm", "aes"),
    "PBES2": ("pbes2",),
}

HASH_FUNCS: dict[str, str] = {
    "sha256": "SHA-256", "sha384": "SHA-384", "sha512": "SHA-512",
    "sha1": "SHA-1", "md5": "MD5", "sha224": "SHA-224",
    "sha3_256": "SHA3-256", "sha3_512": "SHA3-512", "blake2b": "BLAKE2b-512",
}

# JCA / JCE standard algorithm names (Java, and anything else that names a
# provider by string). The same declaration trick as JOSE: a library says
# "SHA256withRSA" as a string and lets the provider pick the primitive, so the
# only place the algorithm exists is the literal.
JCA_NAMES: dict[str, str] = {
    # signatures
    "sha1withrsa": "RSA-2048", "sha256withrsa": "RSA-2048",
    "sha384withrsa": "RSA-3072", "sha512withrsa": "RSA-4096",
    "sha1witherca": "ECDSA-P256", "sha256withecdsa": "ECDSA-P256",
    "sha384withecdsa": "ECDSA-P384", "sha512withecdsa": "ECDSA-P521",
    "rsassa-pss": "RSA-PSS", "md5withrsa": "RSA-2048",
    "nonewithrsa": "RSA-2048", "nonewithecdsa": "ECDSA-P256",
    # digests
    "sha-256": "SHA-256", "sha-384": "SHA-384", "sha-512": "SHA-512",
    "sha-1": "SHA-1", "md5": "MD5",
    # mac / kdf
    "hmacsha256": "HMAC-SHA256", "hmacsha384": "HMAC-SHA384",
    "hmacsha512": "HMAC-SHA512", "hmacsha1": "HMAC-SHA1",
    "pbkdf2withhmacsha256": "PBES2", "pbkdf2withhmacsha512": "PBES2",
    # symmetric
    "aes/ctr/nopadding": "AES-CTR", "aes/gcm/nopadding": "AES-GCM",
    "aes/cbc/pkcs5padding": "AES-CBC", "chacha20-poly1305": "ChaCha20-Poly1305",
    "ed25519": "Ed25519", "ed448": "Ed448",
    # key agreement
    "ecdh": "ECDH", "x25519": "X25519", "x448": "X448",
    # transports
    "tls": "TLS", "ssl": "TLS", "tlsv1.2": "TLS", "tlsv1.3": "TLS",
}

CIPHER_TOKENS: dict[str, str] = {
    "aes-256-gcm": "AES-256-GCM", "aes-128-gcm": "AES-128-GCM",
    "aes-256-cbc": "AES-256-CBC", "aes-128-cbc": "AES-128-CBC",
    "chacha20-poly1305": "ChaCha20-Poly1305", "chacha20": "ChaCha20",
    "xchacha20-poly1305": "XChaCha20-Poly1305",
    "3des": "3DES", "des": "DES", "rc4": "RC4",
}

_HMAC_KW = re.compile(r"\bhmac\b", re.I)
_PYJWT = re.compile(r"\b(pyjwt|jose|jwt|authlib|jwcrypto|joserfc)\b", re.I)
_DECL_NAME = re.compile(r"(algorithm|cipher|hash|kdf|key_size|suite|provider|policy)", re.I)
# Unambiguous HTTPS client entry points, matched against the FULL dotted name.
# `.get(` is excluded deliberately: it is a dict lookup in almost every case,
# and matching it turned every options.get() into a TLS finding.
_HTTPS_CALL = re.compile(
    r"(?:urllib\.request\.urlopen|requests\.(?:get|post|put|delete|head|patch)"
    r"|httpx\.(?:get|post|put|delete|head|patch)|aiohttp\.\w+|urlopen)",
    re.I,
)

_PURPOSES = {
    "RSA-2048": "digital_signature", "RSA-PSS": "digital_signature",
    "ECDSA-P256": "digital_signature", "ECDSA-P384": "digital_signature",
    "ECDSA-P521": "digital_signature", "ECDSA-secp256k1": "digital_signature",
    "Ed25519": "digital_signature", "HMAC-SHA256": "message_authentication",
    "HMAC-SHA384": "message_authentication", "HMAC-SHA512": "message_authentication",
    "AES-256-GCM": "confidentiality", "AES-128-GCM": "confidentiality",
    "AES-256-CBC": "confidentiality", "AES-128-CBC": "confidentiality",
    "ChaCha20-Poly1305": "confidentiality", "XChaCha20-Poly1305": "confidentiality",
    "ECDH": "key_agreement", "PBES2": "key_derivation", "DIRECT": "key_agreement",
    "3DES": "confidentiality", "DES": "confidentiality",
}


def _purpose_for(asset: str) -> str | None:
    return _PURPOSES.get(asset)


def _line(node: ast.AST) -> int:
    return int(getattr(node, "lineno", 0) or 0)


def _dotted(node: ast.AST) -> str:
    """Best-effort dotted name for an expression, e.g. `hashlib.sha256`."""
    parts: list[str] = []
    cur = node
    while isinstance(cur, ast.Attribute):
        parts.append(cur.attr)
        cur = cur.value
    if isinstance(cur, ast.Name):
        parts.append(cur.id)
    return ".".join(reversed(parts))


class DeclarationScanner:
    """Resolve cryptographic *declarations* in Python source."""

    name = "scanner.declarations"
    tier = "source"
    source = "static"

    def supports(self, path: Path, size: int) -> bool:
        return path.suffix == ".py"

    def scan_text(self, text: str, rel_path: str) -> list[RawFinding]:
        if not rel_path.endswith(".py"):
            return []
        try:
            tree = ast.parse(text)
        except SyntaxError:
            return []

        lines = text.splitlines()
        # A JOSE table only counts as such when the file is a JOSE/JWT
        # implementation, or the table is named like one. Otherwise every
        # {"name": value} dict in a codebase becomes a false positive.
        jose_context = bool(_PYJWT.search(rel_path)) or bool(
            re.search(r"\b(jwt|jose)\b", text[:4000], re.I)
        )
        # Broader crypto context, used by the JCA tier: a Java/JS file that
        # imports javax.crypto, java.security or a JOSE library is a crypto file
        # even when it is not literally named jwt.
        crypto_context = jose_context or bool(
            re.search(r"(javax\.crypto|java\.security|\bcrypto\.|nacl|webcrypto|node:crypto)", text[:6000])
        )

        out: list[RawFinding] = []
        seen: set[tuple[str, int]] = set()

        def add(asset: str, node: ast.AST, why: str, conf: float = 0.62) -> None:
            key = (asset, _line(node))
            if key in seen:
                return
            seen.add(key)
            ln = _line(node)
            snippet = lines[ln - 1] if 0 < ln <= len(lines) else None
            out.append(
                RawFinding(
                    file_path=rel_path,
                    asset=with_purpose(canonicalise(asset), _purpose_for(asset)),
                    detector_id=self.name,
                    evidence_class=INFERRED,
                    confidence=conf,
                    line_start=ln,
                    line_end=ln,
                    symbol=asset,
                    snippet=redact(snippet),
                    source="static",
                    extra={"declaration": why},
                )
            )

        for node in ast.walk(tree):
            # -- 1. JOSE algorithm registries -------------------------------
            if isinstance(node, ast.Dict) and node.keys:
                self._scan_jose_dict(node, jose_context, add)

            # -- 2. class-level / module-level hash bindings ----------------
            if isinstance(node, (ast.Assign, ast.AnnAssign)):
                self._scan_assignment(node, add)

            # -- 3. call sites for named hash/cipher constructors ----------
            if isinstance(node, ast.Call):
                self._scan_call(node, add)
                self._scan_jca_factory(node, add)

            # -- 4. JCA/JCE standard algorithm names as string literals ----
            if isinstance(node, ast.Constant) and isinstance(node.value, str):
                self._scan_jca_literal(node, add, crypto_context)

        return out

    def _scan_jca_factory(self, node: ast.Call, add) -> None:
        """`Signature.getInstance(name)` / `Mac.getInstance(name)` / KeyFactory.

        The JCA resolves the primitive at runtime from a name the caller
        supplies, so the class that calls getInstance is where the algorithm
        is chosen. Emitted at lower confidence than a literal: the name may
        arrive as a variable from a caller we cannot see, in which case this is
        the *use site* of a cryptographic primitive rather than its declaration.
        Either way it is a genuine cryptographic boundary worth reporting.
        """
        fn = _dotted(node.func)
        leaf = fn.rsplit(".", 1)[-1]
        if leaf not in {"getInstance", "getInstanceOrNull"}:
            return
        owner = fn.rsplit(".", 2)[-2] if "." in fn else ""
        if owner not in {"Signature", "Mac", "KeyFactory", "KeyPairGenerator",
                         "MessageDigest", "Cipher", "KeyAgreement"}:
            return
        arg = node.args[0] if node.args else None
        name = None
        if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
            name = arg.value
        if name:
            key = name.strip().lower().replace("_", "-")
            asset = JCA_NAMES.get(key) or JCA_NAMES.get(key.replace("-", ""))
            if asset:
                add(asset, node, f"{fn}({name!r}) - JCA primitive resolution", conf=0.6)
                return
        # Resolved from a variable: still a cryptographic primitive boundary.
        default = {
            "Signature": "digital_signature", "Mac": "message_authentication",
            "MessageDigest": "hash", "Cipher": "confidentiality",
            "KeyFactory": "key_material", "KeyPairGenerator": "key_generation",
            "KeyAgreement": "key_agreement",
        }.get(owner, "cryptographic_primitive")
        add(
            f"JCA/{owner}",
            node,
            f"{fn} with a runtime-supplied algorithm name - "
            f"{default.replace('_', ' ')} primitive boundary",
            conf=0.5,
        )

    def _scan_jca_literal(self, node: ast.Constant, add, crypto_context: bool) -> None:
        """A JCA name in a string is a cryptographic declaration.

        Java libraries build algorithms as `new RSAAlgorithm("RS256",
        "SHA256withRSA", provider)`. The only record that SHA256withRSA is in
        use is the string literal, and the primitive is chosen by the JCA
        provider at runtime. Requires the literal to look like a JCA name
        (compound, provider-style) so ordinary English strings stay silent.
        """
        raw = node.value
        key = raw.strip().lower().replace("_", "-")
        asset = JCA_NAMES.get(key) or JCA_NAMES.get(key.replace("-", ""))
        if not asset:
            return
        # Single common words only qualify inside a crypto-flavoured file.
        if len(key) < 6 and not crypto_context:
            return
        add(asset, node, f"JCA standard algorithm name {raw!r}", conf=0.62)

    # -- handlers --------------------------------------------------------
    def _scan_jose_dict(self, node: ast.Dict, jose_context: bool, add) -> None:
        hits: list[str] = []
        families: set[str] = set()
        for key, value in zip(node.keys, node.values):
            if not (isinstance(key, ast.Constant) and isinstance(key.value, str)):
                continue
            name = key.value
            if name not in JOSE_ALGORITHMS:
                continue
            asset = JOSE_ALGORITHMS[name]
            if value is not None:
                families.add(_dotted(value).split(".")[-1].lower())
            hits.append((name, asset))
        if not hits:
            return

        # Require corroboration: either a JOSE-flavoured file, or the value
        # expressions name a recognised family constructor.
        if not jose_context and not (families & {h for hs in FAMILY_HINTS.values() for h in hs}):
            return

        # One finding per distinct asset; a table of 12 algorithms is 4
        # cryptographic surfaces, not 12.
        by_asset: dict[str, ast.AST] = {}
        for name, asset in hits:
            by_asset.setdefault(asset, node)
        for asset, anchor in by_asset.items():
            names = [n for n, a in hits if a == asset]
            add(
                asset,
                anchor,
                f"declared in algorithm registry ({', '.join(sorted(names)[:6])}) - "
                "configuration surface, not a call site",
                conf=0.66,
            )

    def _scan_assignment(self, node: ast.Assign | ast.AnnAssign, add) -> None:
        targets = node.targets if isinstance(node, ast.Assign) else [node.target]
        value = node.value
        if value is None:
            return
        label = ""
        for t in targets:
            if isinstance(t, ast.Name):
                label = t.id
            elif isinstance(t, ast.Attribute):
                label = t.attr
        if not label:
            return

        # `SHA256: ClassVar[HashlibHash] = hashlib.sha256`
        if isinstance(value, ast.Attribute) and value.attr in HASH_FUNCS:
            add(
                HASH_FUNCS[value.attr],
                node,
                f"bound to class/module attribute {label!r} - a declaration of this "
                "digest as the configured algorithm",
                conf=0.6,
            )
            return

        # `CIPHERS = {"aes-256-gcm": ...}`
        if isinstance(value, (ast.Dict, ast.List, ast.Tuple, ast.Set)):
            for token in ast.walk(value):
                if isinstance(token, ast.Constant) and isinstance(token.value, str):
                    asset = CIPHER_TOKENS.get(token.value.strip().lower())
                    if asset:
                        add(
                            asset,
                            node,
                            f"named in {label!r} configuration table",
                            conf=0.6,
                        )

    def _scan_call(self, node: ast.Call, add) -> None:
        fn = _dotted(node.func).lower()
        leaf = fn.split(".")[-1]
        # `hashlib.sha256(...)` constructed but not always called
        if leaf in HASH_FUNCS and fn.startswith(("hashlib", "hmac", "cryptography")):
            add(HASH_FUNCS[leaf], node, f"hash constructor {fn} referenced", conf=0.6)

        # base64url is the JOSE transport encoding. It is not confidentiality,
        # but it is a cryptographic transform and a decoded JWT is a decoded
        # signature envelope, so it belongs in the inventory.
        if leaf in {"urlsafe_b64encode", "urlsafe_b64decode"}:
            add("BASE64URL", node, f"{fn} - JOSE base64url transport encoding", conf=0.58)

        # TLS transport: an explicit HTTPS call means the security of this
        # component's network path is TLS's to provide, whether or not the
        # handshake is implemented locally. Only unambiguous network APIs
        # count - a bare `.get(` is a dict lookup, and treating it as HTTPS
        # flagged every options.get() in a codebase.
        if _HTTPS_CALL.fullmatch(fn) or fn in {"urlopen", "request.urlopen"}:
            add("TLS", node, f"HTTPS transport via {fn}", conf=0.55)

        # `hmac.new(...)` at module/class scope often means configuration
        if leaf == "new" and _HMAC_KW.search(fn):
            for kw in node.keywords:
                if kw.arg == "digestmod":
                    v = getattr(kw.value, "value", None)
                    if isinstance(v, str):
                        return
            add("HMAC-SHA256", node, "hmac.new without explicit digestmod", conf=0.55)


SCANNER = DeclarationScanner()
