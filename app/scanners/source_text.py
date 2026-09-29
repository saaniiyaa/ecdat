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

# --------------------------------------------------------------------------- #
# C / OpenSSL tier
#
# The C convention is not JCA's. There is no class and no string literal: an
# OpenSSL primitive is named by a *function*. `EVP_sha256()`, `SHA256_Init()`,
# `DES_encrypt3()`, `BF_encrypt()`. A tier that only understood Java's naming
# would return nothing at all against OpenSSL - which is exactly what it did.
#
# The rule here is the shape, as everywhere else: a fetch function from the EVP
# namespace, or a member of a known implementation's function family. Both are
# names that only exist to select a primitive, so a match is evidence without
# needing to see the primitive's internals.
# --------------------------------------------------------------------------- #

# EVP_aes_256_gcm(), EVP_des_ede3_cbc(), EVP_rc4(), EVP_camellia_128_ctr() ...
#
# The whole trailing name is captured and split afterwards, rather than being
# matched with optional sub-groups. A pattern built from optional groups cannot
# express "the last segment is a mode if it looks like one": `\b` does not fire
# between a digit and an underscore, so `EVP_aes_256_gcm` matched nothing at
# all, and requiring a trailing underscore meant bare `EVP_rc4` matched nothing
# either. Both are the common spellings.
C_EVP_NAME = re.compile(r"\bEVP_([A-Za-z0-9]+(?:_[A-Za-z0-9]+)*)\b")
_C_EVP_SIZES = {"128", "192", "224", "256", "512", "40"}
_C_EVP_MODES = {"gcm", "ccm", "xts", "ofb", "cfb64", "cfb", "ctr", "cbc", "ecb",
                "wrap", "wrap_pad", "niaw", "ofb64"}
# Selector functions that are not algorithms: they fetch a key or a context.
_C_EVP_NOT_CIPHER = {"des_ede3_ecb"}
# SHA256_Init(), MD5_Update(), SHA1_Transform(), SHA512_Block_Data_Order()
C_DIGEST_FN = re.compile(
    r"\b(?P<alg>SHA1|SHA224|SHA256|SHA384|SHA512|SHA3_[0-9]+|MD5|MD4|MD2|RIPEMD160|SM3)"
    r"_(?P<op>Init|Update|Final|Transform|Block_Data_Order|Block_Update)\b"
)
# DES_encrypt1/2/3(), DES_set_key_unchecked(), DES_ede3_encrypt()
C_DES_FN = re.compile(r"\bDES_(?P<op>encrypt[123]|decrypt[123]|set_key(?:_unchecked)?|"
                      r"ecb_encrypt|ede3_encrypt|cbc_encrypt|ofb64_encrypt|ncbc_encrypt)\b")
C_BF_FN = re.compile(r"\bBF_(?P<op>encrypt|decrypt|set_key|ecb_encrypt|cbc_encrypt)\b")
C_RC4_FN = re.compile(r"\bRC4_(?P<op>set_key|set_encrypt_key|set_decrypt_key)?\b")
# HMAC(), HMAC_Init_ex(), HMAC_Update(), HMAC_Final()
C_HMAC_FN = re.compile(r"\bHMAC(?:_(?P<op>Init|Init_ex|Update|Final))?\s*\(")
# NID_aes_256_gcm, NID_sha256, NID_des_ede3_cbc - OpenSSL's algorithm registry.
# A NID is a *declaration* of an algorithm the library will resolve by number.
C_NID = re.compile(r"\bNID_(?P<alg>[a-z0-9_]+)\b", re.I)
# The key size argument that follows a NID in OpenSSL's EVP table macros.
C_NID_SIZE = re.compile(r"\bNID_aes(?:128|192|256)?\s*,\s*(128|192|256)\b", re.I)
# DES_n, 3DES, Blowfish as spelled in comments and identifiers.
C_ALG_TOKEN = re.compile(
    r"(?<![\w/])(?P<alg>3DES|Triple-?DES|Blowfish|CAST5|Camellia|ChaCha20|SM4|"
    r"Aria|SM3|RIPEMD-?160|Whirlpool|SHA-?3-?[0-9]+|SHA-?1|SHA-?2)\b"
)

_C_CIPHER_FAMILIES = {
    "aes": "AES", "des": "DES", "desx": "DES", "bf": "Blowfish", "bf_cbc": "Blowfish",
    "bf_ecb": "Blowfish", "bf_ofb64": "Blowfish", "bf_cfb64": "Blowfish",
    "rc4": "RC4", "rc2": "RC2", "cast": "CAST5", "cast5": "CAST5",
    "camellia": "Camellia", "aria": "Aria", "chacha20": "ChaCha20", "sm4": "SM4",
    "idea": "IDEA", "seed": "SEED",
}
_C_MODE_FAMILY = {
    "gcm": "AES-GCM", "ccm": "AES-CCM", "xts": "AES-XTS", "ofb": None, "cfb": None,
    "ctr": None, "cbc": None, "ecb": None,
}
# NID_des_ede3_* is Triple-DES, not single DES. Getting this wrong would report
# a modern deployment's 3DES fallback as bare DES - or hide it entirely.
# OpenSSL's registry identifiers. Each entry is (pattern, resolver) rather
# than (pattern, constant) because several NIDs name a *specific* member of a
# family: mapping `sha3_?\d+` to a generic "SHA-3" made every SHA-3 variant
# report as SHA3-256, which is a false positive rather than a blur - the
# source said one thing and the tool said a different one.
_C_NID_FAMILY = [
    (r"^des_ede3|^3des|^desx", lambda m: "3DES"),
    (r"^des$|^des_", lambda m: "DES"),
    (r"^bf|^blowfish", lambda m: "Blowfish"),
    (r"^rc4$|^rc4_", lambda m: "RC4"),
    (r"^rc2", lambda m: "RC2"),
    (r"^aes|^id_aes", lambda m: "AES"),
    (r"^hmacwithsha512[_/]?(\d+)?|^hmacsha512[_/]?(\d+)?",
     lambda m: f"HMAC-SHA512/{m.group(1) or m.group(2)}" if (m.group(1) or m.group(2)) else "HMAC-SHA512"),
    (r"^hmacwithsha384", lambda m: "HMAC-SHA384"),
    (r"^hmacwithsha256", lambda m: "HMAC-SHA256"),
    (r"^hmacwithsha224", lambda m: "HMAC-SHA256"),   # no SHA-224 HMAC entry in the pack
    (r"^hmacwithsha1$|^hmacsha1$", lambda m: "HMAC-SHA1"),
    (r"^hmacwithmd5|^hmacmd5", lambda m: "HMAC"),
    (r"^hmac", lambda m: "HMAC"),
    (r"^sha1$|^sha1_", lambda m: "SHA-1"),
    (r"^sha224|^sha2?224", lambda m: "SHA-224"),
    (r"^sha256|^sha2?256", lambda m: "SHA-256"),
    (r"^sha384|^sha2?384", lambda m: "SHA-384"),
    (r"^sha512[_/](\d+)|^sha2?512[_/](\d+)",
     lambda m: f"SHA-512/{m.group(1) or m.group(2)}" if (m.group(1) or m.group(2)) else "SHA-512"),
    (r"^sha512$|^sha512_$|^sha2?512$", lambda m: "SHA-512"),
    (r"^sha3_?(\d+)", lambda m: f"SHA3-{m.group(1)}" if m.group(1) else "SHA-3"),
    (r"^md5", lambda m: "MD5"),
    (r"^md4", lambda m: "MD4"),
    (r"^md2", lambda m: "MD2"),
    (r"^ripemd160|^rmd160", lambda m: "RIPEMD-160"),
    (r"^sm3", lambda m: "SM3"),
    (r"^chacha20", lambda m: "ChaCha20"),
    (r"^camellia", lambda m: "Camellia"),
    (r"^cast5?", lambda m: "CAST5"),
    (r"^blake2s?(\d*)|^blake2b(\d*)", lambda m: "BLAKE2"),
    (r"^shake(\d*)", lambda m: "SHA-3"),
    (r"^whirlpool", lambda m: "Whirlpool"),
]


def _evp_parts(name: str) -> tuple[str, str | None, str | None]:
    """('aes', '256', 'gcm') from 'aes_256_gcm'; each part optional."""
    parts = name.lower().split("_")
    mode = parts[-1] if parts and parts[-1] in _C_EVP_MODES else None
    if mode:
        parts = parts[:-1]
    bits = parts[-1] if parts and parts[-1] in _C_EVP_SIZES else None
    if bits:
        parts = parts[:-1]
    return "_".join(parts), bits, mode


def _c_resolve_evp(name: str) -> str | None:
    """Resolve an EVP selector name to an ECDAT family, or None if it is not one."""
    alg, bits, mode = _evp_parts(name)
    if not alg:
        return None
    joined = "_".join(p for p in (alg, bits, mode) if p)
    if joined in _C_EVP_NOT_CIPHER:
        return None
    digest = _c_resolve_digest(alg)
    if digest:
        return digest
    if "ede3" in name.lower() or "des_ede3" in name.lower():
        return "3DES"
    if alg in ("des", "desx", "des_ede3") and mode:
        return "DES"
    family = _C_CIPHER_FAMILIES.get(alg)
    if family is None:
        # An EVP selector for a primitive we do not model. Returning the family
        # stem lets the finding stay reviewable; silently dropping it would
        # make an unmodelled algorithm look like an absent one.
        head = alg.split("_")[0]
        family = _C_CIPHER_FAMILIES.get(head)
        if family is None:
            return None
        alg = head
    if family == "AES" and bits:
        return f"AES-{bits}"
    return family


_C_DIGESTS = {
    "MD5": "MD5", "MD4": "MD4", "MD2": "MD2",
    "SHA1": "SHA-1", "SHA224": "SHA-224", "SHA256": "SHA-256",
    "SHA384": "SHA-384", "SHA512": "SHA-512", "SHA": "SHA-2",
    "RIPEMD160": "RIPEMD-160", "SM3": "SM3", "WHIRLPOOL": "Whirlpool",
}


def _c_resolve_digest(name: str) -> str | None:
    """Resolve an EVP/Go/NID stem to a digest family, or None.

    This is a whitelist, not a guess. An earlier version fell through to
    `return token`, which meant every non-digest stem - "aes", "des_ede3",
    "camellia" - came back as if it were a digest, and a cipher was reported
    under a hash name. Returning None for anything unrecognised keeps an
    unmodelled primitive visible as an absence of *our* model rather than as a
    confident wrong answer.
    """
    token = re.sub(r"[^A-Za-z0-9]", "", name).upper()
    if not token:
        return None
    if token in _C_DIGESTS:
        return _C_DIGESTS[token]
    # SHA-3 and SHAKE are named with the size attached: sha3_256, shake128.
    m = re.fullmatch(r"(?:SHA3|SHAKE|SHA_3)([0-9]*)", token)
    if m:
        return f"SHA3-{m.group(1)}" if m.group(1) else "SHA-3"
    m = re.fullmatch(r"(?:BLAKE2|BLAKE2S|BLAKE2B)([0-9]*)", token)
    if m:
        return "BLAKE2"
    if token.startswith("SHA"):
        return "SHA-2"
    return None


def _c_resolve_nid(alg: str) -> str | None:
    low = alg.lower()
    for pattern, resolve in _C_NID_FAMILY:
        m = re.match(pattern, low)
        if m:
            return resolve(m)
    return None

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
                    # A JCA algorithm is *named*, not called. The literal is a
                    # declaration surface whether or not a getInstance ever
                    # consumes it, so it is reported as one.
                    literal = match.group(0).strip("\"'")
                    out.append(self._f(
                        rel_path, asset, idx, literal, snippet,
                        declaration=f"JCA standard algorithm name {literal!r} is declared on this "
                                   f"line; the primitive is selected by name at runtime",
                    ))

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

            # ---- C / OpenSSL ------------------------------------------------
            # A primitive in C is named by a function, not a string. These are
            # the only identifiers in a C file that exist to select an
            # algorithm, so a match is evidence on its own.
            for match in C_EVP_NAME.finditer(line):
                family = _c_resolve_evp(match.group(1))
                if not family:
                    continue
                asset = canonicalise(family)
                if not asset:
                    continue
                kc = (idx, asset["canonical_name"])
                if kc in seen:
                    continue
                seen.add(kc)
                out.append(self._f(
                    rel_path, asset, idx, match.group(0), snippet,
                    declaration=f"OpenSSL selector {match.group(0)} is referenced here; "
                               f"the primitive is chosen by this function rather than at a call site",
                ))

            for match in C_DIGEST_FN.finditer(line):
                family = _c_resolve_digest(match.group("alg"))
                asset = canonicalise(family) if family else None
                if not asset:
                    continue
                kc = (idx, asset["canonical_name"])
                if kc in seen:
                    continue
                seen.add(kc)
                out.append(self._f(
                    rel_path, asset, idx, match.group(0), snippet,
                    declaration=f"{match.group(0)} is the OpenSSL {family} implementation entry point",
                ))

            for match in C_NID.finditer(line):
                family = _c_resolve_nid(match.group("alg"))
                if not family:
                    continue
                # OpenSSL's EVP tables pass the key size as the next macro
                # argument - `BLOCK_CIPHER_generic_pack(NID_aes, 128, 0)`.
                # Without it, NID_aes alone would resolve to a default size the
                # source never stated.
                if family == "AES":
                    size = C_NID_SIZE.search(line)
                    if size:
                        family = f"AES-{size.group(1)}"
                asset = canonicalise(family)
                if not asset:
                    continue
                kc = (idx, asset["canonical_name"])
                if kc in seen:
                    continue
                seen.add(kc)
                out.append(self._f(
                    rel_path, asset, idx, match.group(0), snippet,
                    declaration=f"OpenSSL algorithm registry identifier {match.group(0)} "
                               f"selects {family} by number",
                ))

            for match in C_HMAC_FN.finditer(line):
                asset = canonicalise("HMAC")
                kc = (idx, asset["canonical_name"])
                if kc in seen:
                    continue
                seen.add(kc)
                out.append(self._f(
                    rel_path, asset, idx, match.group(0), snippet,
                    declaration="HMAC construction invoked; the underlying digest is a "
                               "parameter, so the MAC is reported without a digest",
                ))

            for pattern, family, label in (
                (C_DES_FN, "DES", "DES"), (C_BF_FN, "Blowfish", "Blowfish"),
                (C_RC4_FN, "RC4", "RC4"),
            ):
                for match in pattern.finditer(line):
                    op = (match.group("op") or "")
                    # DES_encrypt3() and DES_ede3_encrypt() take three key
                    # schedules - that is Triple-DES, not single DES. Reporting
                    # it as bare DES would both mislabel a different algorithm
                    # and hide the fact that it is the deprecated one.
                    if family == "DES" and (op.endswith("3") or "ede3" in op):
                        family_name = "3DES"
                    else:
                        family_name = family
                    asset = canonicalise(family_name)
                    if not asset:
                        continue
                    kc = (idx, asset["canonical_name"])
                    if kc in seen:
                        continue
                    seen.add(kc)
                    out.append(self._f(
                        rel_path, asset, idx, match.group(0), snippet,
                        declaration=f"{match.group(0)} is the OpenSSL {family_name} implementation",
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
                    # `crypto.SHA256` is a package-level constant: the digest is
                    # *named* here and selected by reference, not invoked. That
                    # makes it a declaration surface in the same sense as a JCA
                    # provider string, and the reason is worth showing.
                    out.append(self._f(
                        rel_path, canonicalise(asset), idx, match.group(0), snippet,
                        declaration=f"Go crypto package constant {match.group(0)} is referenced here; "
                                   f"the digest is bound by name rather than invoked at this line",
                    ))

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
           confidence: float = 0.75, evidence: str = PATTERN,
           declaration: str | None = None) -> RawFinding:
        return RawFinding(
            # A finding in a test file is real but is not a production
            # exposure. The engine does not drop it - suppressing it would
            # hide a real occurrence - it marks it so the risk model and the
            # UI can say where it came from.
            # `declaration` marks a finding that came from a declaration
            # surface - a provider string, a registry entry, a digest binding -
            # rather than a call site. The console keys its "declared vs
            # called" question off this, so it has to be set wherever the
            # detector is inferring rather than observing an invocation.
            extra={**source_context(rel_path), **({"declaration": declaration} if declaration else {})},
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
