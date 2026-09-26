"""Tier 3 - server / library configuration surfaces (nginx, Apache, sshd, IPsec, OpenSSL, java.security).

Configuration is where real-world weak crypto hides: a source scan of a
banking service reports "AES-256-GCM", while the TLS terminator in front of it
still offers 3DES and TLS 1.0. These findings are PATTERN class (high cap).
"""

from __future__ import annotations

import re
from pathlib import Path

from app.registry import canonicalise, library_asset
from app.scanners.base import PATTERN, RawFinding

CONFIG_NAMES = {"nginx.conf", "httpd.conf", "apache2.conf", "sshd_config", "ipsec.conf", "openssl.cnf",
                "java.security", "crypto-policy", "nginx.tpl", "httpd-tls.conf", "openvpn.conf",
                "strongswan.conf", "tls.conf"}
CONFIG_HINTS = ("nginx", "apache", "httpd", "sshd", "ipsec", "openssl", "java.security", "crypto", "tls",
                "haproxy", "envoy", "caddy")

CIPHER_TOKENS = [
    (r"\bDES-CBC3-SHA\b|\b3DES\b|\bDES-EDE3\b", "3DES"),
    (r"\bRC4[-_]", "RC4"),
    (r"\bRC2[-_]", "DES"),
    (r"\bNULL[-_]", "AES-ECB"),
    (r"\bEXPORT\b|\bEXP-", "RSA-2048"),
    (r"\bADH[-_]|\bAECDH[-_]", "X25519"),
    (r"\bDES[-_](?!CBC3)", "DES"),
    (r"\bMD5\b", "MD5"),
    (r"\bSHA1\b|\bSHA-1\b", "SHA-1"),
    (r"\bECDHE-RSA-AES128-GCM-SHA256\b|\bAES128-GCM-SHA256\b", "AES-128-GCM"),
    (r"\bECDHE-RSA-AES256-GCM-SHA384\b|\bAES256-GCM-SHA384\b", "AES-256-GCM"),
    (r"\bDHE-RSA-AES128-SHA\b|\bAES128-SHA\b", "AES-128-CBC"),
    (r"\bECDHE-ECDSA-(?:CHACHA20-POLY1305|AESGCM)\b", "ChaCha20-Poly1305"),
    (r"\bX25519MLKEM768\b|\bX25519\+?MLKEM768?\b", "X25519MLKEM768"),
    (r"\bX25519\b", "X25519"),
    (r"\bsecp256r1\b|\bP-256\b|\bprime256v1\b", "ECDSA-P256"),
    (r"\bsecp384r1\b|\bP-384\b", "ECDSA-P384"),
    (r"\bffdhe2048\b|\bdhe2048\b", "DH-2048"),
    (r"\bAES-256-GCM\b", "AES-256-GCM"),
]

LINE = re.compile(r"^\s*([A-Za-z0-9_.\-]+)\s+(.+?);?\s*$")


class ConfigScanner:
    name = "scanner.config"
    tier = "config"
    source = "config"

    def supports(self, path: Path, size: int) -> bool:
        lowered = path.name.lower()
        if lowered in CONFIG_NAMES:
            return True
        if path.suffix.lower() in {".cnf", ".conf"} and any(h in lowered for h in CONFIG_HINTS):
            return True
        return False

    def scan_text(self, text: str, rel_path: str) -> list[RawFinding]:
        out: list[RawFinding] = []
        seen: set[tuple[int, str]] = set()
        directives = {"ssl_protocols", "ssl_ciphers", "sslv3", "tlsv1", "protocols", "ciphersuites",
                      "ciphers", "macs", "kexalgorithms", "hostkeyalgorithms", "cipherstring",
                      "minprotocol", "maxprotocol", "ssl_min_protocol", "ssl_max_protocol",
                      "jdk.tls.disabledalgorithms", "jdk.certpath.disabledalgorithms", "keystore.type",
                      "ssl_certificate", "ssl_certificate_key", "ssl_dhparam", "ike", "esp", "auth",
                      "keyexchange", "loglevel", "default_md", "curves", "ssl_prefer_server_ciphers",
                      "tls_enabled_ciphersuites", "confine_to_ciphersuite"}
        for idx, raw in enumerate(text.splitlines(), start=1):
            line = raw.split("#", 1)[0].strip() if not raw.strip().startswith("#") else ""
            if not line:
                continue
            m = LINE.match(line)
            directive = (m.group(1).lower() if m else "").strip()
            if directive not in directives:
                continue
            value = (m.group(2) if m else "").strip().rstrip(";")

            for pattern, canonical in CIPHER_TOKENS:
                for hit in re.finditer(pattern, value, re.I):
                    asset = canonicalise(canonical)
                    if not asset:
                        continue
                    key = (idx, asset["canonical_name"])
                    if key in seen:
                        continue
                    seen.add(key)
                    out.append(self._f(rel_path, asset, idx, f"{directive}: {hit.group(0)}"))

            for hit in re.finditer(r"TLSv1(?:\.\d)?|SSLv[23]", value):
                asset = canonicalise(hit.group(0))
                if not asset:
                    continue
                key = (idx, asset["canonical_name"])
                if key in seen:
                    continue
                seen.add(key)
                out.append(self._f(rel_path, asset, idx, f"{directive}: {hit.group(0)}"))

            if directive in {"ssl_certificate", "ssl_certificate_key", "ssl_dhparam"}:
                kind = "certificate" if "certificate" in directive else "key-material"
                out.append(
                    RawFinding(
                        file_path=rel_path,
                        asset={
                            "canonical_name": f"CONFIG-PATH/{kind.upper()}",
                            "oid": None, "asset_type": "related_crypto_material", "family": "CONFIG",
                            "primitive": "reference", "purpose": kind, "key_size_bits": None, "curve": None,
                            "mode": None, "padding": None, "classical_security_bits": 0, "quantum_security_bits": 0,
                            "quantum_status": "unknown", "is_post_quantum": False,
                            "nist_deprecated_after": None, "nist_disallowed_after": None,
                            "replacement_hint": f"resolve {value} to its certificate/key facts",
                            "registry_source": "ecdat-policy-pack", "meta": {"config_reference": value},
                        },
                        detector_id=self.name, evidence_class=PATTERN, confidence=0.7,
                        line_start=idx, symbol=f"{directive} {value}", snippet=f"{directive} {value};",
                        source=self.source,
                    )
                )

        # java.security / crypto policy provider references
        for hit in re.finditer(r"(?m)^\s*(jdk\.tls\.disabledAlgorithms|security\.provider\.\d+)\s*=\s*(.+)$", text):
            if "disabled" in hit.group(1).lower() or "provider" in hit.group(1):
                out.append(
                    RawFinding(
                        file_path=rel_path, asset=library_asset("java.security-policy", None, False),
                        detector_id=self.name, evidence_class=PATTERN, confidence=0.65,
                        symbol=hit.group(1), snippet=hit.group(0).strip()[:200], source=self.source,
                    )
                )
        return out

    def _f(self, rel_path: str, asset: dict, line: int, symbol: str) -> RawFinding:
        return RawFinding(
            file_path=rel_path, asset=asset, detector_id=self.name, evidence_class=PATTERN,
            confidence=0.75, line_start=line, line_end=line, symbol=symbol[:120],
            snippet=symbol[:200], source=self.source,
        )


SCANNER = ConfigScanner()
