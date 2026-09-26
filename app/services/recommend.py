"""Purpose-aware PQC recommendation engine.

Two rules that separate this from a "replace RSA with ML-KEM" search-and-replace:

* **Purpose first.** A detected RSA used for *key establishment* is a different
  problem from RSA used for *signing*; the migration, the target standard and the
  effort are different. Blind substitution is how PQC migrations fail.
* **Blocked targets are blocked.** FN-DSA (FIPS 206) is not final; we name it
  as the eventual compact-signature answer and mark it not deployable rather
  than pretending it is an option today.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

from app.ids import stable_id

# Targets that exist on paper but must not be recommended for production today.
BLOCKED_TARGETS = {
    "FN-DSA (FIPS 206)": "FIPS 206 is still a draft standard; not deployable for production PKI",
}


@dataclass
class Recommendation:
    target_standard: str
    target_algorithm: str
    target_parameter_set: Optional[str]
    deployment_mode: str
    effort_score: int
    effort_rationale: str
    tradeoff: str
    priority: int
    blocked_reason: Optional[str] = None
    notes: list[str] = field(default_factory=list)

    def reco_id(self, assessment_id: str, current_asset_id: str) -> str:
        return stable_id("rec", assessment_id, current_asset_id, self.target_algorithm)


def build(asset: dict[str, Any], *, mosca_breached: bool = False, is_tls: bool = False) -> Optional[Recommendation]:
    family = asset.get("family", "unknown")
    purpose = asset.get("purpose", "unknown")
    name = asset.get("canonical_name", "unknown")
    quantum_status = asset.get("quantum_status")

    if asset.get("is_post_quantum"):
        return Recommendation(
            target_standard="NIST FIPS 203/204/205 (current)",
            target_algorithm=name, target_parameter_set=None, deployment_mode="current",
            effort_score=0, effort_rationale="already post-quantum; confirm crypto-agility instead",
            tradeoff="none", priority=0,
            notes=["keep crypto-agile: abstract the algorithm behind a provider interface"],
        )

    if purpose in {"key_establishment", "key_agreement"} and family in {"RSA", "ECDH", "DH", "DSA"}:
        if family == "RSA":
            effort, rationale = 80, (
                "RSA key transport (PKCS#1/OAEP encrypt) has no KEM equivalent API: the call sites must move "
                "to Encapsulate/Decapsulate semantics, plus certificate and protocol renegotiation"
            )
        else:
            effort, rationale = 45, (
                "swap the negotiated group/KEM; library and protocol support already exist in OpenSSL 3.5+ / "
                "BoringSSL / Go 1.24+"
            )
        mode = "hybrid" if is_tls or family in {"ECDH", "X25519"} else "direct"
        target = "X25519MLKEM768" if mode == "hybrid" else "ML-KEM-768"
        standard = "RFC 10024 + NIST FIPS 203" if mode == "hybrid" else "NIST FIPS 203"
        return Recommendation(
            target_standard=standard, target_algorithm=target, target_parameter_set="ML-KEM-768",
            deployment_mode=mode, effort_score=effort, effort_rationale=rationale,
            tradeoff=("hybrid keeps interoperability with classical peers at ~2x key-share size (1216 B client key share, "
                      "1120 B server share)" if mode == "hybrid" else
                      "pure PQC requires both endpoints on FIPS 203 capable stacks"),
            priority=90 if mosca_breached else 70,
        )

    if purpose == "digital_signature" and family in {"RSA", "ECDSA", "EdDSA", "DSA"}:
        long_lived_anchor = is_tls and (asset.get("key_size_bits") or 0) >= 2048
        return Recommendation(
            target_standard="NIST FIPS 204 (hybrid composite recommended during transition)",
            target_algorithm="ML-DSA-65", target_parameter_set="ML-DSA-65",
            deployment_mode="hybrid", effort_score=60,
            effort_rationale=("certificate chains, JWKS and any pinned signature must be re-issued; "
                              "token and header size grows (ML-DSA-65 signature ~3309 B)"),
            tradeoff=("composite RSA+ML-DSA signatures double certificate size: fragmentation risk for UDP/DNSSEC, "
                      "larger CAs and longer handshakes"),
            priority=85 if mosca_breached else 65,
            notes=(["consider SLH-DSA (FIPS 205) for long-lived trust anchors and firmware signing"]
                   if long_lived_anchor else []),
        )

    if family == "X.509":
        return Recommendation(
            target_standard="NIST FIPS 204", target_algorithm="ML-DSA-65", target_parameter_set="ML-DSA-65",
            deployment_mode="hybrid", effort_score=70,
            effort_rationale="re-issue the certificate from a PQC-capable CA; legacy clients need a parallel classical chain",
            tradeoff="browsers/clients without PQC trust anchors will reject a pure PQC chain; run both during transition",
            priority=80,
        )

    if family == "AES":
        if "ECB" in name:
            return Recommendation(
                target_standard="NIST FIPS 197", target_algorithm="AES-256-GCM", target_parameter_set="AES-256-GCM",
                deployment_mode="direct", effort_score=30,
                effort_rationale="mode change plus nonce/IV handling; no API change",
                tradeoff="nonce uniqueness becomes a correctness requirement in GCM",
                priority=75,
            )
        bits = asset.get("key_size_bits") or 128
        if bits < 256:
            return Recommendation(
                target_standard="NIST FIPS 197", target_algorithm="AES-256-GCM", target_parameter_set="AES-256-GCM",
                deployment_mode="direct", effort_score=15,
                effort_rationale="key-size parameter change (128 -> 256) plus keystore/HSM slot re-generation",
                tradeoff="doubles symmetric key material; Grover reduces AES-128 to 64-bit quantum security",
                priority=45,
            )
        return None

    if family in {"SHA-1", "MD"}:
        return Recommendation(
            target_standard="NIST FIPS 180-4 / FIPS 202", target_algorithm="SHA-256",
            target_parameter_set="SHA-256", deployment_mode="direct", effort_score=15,
            effort_rationale="digest parameter change; verify stored digests and signature formats",
            tradeoff="digest values change - stored hashes, checksums and signed manifests must be recomputed",
            priority=70,
        )

    if family in {"DES", "RC4"}:
        return Recommendation(
            target_standard="NIST FIPS 197", target_algorithm="AES-256-GCM", target_parameter_set="AES-256-GCM",
            deployment_mode="direct", effort_score=25, effort_rationale="cipher + mode replacement, wire format change",
            tradeoff="data encrypted with the old cipher must be migrated (re-encrypted), not just re-keyed",
            priority=85,
        )

    if family == "TLS":
        return Recommendation(
            target_standard="RFC 8446 (TLS 1.3)", target_algorithm="TLSv1.3", target_parameter_set=None,
            deployment_mode="direct", effort_score=30,
            effort_rationale="terminate and re-configure the TLS endpoint; legacy clients must be retired",
            tradeoff="TLS 1.3 removes static RSA/DH and CBC cipher suites from the negotiation entirely",
            priority=75,
        )

    if purpose == "jwt_alg_none":
        return Recommendation(
            target_standard="RFC 7515", target_algorithm="reject 'none' - require HS256/RS256/ES256",
            target_parameter_set=None, deployment_mode="direct", effort_score=5,
            effort_rationale="one-line verification guard plus a regression test",
            tradeoff="none - this is a vulnerability fix, not a migration",
            priority=95,
        )

    if purpose == "randomness":
        return Recommendation(
            target_standard="platform CSPRNG", target_algorithm="os.urandom / SecureRandom / crypto.getRandomValues",
            target_parameter_set=None, deployment_mode="direct", effort_score=10,
            effort_rationale="replace the RNG call sites", tradeoff="none",
            priority=80,
        )

    if asset.get("asset_type") == "library":
        capable = bool((asset.get("meta") or {}).get("pqc_capable"))
        return Recommendation(
            target_standard="crypto-agility",
            target_algorithm=("pin a FIPS 203/204 capable provider (OpenSSL 3.5+, BoringSSL, AWS-LC, liboqs)"
                             if capable else "evaluate a PQC-capable provider before it is embedded in a long-lived product"),
            target_parameter_set=None, deployment_mode="direct", effort_score=20,
            effort_rationale="provider abstraction so the algorithm can be swapped without a code change",
            tradeoff="dependency upgrade churn in CI",
            priority=25 if capable else 35,
        )

    if quantum_status == "unknown":
        return Recommendation(
            target_standard="manual triage", target_algorithm="identify the algorithm and add it to the policy pack",
            target_parameter_set=None, deployment_mode="direct", effort_score=15,
            effort_rationale="asset is not in the registry; it cannot be scored honestly until classified",
            tradeoff="none", priority=30,
            notes=[f"unrecognised asset: {name}"],
        )
    return None
