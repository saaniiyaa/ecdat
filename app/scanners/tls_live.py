"""Tier 4 - bounded, opt-in live TLS probe.

The tool is static-first and air-gap safe, so this module is disabled unless
`ECDAT_ALLOW_LIVE_PROBE=true` **and** the host is on the allow-list. It is what
turns "the config says TLS 1.2" into "an attacker actually gets TLS 1.2 with
ECDHE-RSA-AES128-SHA" - the evidence class `OBSERVED`, the only one that cannot
be argued with during an audit.
"""

from __future__ import annotations

import socket
import ssl
from typing import Any

from app.registry import canonicalise, with_purpose
from app.scanners.source_context import source_context
from app.scanners.base import OBSERVED, RawFinding
from app.scanners.certs import _public_key_asset

try:
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes

    HAVE_CRYPTOGRAPHY = True
except Exception:  # pragma: no cover
    HAVE_CRYPTOGRAPHY = False

CIPHER_MAP = [
    (r"ECDHE-RSA-AES128-GCM-SHA256|AES128-GCM-SHA256", "AES-128-GCM"),
    (r"ECDHE-ECDSA-AES128-GCM-SHA256", "AES-128-GCM"),
    (r"AES256-GCM-SHA384", "AES-256-GCM"),
    (r"DHE-RSA-AES128-SHA|AES128-SHA", "AES-128-CBC"),
    (r"DHE-RSA-AES256-SHA", "AES-256-CBC"),
    (r"DES-CBC3-SHA", "3DES"),
    (r"RC4-SHA|RC4-MD5", "RC4"),
    (r"NULL", "AES-ECB"),
    (r"TLS_EMPTY_RENEGOTIATION", "TLSv1.2"),
]


class TlsProbe:
    name = "scanner.tls_live"
    tier = "network"
    source = "live"

    def __init__(self, allowed_hosts: tuple[str, ...], timeout: float = 3.0) -> None:
        self.allowed_hosts = allowed_hosts
        self.timeout = timeout

    def permitted(self, host: str) -> bool:
        return host in self.allowed_hosts

    def probe(self, host: str, port: int) -> tuple[list[RawFinding], dict[str, Any]]:
        if not self.permitted(host):
            raise PermissionError(f"live probe not permitted for host {host!r} (allow-list)")
        if not HAVE_CRYPTOGRAPHY:
            raise RuntimeError("cryptography is required for the live probe")

        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        try:  # allow weak suites so the probe can *observe* a weak deployment
            ctx.set_ciphers("ALL:@SECLEVEL=0")
        except ssl.SSLError:
            pass

        with socket.create_connection((host, port), timeout=self.timeout) as raw:
            with ctx.wrap_socket(raw, server_hostname=host) as tls:
                version = tls.version() or "unknown"
                cipher_info = tls.cipher() or ("", "", 0)
                der = tls.getpeercert(binary_form=True)

        endpoint = f"{host}:{port}"
        rel = f"live://{endpoint}"
        out: list[RawFinding] = []

        version_asset = canonicalise(version)
        if version_asset:
            out.append(RawFinding(file_path=rel, asset=version_asset, detector_id=self.name,
                                  evidence_class=OBSERVED, confidence=0.95,
                                  symbol=f"negotiated {version}", snippet=f"{version} {cipher_info[0]}",
                                  source="live", extra=source_context(rel)))

        suite = cipher_info[0] or ""
        bits = cipher_info[2]
        for pattern, canonical in CIPHER_MAP:
            import re

            if re.search(pattern, suite, re.I):
                asset = canonicalise(canonical)
                if asset:
                    out.append(RawFinding(file_path=rel, asset=asset, detector_id=self.name,
                                          evidence_class=OBSERVED, confidence=0.9,
                                          symbol=f"cipher suite {suite}", snippet=f"{suite} ({bits} bits)",
                                          source="live", extra=source_context(rel)))
                break

        exposure: dict[str, Any] = {
            "endpoint": endpoint, "protocol": "tls", "version": version, "cipher_suite": suite,
            "source": "live", "negotiated_bits": bits,
        }

        if der:
            cert = x509.load_der_x509_certificate(der)
            fingerprint = cert.fingerprint(hashes.SHA256()).hex()
            exposure["peer_cert_fingerprint"] = fingerprint
            pub_asset, bits_, curve = _public_key_asset(cert.public_key())
            if pub_asset:
                exposure["public_key_algorithm"] = pub_asset["canonical_name"]
                out.append(RawFinding(file_path=rel, asset=pub_asset, detector_id=self.name,
                                      evidence_class=OBSERVED, confidence=0.95,
                                      symbol=f"served key {pub_asset['canonical_name']}",
                                      snippet=f"peer cert {fingerprint[:16]}", source="live", extra=source_context(rel)))
            sig_family = cert.signature_algorithm_oid._name  # human readable, e.g. sha256WithRSAEncryption
            if sig_family:
                asset = canonicalise("RSA-2048" if "RSA" in sig_family else "ECDSA-P256")
                if asset:
                    out.append(RawFinding(file_path=rel, asset=with_purpose(asset, "digital_signature"),
                                          detector_id=self.name, evidence_class=OBSERVED, confidence=0.9,
                                          symbol=f"served signature {sig_family}", snippet=sig_family,
                                          source="live", extra=source_context(rel)))
        return out, exposure


SCANNER = TlsProbe(allowed_hosts=())
