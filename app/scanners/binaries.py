"""Tier 2 - native binaries (ELF / PE / Mach-O) and opaque blobs.

Two evidence sources, deliberately kept at low confidence:

* PARSED_STRUCTURE - file magic, section names, imported symbol names. We know
  the binary really links a crypto library.
* INFERRED - embedded crypto constants (AES S-box, SHA-256 K, ChaCha sigma,
  DES IP, MD5 T) and PQC algorithm name strings. The constant may belong to a
  vendored static copy we cannot attribute, so these findings are capped at the
  medium band and may never escalate a system to Critical on their own.
"""

from __future__ import annotations

from pathlib import Path

from app.registry import canonicalise, library_asset
from app.scanners.source_context import source_context
from app.scanners.base import INFERRED, SYMBOL_INFERRED, RawFinding, printable_strings

MAGIC = {
    b"\x7fELF": "ELF",
    b"MZ": "PE/COFF",
    b"\xcf\xfa\xed\xfe": "Mach-O 64",
    b"\xce\xfa\xed\xfe": "Mach-O 32",
    b"!<arch>": "AR archive",
    b"PK\x03\x04": "ZIP/OOXML",
}

AES_SBOX = bytes([0x63, 0x7C, 0x77, 0x7B, 0xF2, 0x6B, 0x6F, 0xC5, 0x30, 0x01, 0x67, 0x2B, 0xFE, 0xD7, 0xAB, 0x76])
SHA256_K = bytes.fromhex("982f8a4291443771cffbc0b5")
SHA256_H0 = bytes.fromhex("6ae09e6679bb4f53")
MD5_T1 = bytes.fromhex("78a46ad7")
BLOWFISH_P = bytes.fromhex("886a3f24")
DES_IP = bytes([58, 50, 42, 34, 26, 18, 10, 2])
CHACHA_SIGMA = b"expand 32-byte k"
PQC_STRINGS = [b"X25519MLKEM768", b"ML-KEM-768", b"ML-KEM-1024", b"ML-KEM", b"mlkem", b"Kyber768",
               b"ML-DSA-65", b"ML-DSA", b"SLH-DSA", b"SPHINCS+", b"oqs", b"OQS_KEM", b"pqc"]
LIB_STRINGS = [b"libcrypto.so", b"libssl.so", b"libnss3", b"libwolfssl", b"mbedtls_", b"libgcrypt",
               b"libsodium", b"bcprov", b"boringssl", b"liboqs", b"oqs-provider", b"libjose",
               b"tink", b"BoringSSL", b"aws-lc", b"botan", b"libgcrypt", b"libnettle"]
ALGO_STRINGS = [(b"RSA_sign", "RSA-2048"), (b"RSA_verify", "RSA-2048"), (b"RSA_generate_key", "RSA-2048"),
                (b"ECDSA_sign", "ECDSA-P256"), (b"ECDSA_do_sign", "ECDSA-P256"),
                (b"EC_KEY_new_by_curve_name", "ECDSA-P256"), (b"DH_compute_key", "X25519"),
                (b"AES_encrypt", "AES-128-GCM"), (b"AES_set_encrypt_key", "AES-128-GCM"),
                (b"ChaCha20_encrypt", "ChaCha20-Poly1305"), (b"SHA256_Init", "SHA-256"),
                (b"SHA1_Init", "SHA-1"), (b"MD5_Init", "MD5"), (b"EVP_EncryptInit_ex", "AES-256-GCM"),
                (b"EVP_PKEY_encrypt", "RSA-2048"), (b"EVP_DigestSignInit", "ECDSA-P256")]


class BinaryScanner:
    name = "scanner.binary"
    tier = "binary"
    source = "binary"

    def supports(self, path: Path, size: int) -> bool:
        return path.suffix.lower() in {".so", ".dll", ".dylib", ".a", ".lib", ".o", ".obj", ".exe",
                                       ".bin", ".elf", ".wasm", ".ko", ".sys", ".jar", ".apk"}

    def classify(self, data: bytes) -> str:
        for magic, label in MAGIC.items():
            if data.startswith(magic):
                return label
        return "opaque-blob"

    def scan_bytes(self, data: bytes, rel_path: str) -> list[RawFinding]:
        kind = self.classify(data)
        out: list[RawFinding] = []
        if kind == "opaque-blob":
            return out

        # 1) structured evidence: library and algorithm symbols
        strings = list(printable_strings(data, min_len=5, limit=6000))
        joined = "\n".join(strings)
        seen: set[str] = set()

        for token, canonical in ALGO_STRINGS:
            if token in data and canonical not in seen:
                seen.add(canonical)
                asset = canonicalise(canonical)
                if asset:
                    out.append(self._f(rel_path, asset, SYMBOL_INFERRED, 0.7, f"symbol {token.decode()}", joined))

        for token in LIB_STRINGS:
            name = token.decode()
            if token in data and f"LIB/{name}" not in seen:
                seen.add(f"LIB/{name}")
                out.append(self._f(rel_path, library_asset(name, None, b"oqs" in token or b"tink" in token),
                                   SYMBOL_INFERRED, 0.65, f"linked library {name}", joined))

        for token in PQC_STRINGS:
            if token in data and f"PQC/{token.decode()}" not in seen:
                seen.add(f"PQC/{token.decode()}")
                canonical = "X25519MLKEM768" if b"X25519MLKEM768" in token else "ML-KEM-768"
                out.append(self._f(rel_path, canonicalise(canonical), INFERRED, 0.5,
                                   f"PQC identifier {token.decode()}", joined))

        # 2) inferred evidence: embedded constants
        constants = [
            (AES_SBOX, "AES-128-GCM", "AES S-box"),
            (SHA256_K, "SHA-256", "SHA-256 round constant K[0]"),
            (SHA256_H0, "SHA-256", "SHA-256 initial hash H[0]"),
            (MD5_T1, "MD5", "MD5 sine table T[0]"),
            (BLOWFISH_P, "DES", "Blowfish P-array P[0]"),
            (DES_IP, "DES", "DES initial permutation table"),
        ]
        for needle, canonical, label in constants:
            if needle in data:
                asset = canonicalise(canonical)
                if asset:
                    out.append(self._f(rel_path, asset, INFERRED, 0.4, f"constant: {label}", joined))

        if CHACHA_SIGMA in data:
            out.append(self._f(rel_path, canonicalise("ChaCha20-Poly1305"), INFERRED, 0.45,
                               "constant: ChaCha20 sigma", joined))
        return out

    def _f(self, rel_path: str, asset: dict, evidence: str, conf: float, symbol: str, joined: str) -> RawFinding:
        line = None
        for idx, line_text in enumerate(joined.splitlines()[:20000], start=1):
            if symbol.split()[-1] in line_text:
                line = idx
                break
        return RawFinding(
            file_path=rel_path, asset=asset, detector_id=self.name, evidence_class=evidence,
            confidence=conf, symbol=symbol[:120], source=self.source,
            extra={**source_context(rel_path),
                   "binary_kind": self.classify(symbol.encode()) if False else None},
        )


SCANNER = BinaryScanner()
