"""Tier 3 - X.509 certificates and key material (ASN.1, not text matching).

Hard rule enforced here: **no key material is ever stored**. Private keys are
parsed in volatile memory only to learn their type/size, then dropped; only
public parameters, fingerprints and validity facts are persisted.
"""

from __future__ import annotations

import base64
import datetime as dt
import re
from pathlib import Path

from app.registry import SIG_ALG_OIDS, canonicalise, material_asset, with_purpose
from app.scanners.source_context import source_context
from app.scanners.base import PARSED_STRUCTURE, RawFinding, redact

PEM_CERT = re.compile(
    r"-----BEGIN (?:TRUSTED )?CERTIFICATE-----.*?-----END (?:TRUSTED )?CERTIFICATE-----", re.S
)
PEM_KEY = re.compile(
    r"-----BEGIN ((?:RSA |EC |DSA |ENCRYPTED |OPENSSH )?PRIVATE KEY)-----.*?-----END [A-Z ]*PRIVATE KEY-----", re.S
)
PEM_DHPARAM = re.compile(r"-----BEGIN DH PARAMETERS-----.*?-----END DH PARAMETERS-----", re.S)

try:  # cryptography is the reference ASN.1/X.509 implementation
    from cryptography import x509
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import dsa, ec, ed25519, ed448, rsa, x25519, x448

    HAVE_CRYPTOGRAPHY = True
except Exception:  # pragma: no cover - degrade instead of crash
    HAVE_CRYPTOGRAPHY = False


def _public_key_asset(pub) -> tuple[dict | None, int | None, str | None]:
    if rsa.RSAPublicKey and isinstance(pub, rsa.RSAPublicKey):
        return canonicalise(f"RSA-{pub.key_size}"), pub.key_size, None
    if isinstance(pub, ec.EllipticCurvePublicKey):
        mapping = {"secp256r1": "ECDSA-P256", "secp384r1": "ECDSA-P384",
                   "secp521r1": "ECDSA-P521", "secp224r1": "ECDSA-P224"}
        canonical = mapping.get(pub.curve.name, pub.curve.name)
        asset = canonicalise(canonical, curve=pub.curve.name)
        if asset:
            asset = with_purpose(asset, "key_establishment")
        return asset, pub.curve.key_size, pub.curve.name
    if isinstance(pub, ed25519.Ed25519PublicKey):
        return canonicalise("Ed25519"), 256, "ed25519"
    if isinstance(pub, ed448.Ed448PublicKey):
        return canonicalise("Ed25519"), 456, "ed448"
    if isinstance(pub, x25519.X25519PublicKey):
        return canonicalise("X25519"), 256, "x25519"
    if isinstance(pub, x448.X448PublicKey):
        return canonicalise("X25519"), 448, "x448"
    if isinstance(pub, dsa.DSAPublicKey):
        return canonicalise(f"DSA-{pub.key_size}"), pub.key_size, None
    return None, None, None


class CertificateScanner:
    name = "scanner.certificates"
    tier = "cert"
    source = "cert"

    def supports(self, path: Path, size: int) -> bool:
        return path.suffix.lower() in {".pem", ".crt", ".cer", ".der", ".p12", ".pfx", ".key", ".csr"}

    def scan_text(self, text: str, rel_path: str) -> list[RawFinding]:
        if not HAVE_CRYPTOGRAPHY:
            return []
        out: list[RawFinding] = []
        for block in PEM_CERT.findall(text):
            out.extend(self._parse_cert(block, rel_path))
        for match in PEM_KEY.finditer(text):
            out.append(self._parse_key(match.group(1), match.group(0), rel_path))
        for block in PEM_DHPARAM.findall(text):
            out.append(
                RawFinding(
                    file_path=rel_path,
                    asset=canonicalise("DH-2048"),
                    detector_id=self.name,
                    evidence_class=PARSED_STRUCTURE,
                    confidence=0.9,
                    symbol="DH PARAMETERS",
                    snippet="PEM DH PARAMETERS block",
                    source=self.source,
                    extra={**source_context(rel_path),
                           "key_material": {"kind": "dh_parameters", "bits": 2048}},
                )
            )
        return out

    # ------------------------------------------------------------------ #
    def _parse_cert(self, block: str, rel_path: str) -> list[RawFinding]:
        try:
            cert = x509.load_pem_x509_certificate(block.encode())
        except Exception:
            return []
        out: list[RawFinding] = []

        sig_oid = cert.signature_algorithm_oid.dotted_string
        sig_family = SIG_ALG_OIDS.get(sig_oid)
        try:
            hash_name = cert.signature_hash_algorithm.name if cert.signature_hash_algorithm else None
        except Exception:
            hash_name = None

        pub_asset, bits, curve = _public_key_asset(cert.public_key())
        try:
            not_before = cert.not_valid_before_utc
            not_after = cert.not_valid_after_utc
        except AttributeError:  # cryptography < 42
            not_before = cert.not_valid_before
            not_after = cert.not_valid_after
        not_before = not_before.replace(tzinfo=None)
        not_after = not_after.replace(tzinfo=None)

        try:
            bc = cert.extensions.get_extension_for_class(x509.BasicConstraints)
            is_ca = bool(bc.value.ca)
        except x509.ExtensionNotFound:
            is_ca = False
        self_signed = cert.subject == cert.issuer
        fp = cert.fingerprint(hashes_sha256()) if False else None  # placeholder, replaced below

        from cryptography.hazmat.primitives import hashes as _hashes

        fingerprint = cert.fingerprint(_hashes.SHA256()).hex()

        days_to_expiry = (not_after - dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)).days
        cert_record = {
            "fingerprint_sha256": fingerprint,
            "subject": cert.subject.rfc4514_string()[:500],
            "issuer": cert.issuer.rfc4514_string()[:500],
            "serial_number": str(cert.serial_number)[:120],
            # ISO strings: this dict is persisted as JSON evidence, and datetimes
            # are not JSON-serialisable.
            "not_before": not_before.isoformat(),
            "not_after": not_after.isoformat(),
            "days_to_expiry": days_to_expiry,
            "expired": days_to_expiry < 0,
            "signature_algorithm": f"{sig_family or sig_oid}/{hash_name or '?'}",
            "public_key_algorithm": curve or (sig_family or ""),
            "public_key_bits": bits,
            "is_ca": is_ca,
            "is_self_signed": self_signed,
            "source_path": rel_path,
        }

        # The certificate itself as a crypto asset (asset_type=certificate).
        cert_asset = {
            "canonical_name": f"X509/{fingerprint[:16]}",
            "oid": sig_oid, "asset_type": "certificate", "family": "X.509",
            "primitive": "certificate", "purpose": "pki",
            "key_size_bits": bits, "curve": curve, "mode": None, "padding": None,
            "classical_security_bits": 0, "quantum_security_bits": 0,
            "quantum_status": "shor_vulnerable" if (sig_family or "").startswith(("RSA", "ECDSA", "DSA", "EC")) else "unknown",
            "is_post_quantum": False, "nist_deprecated_after": None, "nist_disallowed_after": 2035,
            "replacement_hint": "re-issue with ML-DSA-65 (FIPS 204); hybrid during transition",
            "registry_source": "ecdat-policy-pack", "meta": {},
        }
        out.append(
            RawFinding(
                file_path=rel_path, asset=cert_asset, detector_id=self.name,
                evidence_class=PARSED_STRUCTURE, confidence=0.95,
                symbol=f"certificate {cert.subject.rfc4514_string()[:60]}",
                snippet=f"subject={cert_record['subject'][:80]} issuer={cert_record['issuer'][:80]} "
                        f"valid_until={not_after.date().isoformat()} sig={cert_record['signature_algorithm']}",
                source=self.source,
                extra={**source_context(rel_path), "certificate": cert_record},
            )
        )

        if pub_asset:
            out.append(
                RawFinding(
                    file_path=rel_path, asset=pub_asset, detector_id=self.name,
                    evidence_class=PARSED_STRUCTURE, confidence=0.95,
                    symbol=f"public key {pub_asset['canonical_name']}",
                    snippet=f"SubjectPublicKeyInfo: {pub_asset['canonical_name']}",
                    source=self.source, extra={**source_context(rel_path), "certificate": cert_record},
                )
            )

        if sig_family:
            sig_asset = canonicalise("RSA-2048" if sig_family == "RSA" else sig_family)
            if sig_asset:
                out.append(
                    RawFinding(
                        file_path=rel_path, asset=with_purpose(sig_asset, "digital_signature"),
                        detector_id=self.name, evidence_class=PARSED_STRUCTURE, confidence=0.92,
                        symbol=f"signature algorithm {cert_record['signature_algorithm']}",
                        snippet=f"signatureAlgorithm={cert_record['signature_algorithm']}",
                        source=self.source, extra={**source_context(rel_path), "certificate": cert_record},
                    )
                )
        if hash_name:
            hash_asset = canonicalise(hash_name.upper().replace("-", ""))
            if hash_asset and hash_asset["canonical_name"] in {"MD5", "SHA-1", "SHA-224"}:
                out.append(
                    RawFinding(
                        file_path=rel_path, asset=with_purpose(hash_asset, "digital_signature"),
                        detector_id=self.name, evidence_class=PARSED_STRUCTURE, confidence=0.93,
                        symbol=f"certificate digest {hash_name}", snippet=f"signature hash {hash_name}",
                        source=self.source, extra={**source_context(rel_path), "certificate": cert_record},
                    )
                )
        return out

    def _parse_key(self, label: str, block: str, rel_path: str) -> RawFinding:
        bits: int | None = None
        curve: str | None = None
        algorithm = label.strip().replace("PRIVATE KEY", "").strip() or "UNKNOWN"
        try:
            key = serialization.load_pem_private_key(block.encode(), password=None)
            pub = key.public_key()
            asset, bits, curve = _public_key_asset(pub)
        except Exception:
            asset = None
        if asset is None:
            asset = material_asset("private_key_material", bits=bits, curve=curve)
        else:
            asset = dict(asset)
            asset["canonical_name"] = f"KEY/{asset['canonical_name']}-PRIVATE"
            asset["asset_type"] = "related_crypto_material"
            asset["family"] = "KEY-MATERIAL"
            asset["primitive"] = "key"
            asset["purpose"] = "private_key_material"
        return RawFinding(
            file_path=rel_path, asset=asset, detector_id=self.name,
            evidence_class=PARSED_STRUCTURE, confidence=0.94,
            symbol=f"{algorithm} private key block",
            snippet=redact("-----BEGIN PRIVATE KEY----- (contents redacted; not stored)"),
            source=self.source,
            extra={**source_context(rel_path),
                   "key_material": {"kind": "private_key", "algorithm": algorithm, "bits": bits, "curve": curve},
                   "hardcoded_material": True},
        )


def hashes_sha256():  # pragma: no cover - keeps the fingerprint line above readable
    from cryptography.hazmat.primitives import hashes

    return hashes.SHA256()


SCANNER = CertificateScanner()
