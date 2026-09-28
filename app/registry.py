"""Cryptographic registry + policy pack.

This module is the tool's *knowledge*, kept as versioned, inspectable data rather
than scattered `if` statements. Everything the risk engine, the recommender and
the CBOM exporter say about an algorithm comes from here, and the exact pack
version used is stored on every assessment so historical scans stay reproducible.

Security claims are sourced from NIST SP 800-57 / FIPS 197 / FIPS 203-206 and
the NIST IR 8547 transition timeline (classical public key: deprecated after
2030 at 112-bit strength, disallowed after 2035).
"""

from __future__ import annotations

import re
from typing import Any, Optional

POLICY_PACK_VERSION = "pp-2026.09"

# --------------------------------------------------------------------------- #
# Asset catalogue
# --------------------------------------------------------------------------- #
# classical_bits : brute-force security against a classical adversary
# quantum_bits   : effective security against a fault-tolerant CRQC
#                  (0 for Shor-vulnerable public key, n/2 for Grover-affected symmetric)
# quantum_status : pqc_resistant | shor_vulnerable | grover_weakened | symmetric_safe | unknown
ALGORITHMS: list[dict[str, Any]] = [
    # ---------------- Public key: Shor-vulnerable ---------------- #
    dict(canonical_name="RSA-1024", family="RSA", primitive="signature/key-encapsulation", purpose="key_establishment",
         oid="1.2.840.113549.1.1.1", aliases=["rsa1024", "rsa-1024", "rsa 1024", "rsa/1024"],
         classical_bits=80, quantum_bits=0, quantum_status="shor_vulnerable", key_size_bits=1024,
         nist_deprecated_after=2030, nist_disallowed_after=2035, replacement_hint="ML-KEM-768 (FIPS 203)"),
    dict(canonical_name="RSA-2048", family="RSA", primitive="signature/key-encapsulation", purpose="key_establishment",
         oid="1.2.840.113549.1.1.1", aliases=["rsa2048", "rsa-2048", "rsa 2048", "rsa", "rsassa-pkcs1-v1_5", "pkcs1"],
         classical_bits=112, quantum_bits=0, quantum_status="shor_vulnerable", key_size_bits=2048,
         nist_deprecated_after=2030, nist_disallowed_after=2035, replacement_hint="ML-KEM-768 (FIPS 203) or ML-DSA-65 (FIPS 204)"),
    dict(canonical_name="RSA-3072", family="RSA", primitive="signature", purpose="digital_signature",
         oid="1.2.840.113549.1.1.1", aliases=["rsa3072", "rsa-3072", "rsa 3072"],
         classical_bits=128, quantum_bits=0, quantum_status="shor_vulnerable", key_size_bits=3072,
         nist_deprecated_after=None, nist_disallowed_after=2035, replacement_hint="ML-DSA-65 (FIPS 204)"),
    dict(canonical_name="RSA-4096", family="RSA", primitive="signature", purpose="digital_signature",
         oid="1.2.840.113549.1.1.1", aliases=["rsa4096", "rsa-4096", "rsa 4096"],
         classical_bits=152, quantum_bits=0, quantum_status="shor_vulnerable", key_size_bits=4096,
         nist_deprecated_after=None, nist_disallowed_after=2035, replacement_hint="ML-DSA-65 (FIPS 204)"),
    dict(canonical_name="ECDSA-P256", family="ECDSA", primitive="digital-signature", purpose="digital_signature",
         oid="1.2.840.10045.4.3.2", aliases=["ecdsa", "p-256", "p256", "prime256v1", "secp256r1", "nist p-256", "ecdsa-p256"],
         classical_bits=128, quantum_bits=0, quantum_status="shor_vulnerable", curve="secp256r1",
         nist_deprecated_after=None, nist_disallowed_after=2035, replacement_hint="ML-DSA-65 (FIPS 204)"),
    dict(canonical_name="ECDSA-P384", family="ECDSA", primitive="digital-signature", purpose="digital_signature",
         oid="1.2.840.10045.4.3.3", aliases=["p-384", "p384", "secp384r1", "ecdsa-p384"],
         classical_bits=192, quantum_bits=0, quantum_status="shor_vulnerable", curve="secp384r1",
         nist_deprecated_after=None, nist_disallowed_after=2035, replacement_hint="ML-DSA-87 (FIPS 204)"),
    dict(canonical_name="ECDSA-P521", family="ECDSA", primitive="digital-signature", purpose="digital_signature",
         oid="1.2.840.10045.4.3.4", aliases=["p-521", "p521", "secp521r1", "ecdsa-p521"],
         classical_bits=256, quantum_bits=0, quantum_status="shor_vulnerable", curve="secp521r1",
         nist_deprecated_after=None, nist_disallowed_after=2035, replacement_hint="ML-DSA-87 (FIPS 204)"),
    dict(canonical_name="ECDSA-P224", family="ECDSA", primitive="digital-signature", purpose="digital_signature",
         oid="1.2.840.10045.3.1.5", aliases=["p-224", "p224", "secp224r1", "ecdsa-p224"],
         classical_bits=112, quantum_bits=0, quantum_status="shor_vulnerable", curve="secp224r1",
         nist_deprecated_after=2030, nist_disallowed_after=2035, replacement_hint="ML-DSA-44 (FIPS 204)"),
    dict(canonical_name="Ed25519", family="EdDSA", primitive="digital-signature", purpose="digital_signature",
         oid="1.3.101.112", aliases=["ed25519", "eddsa", "ed25519ph"],
         classical_bits=128, quantum_bits=0, quantum_status="shor_vulnerable",
         nist_deprecated_after=None, nist_disallowed_after=2035, replacement_hint="ML-DSA-65 (FIPS 204)"),
    dict(canonical_name="X25519", family="ECDH", primitive="key-agreement", purpose="key_establishment",
         oid="1.3.101.110", aliases=["x25519", "curve25519", "x448", "curve448"],
         classical_bits=128, quantum_bits=0, quantum_status="shor_vulnerable", curve="x25519",
         nist_deprecated_after=None, nist_disallowed_after=2035, replacement_hint="X25519MLKEM768 hybrid (RFC 10024)"),
    dict(canonical_name="DH-2048", family="DH", primitive="key-agreement", purpose="key_establishment",
         oid="1.2.840.113549.1.3.1", aliases=["dh", "diffie-hellman", "dhparam", "ffdhe2048", "dh-2048"],
         classical_bits=112, quantum_bits=0, quantum_status="shor_vulnerable", key_size_bits=2048,
         nist_deprecated_after=2030, nist_disallowed_after=2035, replacement_hint="ML-KEM-768 (FIPS 203)"),
    dict(canonical_name="DSA-2048", family="DSA", primitive="digital-signature", purpose="digital_signature",
         oid="1.2.840.10040.4.3", aliases=["dsa", "dsa2048", "dsa-2048"],
         classical_bits=112, quantum_bits=0, quantum_status="shor_vulnerable", key_size_bits=2048,
         nist_deprecated_after=2030, nist_disallowed_after=2035, replacement_hint="ML-DSA-44 (FIPS 204)"),
    # ---------------- Post-quantum (NIST FIPS 203-206) ---------------- #
    dict(canonical_name="ML-KEM-768", family="ML-KEM", primitive="kem", purpose="key_establishment",
         oid="2.16.840.1.101.3.4.4.2", aliases=["ml-kem", "mlkem", "ml_kem", "kyber768", "kyber", "mlkem768"],
         classical_bits=192, quantum_bits=192, quantum_status="pqc_resistant", is_post_quantum=True,
         nist_deprecated_after=None, nist_disallowed_after=None, replacement_hint="current standard (FIPS 203)"),
    dict(canonical_name="ML-KEM-1024", family="ML-KEM", primitive="kem", purpose="key_establishment",
         oid="2.16.840.1.101.3.4.4.3", aliases=["mlkem1024", "ml-kem-1024", "kyber1024"],
         classical_bits=256, quantum_bits=256, quantum_status="pqc_resistant", is_post_quantum=True,
         nist_deprecated_after=None, nist_disallowed_after=None, replacement_hint="current standard (FIPS 203)"),
    dict(canonical_name="ML-DSA-65", family="ML-DSA", primitive="digital-signature", purpose="digital_signature",
         oid="2.16.840.1.101.3.4.3.2", aliases=["ml-dsa", "mldsa", "ml_dsa", "dilithium", "dilithium2", "mldsa65"],
         classical_bits=192, quantum_bits=192, quantum_status="pqc_resistant", is_post_quantum=True,
         nist_deprecated_after=None, nist_disallowed_after=None, replacement_hint="current standard (FIPS 204)"),
    dict(canonical_name="ML-DSA-87", family="ML-DSA", primitive="digital-signature", purpose="digital_signature",
         oid="2.16.840.1.101.3.4.3.3", aliases=["mldsa87", "ml-dsa-87", "dilithium3"],
         classical_bits=256, quantum_bits=256, quantum_status="pqc_resistant", is_post_quantum=True,
         nist_deprecated_after=None, nist_disallowed_after=None, replacement_hint="current standard (FIPS 204)"),
    dict(canonical_name="SLH-DSA-SHA2-128s", family="SLH-DSA", primitive="digital-signature", purpose="digital_signature",
         oid=None, aliases=["sphincs+", "sphincs", "slh-dsa", "sphincs128s"],
         classical_bits=128, quantum_bits=128, quantum_status="pqc_resistant", is_post_quantum=True,
         nist_deprecated_after=None, nist_disallowed_after=None, replacement_hint="current standard (FIPS 205)"),
    dict(canonical_name="X25519MLKEM768", family="HYBRID", primitive="kem", purpose="key_establishment",
         oid=None, aliases=["x25519mlkem768", "x25519+mlkem768", "x25519 kyber768 draft00", "secp256r1mlkem768"],
         classical_bits=192, quantum_bits=192, quantum_status="pqc_resistant", is_post_quantum=True,
         nist_deprecated_after=None, nist_disallowed_after=None, replacement_hint="RFC 10024 hybrid, TLS 1.3 group 0x11EC"),
    # ---------------- Symmetric: Grover-affected ---------------- #
    dict(canonical_name="AES-128-GCM", family="AES", primitive="block-cipher", purpose="encryption",
         oid="2.16.840.1.101.3.4.1.6", aliases=["aes128gcm", "aes-128-gcm", "aes128", "aes-128", "aes/gcm", "aes128gcm"],
         classical_bits=128, quantum_bits=64, quantum_status="grover_weakened", key_size_bits=128, mode="gcm",
         nist_deprecated_after=None, nist_disallowed_after=None, replacement_hint="AES-256-GCM (FIPS 197)"),
    dict(canonical_name="AES-256-GCM", family="AES", primitive="block-cipher", purpose="encryption",
         oid="2.16.840.1.101.3.4.1.46", aliases=["aes256gcm", "aes-256-gcm", "aes256", "aes-256", "aes"],
         classical_bits=256, quantum_bits=128, quantum_status="symmetric_safe", key_size_bits=256, mode="gcm",
         nist_deprecated_after=None, nist_disallowed_after=None, replacement_hint="no change required"),
    dict(canonical_name="AES-128-CBC", family="AES", primitive="block-cipher", purpose="encryption",
         oid=None, aliases=["aes128cbc", "aes-128-cbc", "aes/cbc/pkcs7padding", "aes/cbc/pkcs5padding", "aes-cbc"],
         classical_bits=128, quantum_bits=64, quantum_status="grover_weakened", key_size_bits=128, mode="cbc",
         nist_deprecated_after=None, nist_disallowed_after=None, replacement_hint="AES-256-GCM (FIPS 197)"),
    dict(canonical_name="AES-256-CBC", family="AES", primitive="block-cipher", purpose="encryption",
         oid=None, aliases=["aes256cbc", "aes-256-cbc", "aes-256/cbc/pkcs7padding", "aes-cbc-256"],
         classical_bits=256, quantum_bits=128, quantum_status="symmetric_safe", key_size_bits=256, mode="cbc",
         nist_deprecated_after=None, nist_disallowed_after=None, replacement_hint="prefer AES-256-GCM"),
    dict(canonical_name="AES-ECB", family="AES", primitive="block-cipher", purpose="encryption",
         oid=None, aliases=["aes/ecb", "ecb", "aes-ecb", "aes128ecb"],
         classical_bits=128, quantum_bits=64, quantum_status="grover_weakened", mode="ecb",
         nist_deprecated_after=None, nist_disallowed_after=None, replacement_hint="AES-256-GCM (FIPS 197)"),
    dict(canonical_name="ChaCha20-Poly1305", family="ChaCha", primitive="stream-cipher", purpose="encryption",
         oid=None, aliases=["chacha20poly1305", "chacha20-poly1305", "chacha20", "chacha"],
         classical_bits=256, quantum_bits=128, quantum_status="symmetric_safe",
         nist_deprecated_after=None, nist_disallowed_after=None, replacement_hint="no change required"),
    dict(canonical_name="3DES", family="DES", primitive="block-cipher", purpose="encryption",
         oid="1.2.840.113549.3.7",
         aliases=["3des", "des-ede3", "tripledes", "des3", "des/ede3/cbc/pkcs5padding", "3des/ed3/cbc"],
         classical_bits=112, quantum_bits=56, quantum_status="grover_weakened", key_size_bits=168, mode="cbc",
         nist_deprecated_after=2023, nist_disallowed_after=2023, replacement_hint="AES-256-GCM (FIPS 197)"),
    dict(canonical_name="DES", family="DES", primitive="block-cipher", purpose="encryption",
         oid="1.3.14.3.2.7", aliases=["des", "single des", "des/ecb/pkcs5padding", "des/ede/cbc/pkcs5padding"],
         classical_bits=56, quantum_bits=28, quantum_status="grover_weakened", key_size_bits=56,
         nist_deprecated_after=2005, nist_disallowed_after=2023, replacement_hint="AES-256-GCM (FIPS 197)"),
    dict(canonical_name="RC4", family="RC4", primitive="stream-cipher", purpose="encryption",
         oid="1.2.840.113549.3.4", aliases=["rc4", "arcfour"],
         classical_bits=0, quantum_bits=0, quantum_status="symmetric_safe",
         nist_deprecated_after=2005, nist_disallowed_after=2023, replacement_hint="AES-256-GCM (FIPS 197)"),
    # ---------------- Hash / MAC / KDF ---------------- #
    dict(canonical_name="SHA-256", family="SHA-2", primitive="hash", purpose="integrity",
         oid="2.16.840.1.101.3.4.2.1", aliases=["sha256", "sha-256", "sha_256"],
         classical_bits=256, quantum_bits=128, quantum_status="symmetric_safe",
         nist_deprecated_after=None, nist_disallowed_after=None, replacement_hint="no change required"),
    dict(canonical_name="SHA-384", family="SHA-2", primitive="hash", purpose="integrity",
         oid="2.16.840.1.101.3.4.2.2", aliases=["sha384", "sha-384"],
         classical_bits=384, quantum_bits=192, quantum_status="symmetric_safe",
         nist_deprecated_after=None, nist_disallowed_after=None, replacement_hint="no change required"),
    dict(canonical_name="SHA-512", family="SHA-2", primitive="hash", purpose="integrity",
         oid="2.16.840.1.101.3.4.2.3", aliases=["sha512", "sha-512"],
         classical_bits=512, quantum_bits=256, quantum_status="symmetric_safe",
         nist_deprecated_after=None, nist_disallowed_after=None, replacement_hint="no change required"),
    dict(canonical_name="SHA3-256", family="SHA-3", primitive="hash", purpose="integrity",
         oid="2.16.840.1.101.3.4.2.8", aliases=["sha3256", "sha3-256", "sha3"],
         classical_bits=256, quantum_bits=128, quantum_status="symmetric_safe",
         nist_deprecated_after=None, nist_disallowed_after=None, replacement_hint="no change required"),
    dict(canonical_name="SHA-224", family="SHA-2", primitive="hash", purpose="integrity",
         oid="2.16.840.1.101.3.4.2.4", aliases=["sha224", "sha-224"],
         classical_bits=224, quantum_bits=112, quantum_status="symmetric_safe",
         nist_deprecated_after=None, nist_disallowed_after=2030, replacement_hint="SHA-256 (FIPS 180-4)"),
    dict(canonical_name="SHA-1", family="SHA-1", primitive="hash", purpose="integrity",
         oid="1.3.14.3.2.26", aliases=["sha1", "sha-1", "sha_1"],
         classical_bits=80, quantum_bits=40, quantum_status="grover_weakened",
         nist_deprecated_after=2010, nist_disallowed_after=2030, replacement_hint="SHA-256 / SHA3-256 (FIPS 180-4 / 202)"),
    dict(canonical_name="MD5", family="MD", primitive="hash", purpose="integrity",
         oid="1.2.840.113549.2.5", aliases=["md5", "md-5"],
         classical_bits=0, quantum_bits=0, quantum_status="symmetric_safe",
         nist_deprecated_after=2001, nist_disallowed_after=2023, replacement_hint="SHA-256 (FIPS 180-4)"),
    dict(canonical_name="HMAC-SHA256", family="HMAC", primitive="mac", purpose="integrity",
         oid="1.2.840.113549.2.9", aliases=["hmac-sha256", "hmacsha256", "hmac"],
         classical_bits=256, quantum_bits=128, quantum_status="symmetric_safe",
         nist_deprecated_after=None, nist_disallowed_after=None, replacement_hint="no change required"),
    dict(canonical_name="HMAC-SHA384", family="HMAC", primitive="mac", purpose="integrity",
         oid=None, aliases=["hmac-sha384", "hmacsha384"],
         classical_bits=384, quantum_bits=192, quantum_status="symmetric_safe",
         nist_deprecated_after=None, nist_disallowed_after=None, replacement_hint="no change required"),
    dict(canonical_name="HMAC-SHA512", family="HMAC", primitive="mac", purpose="integrity",
         oid=None, aliases=["hmac-sha512", "hmacsha512"],
         classical_bits=512, quantum_bits=256, quantum_status="symmetric_safe",
         nist_deprecated_after=None, nist_disallowed_after=None, replacement_hint="no change required"),
    dict(canonical_name="PBKDF2-HMAC-SHA256", family="KDF", primitive="kdf", purpose="key_derivation",
         oid="1.2.840.113549.1.5.12", aliases=["pbkdf2", "pbkdf2-sha256", "scrypt", "argon2"],
         classical_bits=256, quantum_bits=128, quantum_status="symmetric_safe",
         nist_deprecated_after=None, nist_disallowed_after=None, replacement_hint="no change required"),
]

# OID -> canonical name (certificates and ASN.1 arrive with OIDs, not names).
# Several OIDs are shared by every modulus size, so the mapping is explicit and
# points at the catalogue default: certificate *sizes* come from the public key,
# never from the algorithm OID.
OID_INDEX: dict[str, str] = {
    "1.2.840.113549.1.1.1": "RSA-2048",
    "1.2.840.113549.1.1.5": "RSA-2048",
    "1.2.840.113549.1.1.11": "RSA-2048",
    "1.2.840.113549.1.1.12": "RSA-2048",
    "1.2.840.113549.1.1.13": "RSA-2048",
    "1.2.840.113549.1.1.14": "RSA-2048",
    "1.2.840.10045.4.1": "ECDSA-P256",
    "1.2.840.10045.4.3.2": "ECDSA-P256",
    "1.2.840.10045.4.3.3": "ECDSA-P384",
    "1.2.840.10045.4.3.4": "ECDSA-P521",
    "1.2.840.10045.3.1.7": "ECDSA-P256",
    "1.3.101.112": "Ed25519",
    "1.3.101.113": "Ed25519",
    "1.3.101.110": "X25519",
    "1.3.101.111": "X25519",
    "1.2.840.10040.4.1": "DH-2048",
    "1.2.840.10040.4.3": "DSA-2048",
    "2.16.840.1.101.3.4.1.6": "AES-128-GCM",
    "2.16.840.1.101.3.4.1.46": "AES-256-GCM",
    "1.2.840.113549.3.7": "3DES",
    "1.3.14.3.2.7": "DES",
    "1.2.840.113549.3.4": "RC4",
    "1.2.840.113549.2.5": "MD5",
    "1.3.14.3.2.26": "SHA-1",
    "2.16.840.1.101.3.4.2.1": "SHA-256",
    "2.16.840.1.101.3.4.2.2": "SHA-384",
    "2.16.840.1.101.3.4.2.3": "SHA-512",
    "2.16.840.1.101.3.4.2.8": "SHA3-256",
    "1.2.840.113549.2.9": "HMAC-SHA256",
    "1.2.840.113549.1.5.12": "PBKDF2-HMAC-SHA256",
    "2.16.840.1.101.3.4.4.2": "ML-KEM-768",
    "2.16.840.1.101.3.4.4.3": "ML-KEM-1024",
    "2.16.840.1.101.3.4.3.2": "ML-DSA-65",
    "2.16.840.1.101.3.4.3.3": "ML-DSA-87",
}

# Signature algorithm OIDs that map to the *signing* primitive they depend on.
SIG_ALG_OIDS = {
    "1.2.840.113549.1.1.5": "RSA",   # sha1WithRSAEncryption
    "1.2.840.113549.1.1.11": "RSA",  # sha256WithRSA
    "1.2.840.113549.1.1.12": "RSA",  # sha384WithRSA
    "1.2.840.113549.1.1.13": "RSA",  # sha512WithRSA
    "1.2.840.113549.1.1.1": "RSA",   # rsaEncryption
    "1.2.840.10045.4.3.2": "ECDSA-P256",
    "1.2.840.10045.4.3.3": "ECDSA-P384",
    "1.2.840.10045.4.1": "ECDSA",
    "1.3.101.112": "Ed25519",
}

# Deprecated / legacy TLS protocol versions -> assets worth reporting.
PROTOCOL_ASSETS = {
    "ssl3.0": dict(canonical_name="SSLv3", family="TLS", primitive="protocol", purpose="protocol",
                   classical_bits=0, quantum_bits=0, quantum_status="symmetric_safe",
                   aliases=["ssl3", "sslv3", "ssl3.0"]),
    "tls1.0": dict(canonical_name="TLSv1.0", family="TLS", primitive="protocol", purpose="protocol",
                   classical_bits=0, quantum_bits=0, quantum_status="symmetric_safe",
                   aliases=["tls1", "tlsv1", "tls1.0", "tlsv1.0"]),
    "tls1.1": dict(canonical_name="TLSv1.1", family="TLS", primitive="protocol", purpose="protocol",
                   classical_bits=0, quantum_bits=0, quantum_status="symmetric_safe",
                   aliases=["tls1.1", "tlsv1.1"]),
    "tls1.2": dict(canonical_name="TLSv1.2", family="TLS", primitive="protocol", purpose="protocol",
                   classical_bits=112, quantum_bits=0, quantum_status="shor_vulnerable",
                   aliases=["tls1.2", "tlsv1.2"]),
    "tls1.3": dict(canonical_name="TLSv1.3", family="TLS", primitive="protocol", purpose="protocol",
                   classical_bits=128, quantum_bits=128, quantum_status="symmetric_safe",
                   aliases=["tls1.3", "tlsv1.3"]),
}

# --------------------------------------------------------------------------- #
# Crypto-relevant libraries (SBOM slice) - declaration evidence only
# --------------------------------------------------------------------------- #
LIBRARIES: dict[str, dict[str, Any]] = {
    "cryptography": dict(ecosystem="pypi", crypto=True, pqc=False, note="Python TLS + X.509 primitives"),
    "pycryptodome": dict(ecosystem="pypi", crypto=True, pqc=False, note="PyCrypto successor"),
    "pycryptodomex": dict(ecosystem="pypi", crypto=True, pqc=False, note="maintained fork"),
    "pynacl": dict(ecosystem="pypi", crypto=True, pqc=False, note="libsodium bindings"),
    "pyjwt": dict(ecosystem="pypi", crypto=True, pqc=False, note="JWT signing/verification"),
    "python-jose": dict(ecosystem="pypi", crypto=True, pqc=False, note="JOSE/JWT"),
    "authlib": dict(ecosystem="pypi", crypto=True, pqc=False, note="OAuth/JOSE"),
    "jose": dict(ecosystem="npm", crypto=True, pqc=False, note="JOSE/JWT for JS"),
    "jsonwebtoken": dict(ecosystem="npm", crypto=True, pqc=False, note="JWT"),
    "node-forge": dict(ecosystem="npm", crypto=True, pqc=False, note="pure-JS crypto"),
    "jsencrypt": dict(ecosystem="npm", crypto=True, pqc=False, note="RSA in JS"),
    "crypto-js": dict(ecosystem="npm", crypto=True, pqc=False, note="JS crypto primitives"),
    "webcrypto": dict(ecosystem="npm", crypto=True, pqc=False, note="WASM bcrypt/scrypt"),
    "@noble/curves": dict(ecosystem="npm", crypto=True, pqc=False, note="modern ECC"),
    "@noble/hashes": dict(ecosystem="npm", crypto=True, pqc=False, note="modern hashes"),
    "bouncycastle": dict(ecosystem="maven", crypto=True, pqc=False, note="bcprov/bcpkix"),
    "jjwt": dict(ecosystem="maven", crypto=True, pqc=False, note="JWT for JVM"),
    "nimbus-jose-jwt": dict(ecosystem="maven", crypto=True, pqc=False, note="JOSE for JVM"),
    "netty-tcnative": dict(ecosystem="maven", crypto=True, pqc=False, note="BoringSSL/APR bindings"),
    "conscrypt-bouncycastle": dict(ecosystem="maven", crypto=True, pqc=False, note="JCA provider"),
    "jose4j": dict(ecosystem="maven", crypto=True, pqc=False, note="JOSE"),
    "bouncycastle-pqc": dict(ecosystem="maven", crypto=True, pqc=True, note="PQC provider (BC FIPS style)"),
    "org.bouncycastle:bcprov-jc18on": dict(ecosystem="maven", crypto=True, pqc=True, note="BC 1.8x PQC provider"),
    "openssl": dict(ecosystem="system", crypto=True, pqc=True, note="3.5+ ships ML-KEM + RFC 10024 groups"),
    "boringssl": dict(ecosystem="system", crypto=True, pqc=True, note="Google BoringSSL"),
    "aws-lc": dict(ecosystem="system", crypto=True, pqc=True, note="AWS-LC-Fips"),
    "wolfssl": dict(ecosystem="system", crypto=True, pqc=True, note="wolfSSL"),
    "botan": dict(ecosystem="system", crypto=True, pqc=True, note="Botan3"),
    "botan3": dict(ecosystem="system", crypto=True, pqc=True, note="Botan3"),
    "liboqs": dict(ecosystem="system", crypto=True, pqc=True, note="Open Quantum Safe"),
    "oqs-provider": dict(ecosystem="system", crypto=True, pqc=True, note="OpenSSL 3.x OQS provider"),
    "pqcrypto": dict(ecosystem="system", crypto=True, pqc=True, note="PQClean based"),
    "nss": dict(ecosystem="system", crypto=True, pqc=True, note="Mozilla NSS"),
    "ring": dict(ecosystem="crates", crypto=True, pqc=False, note="Rust crypto"),
    "rustls": dict(ecosystem="crates", crypto=True, pqc=True, note="TLS stack with PQ support"),
    "pqcrypto-tls": dict(ecosystem="cargo", crypto=True, pqc=True, note="hybrid TLS helpers"),
    "crypto": dict(ecosystem="go", crypto=True, pqc=False, note="Go stdlib crypto"),
    "golang.org/x/crypto": dict(ecosystem="go", crypto=True, pqc=False, note="x/crypto"),
    "quic-go": dict(ecosystem="go", crypto=True, pqc=True, note="QUIC/TLS 1.3 stack"),
    "jruby-openssl": dict(ecosystem="system", crypto=True, pqc=False, note="legacy"),
    "crypt": dict(ecosystem="php", crypto=True, pqc=False, note="PHP ext/crypt"),
    "laravel/framework": dict(ecosystem="php", crypto=True, pqc=False, note="uses openssl"),
}

# --------------------------------------------------------------------------- #
# Policy pack
# --------------------------------------------------------------------------- #
POLICY_PACK: dict[str, Any] = {
    "version": POLICY_PACK_VERSION,
    "bands": {"critical": 80, "high": 60, "medium": 35, "low": 0},
    # Evidence classes, strongest first. The cap is the highest band an *uncorroborated*
    # finding of that class may reach - this is what stops a hex S-box match in a
    # vendor blob from being reported as a Critical vulnerability.
    "evidence_classes": {
        "AST_RESOLVED":    dict(cap="critical", confidence=0.95, description="AST node + statically resolved parameters"),
        "PARSED_STRUCTURE":dict(cap="critical", confidence=0.92, description="parsed ASN.1 / ELF structure"),
        "OBSERVED":        dict(cap="critical", confidence=0.90, description="observed on a real handshake"),
        "PATTERN":         dict(cap="high",     confidence=0.75, description="anchored textual match in source/config"),
        "SYMBOL_INFERRED": dict(cap="high",     confidence=0.70, description="import/export symbol or library string in a binary"),
        "AST_UNRESOLVED":  dict(cap="high",     confidence=0.70, description="AST call site, parameters dynamic"),
        "DECLARED_ONLY":   dict(cap="medium",   confidence=0.60, description="dependency manifest declaration only"),
        "INFERRED":        dict(cap="medium",   confidence=0.40, description="constant/symbol inference, no call site"),
    },
    "context_weights": {
        "exposure": {"internet_facing": 10, "dmz": 7, "internal": 3, "air_gapped": 0, "unknown": 0},
        "criticality": {"sovereign_critical": 10, "core_operations": 6, "peripheral": 2, "unknown": 0},
        "classification": {"top_secret": 10, "secret": 9, "confidential": 7, "internal": 3, "public": 0},
    },
    # A finding that only exists in a test or fixture does not carry the same
    # urgency as one on a production path. This is a weight, not a filter: the
    # finding still appears, still counts in totals, and still shows its file.
    "source_context_weights": {"production": 1.0, "unknown": 0.75, "non_production": 0.4},
    "urgency_weights": {"risk": 0.45, "mosca": 0.35, "exposure": 0.20},
    "mosca": {
        # Breached => hard floor, regardless of detector confidence, for high-value data.
        "breach_floor_band": "high",
        "long_lived_threshold_years": 10,
        "breach_quantum_floor": 80,
    },
    "scenarios": [
        dict(name="conservative", z_years=15, label="CRQC arrives late",
             source="Global Risk Institute Quantum Threat Timeline (expert survey)"),
        dict(name="baseline", z_years=10, label="CRQC early-2030s",
             source="GRI survey aggregate + NIST IR 8547 deprecation 2030"),
        dict(name="extended", z_years=20, label="CRQC delayed / no margin",
             source="conservative planning posture"),
    ],
    "defaults": {"x_years": 10.0, "y_years": 4.0, "nist_deprecated": 2030, "nist_disallowed": 2035},
}

BAND_ORDER = ["low", "medium", "high", "critical"]


def band_for(score: int) -> str:
    b = POLICY_PACK["bands"]
    if score >= b["critical"]:
        return "critical"
    if score >= b["high"]:
        return "high"
    if score >= b["medium"]:
        return "medium"
    return "low"


def band_cap(class_name: str) -> Optional[str]:
    info = POLICY_PACK["evidence_classes"].get(class_name)
    return info["cap"] if info else None


def _index() -> dict[str, dict[str, Any]]:
    idx: dict[str, dict[str, Any]] = {}
    for entry in ALGORITHMS:
        for alias in [entry["canonical_name"], *entry.get("aliases", [])]:
            idx[_norm(alias)] = entry
    for name, entry in PROTOCOL_ASSETS.items():
        for alias in [name, *entry.get("aliases", [])]:
            idx[_norm(alias)] = entry
    return idx


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (text or "").lower())


ALIAS_INDEX = _index()

# Ordered heuristics: first match wins, so specificity matters.
_HEURISTICS: list[tuple[str, str]] = [
    (r"^aes(\d+)?(gcm|cbc|ctr|ecb|ccm)?$", "AES"),
    (r"^chacha20poly1305$", "ChaCha20-Poly1305"),
    (r"^(des|3des|tripledes|desede3)$", "DES"),
    (r"^rc4$", "RC4"),
    (r"^rsa(\d+)?$", "RSA"),
    (r"^ecdsa(\d+)?$", "ECDSA"),
    (r"^mlkem(\d+)?$", "ML-KEM"),
    (r"^mldsa(\d+)?$", "ML-DSA"),
    (r"^slhdsa$", "SLH-DSA"),
]

SIZE_FALLBACK = {
    "AES": {128: "AES-128-GCM", 192: "AES-256-GCM", 256: "AES-256-GCM"},
    "RSA": {1024: "RSA-1024", 2048: "RSA-2048", 3072: "RSA-3072", 4096: "RSA-4096"},
    "ECDSA": {224: "ECDSA-P224", 256: "ECDSA-P256", 384: "ECDSA-P384", 521: "ECDSA-P521"},
    "ML-KEM": {512: "ML-KEM-768", 768: "ML-KEM-768", 1024: "ML-KEM-1024"},
    "ML-DSA": {44: "ML-DSA-65", 65: "ML-DSA-65", 87: "ML-DSA-87"},
}

AES_MODE_MAP = {None: "AES-128-GCM", "gcm": "AES-128-GCM", "cbc": "AES-128-CBC", "ecb": "AES-ECB"}


def asset_dict(entry: dict[str, Any], **overrides: Any) -> dict[str, Any]:
    """Normalise a catalogue entry into the shape persisted to `crypto_assets`."""
    base = {
        "canonical_name": entry["canonical_name"],
        "oid": entry.get("oid"),
        "asset_type": entry.get("asset_type", "algorithm"),
        "family": entry.get("family", "unknown"),
        "primitive": entry.get("primitive", "unknown"),
        "purpose": entry.get("purpose", "unknown"),
        "key_size_bits": entry.get("key_size_bits"),
        "curve": entry.get("curve"),
        "mode": entry.get("mode"),
        "padding": entry.get("padding"),
        "classical_security_bits": entry.get("classical_bits", 0),
        "quantum_security_bits": entry.get("quantum_bits", 0),
        "quantum_status": entry.get("quantum_status", "unknown"),
        "is_post_quantum": bool(entry.get("is_post_quantum", False)),
        "nist_deprecated_after": entry.get("nist_deprecated_after"),
        "nist_disallowed_after": entry.get("nist_disallowed_after"),
        "replacement_hint": entry.get("replacement_hint"),
        "registry_source": "ecdat-policy-pack",
        "meta": {},
    }
    base.update({k: v for k, v in overrides.items() if v is not None})
    return base


def canonicalise(
    name: str | None = None,
    *,
    oid: str | None = None,
    bits: int | None = None,
    curve: str | None = None,
    mode: str | None = None,
    padding: str | None = None,
) -> Optional[dict[str, Any]]:
    """Map an observed string/OID to a canonical asset, or None if unknown.

    Unknown-but-plausible inputs return a synthetic asset with
    `quantum_status='unknown'` rather than being dropped: an unrecognised
    algorithm is an *inventory gap*, and hiding it would break Coverage Honesty.
    """
    if oid and oid in OID_INDEX:
        return asset_dict(ALIAS_INDEX[_norm(OID_INDEX[oid])])

    if name:
        entry = ALIAS_INDEX.get(_norm(name))
        if entry:
            out = asset_dict(entry)
            if curve and not out.get("curve"):
                out["curve"] = curve
            if padding:
                out["padding"] = padding
            return out

    probe = name or ""
    norm = _norm(probe)
    for pattern, family in _HEURISTICS:
        m = re.match(pattern, norm)
        if not m:
            continue
        if family == "AES":
            key_size = bits or (int(re.search(r"aes(\d+)", norm).group(1)) if re.search(r"aes(\d+)", norm) else 128)
            base = asset_dict(ALIAS_INDEX[_norm(f"AES-{key_size}-GCM")])
            if norm.endswith("ecb"):
                base = asset_dict(ALIAS_INDEX[_norm("AES-ECB")])
            elif (mode or "").lower() == "cbc" or "cbc" in norm:
                base = asset_dict(ALIAS_INDEX[_norm(f"AES-{key_size}-CBC")])
            base["key_size_bits"] = key_size
            base["mode"] = (mode or base.get("mode") or "gcm").lower()
            base["canonical_name"] = f"AES-{key_size}-{(mode or base.get('mode') or 'gcm').upper()}"
            return base
        key_size = bits or (int(re.search(r"(\d+)", norm).group(1)) if re.search(r"(\d+)", norm) else None)
        if family in SIZE_FALLBACK and key_size in SIZE_FALLBACK[family]:
            return asset_dict(ALIAS_INDEX[_norm(SIZE_FALLBACK[family][key_size])])
        if family == "RSA":
            return asset_dict(ALIAS_INDEX[_norm(f"RSA-{key_size or 2048}")])
        if family == "ECDSA":
            curve_bits = {"secp224r1": 224, "p-224": 224, "secp256r1": 256, "p-256": 256,
                          "secp384r1": 384, "p-384": 384, "secp521r1": 521, "p-521": 521}
            size = curve_bits.get((curve or "").lower()) or key_size or 256
            return asset_dict(ALIAS_INDEX[_norm(f"ECDSA-P{size}")])
        if family in {"ML-KEM", "ML-DSA"}:
            default = "ML-KEM-768" if family == "ML-KEM" else "ML-DSA-65"
            size = key_size or (768 if family == "ML-KEM" else 65)
            return asset_dict(ALIAS_INDEX[_norm(SIZE_FALLBACK[family].get(size, default))])

    if norm and len(norm) >= 3:
        return {
            "canonical_name": (name or "UNKNOWN").strip()[:120],
            "oid": oid, "asset_type": "algorithm", "family": "unrecognised", "primitive": "unknown",
            "purpose": "unknown", "key_size_bits": bits, "curve": curve, "mode": mode, "padding": padding,
            "classical_security_bits": 0, "quantum_security_bits": 0, "quantum_status": "unknown",
            "is_post_quantum": False, "nist_deprecated_after": None, "nist_disallowed_after": None,
            "replacement_hint": "manual triage required - not in registry",
            "registry_source": "ecdat-policy-pack", "meta": {"unrecognised": True},
        }
    return None


def material_asset(purpose: str, bits: int | None = None, curve: str | None = None,
                   note: str | None = None) -> dict[str, Any]:
    """Key material / non-algorithm crypto assets (CycloneDX related-crypto-material)."""
    return {
        "canonical_name": purpose.replace("_", "-").upper(),
        "oid": None,
        "asset_type": "related_crypto_material",
        "family": "KEY-MATERIAL",
        "primitive": "key",
        "purpose": purpose,
        "key_size_bits": bits,
        "curve": curve,
        "mode": None,
        "padding": None,
        "classical_security_bits": bits or 0,
        "quantum_security_bits": 0,
        "quantum_status": "unknown",
        "is_post_quantum": False,
        "nist_deprecated_after": None,
        "nist_disallowed_after": None,
        "replacement_hint": note or "assess the key type of the material that was loaded",
        "registry_source": "ecdat-policy-pack",
        "meta": {"material": True},
    }


def with_purpose(asset: dict[str, Any], purpose: str) -> dict[str, Any]:
    out = dict(asset)
    out["purpose"] = purpose
    return out


def library_asset(name: str, version: str | None, pqc_capable: bool) -> dict[str, Any]:
    return {
        "canonical_name": f"LIBRARY/{name}" + (f"@{version}" if version else ""),
        "oid": None,
        "asset_type": "library",
        "family": name,
        "primitive": "library",
        "purpose": "unknown",
        "key_size_bits": None, "curve": None, "mode": None, "padding": None,
        "classical_security_bits": 0, "quantum_security_bits": 0,
        "quantum_status": "pqc_resistant" if pqc_capable else "unknown",
        "is_post_quantum": bool(pqc_capable),
        "nist_deprecated_after": None, "nist_disallowed_after": None,
        "replacement_hint": "library declared in manifest; scan the call sites for real usage",
        "registry_source": "ecdat-policy-pack",
        "meta": {"library": True, "pqc_capable": bool(pqc_capable)},
    }


def library_record(name: str, version: str | None, ecosystem: str) -> Optional[dict[str, Any]]:
    key = (name or "").strip().lower()
    rec = LIBRARIES.get(key)
    if rec is None:
        rec = LIBRARIES.get(key.replace("_", "-"))
    if rec is None:
        for known, meta in LIBRARIES.items():
            if key == known.lower() or key in known.lower():
                rec = meta
                break
    if rec is None:
        return None
    return {
        "name": key,
        "version": version,
        "ecosystem": ecosystem or rec.get("ecosystem", "unknown"),
        "is_crypto_library": rec.get("crypto", True),
        "is_pqc_capable": rec.get("pqc", False),
        "notes": rec.get("note"),
    }


def registry_snapshot() -> dict[str, Any]:
    return {
        "policy_pack_version": POLICY_PACK_VERSION,
        "algorithms": len(ALGORITHMS),
        "protocols": len(PROTOCOL_ASSETS),
        "libraries": len(LIBRARIES),
        "bands": POLICY_PACK["bands"],
        "evidence_classes": {k: v["cap"] for k, v in POLICY_PACK["evidence_classes"].items()},
        "scenarios": POLICY_PACK["scenarios"],
    }
