"""Dual-track risk engine.

Design contract (the reason this file exists in this shape):

1. **Two tracks, never conflated.** `classical_risk` = exploitable today on a
   classical computer. `quantum_risk` = exposure under a CRQC. A tool that
   merges them tells a bank that SHA-256 is "quantum vulnerable" and that AES-128
   needs replacing "because of quantum", which is wrong and destroys trust.
2. **Every point is attributable.** Each contribution is emitted as a
   `RiskFactor(rule_id, delta, evidence)` row, so any score in a report can be
   recomputed by hand and challenged in an audit.
3. **Evidence gates the severity.** A finding backed only by a binary constant
   (INFERRED) or a manifest line (DECLARED_ONLY) can never reach Critical - the
   policy pack caps it. Promotions require corroborated, attributable evidence.
4. **Mosca can raise a floor.** Long-lived sensitive data under Shor-vulnerable
   key establishment is Critical *by time*, even if the algorithm is currently
   "acceptable"; that is precisely the failure mode HNDL exploits.
5. **Urgency != effort.** Mosca's Y grows with effort, so a hard migration is
   often the *urgent* one. We keep the two numbers separate instead of ranking
   by a single blended score.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field
from typing import Any, Optional

from app.ids import stable_id
from app.registry import BAND_ORDER, POLICY_PACK, band_for, band_cap
from app.services.mosca import MoscaResult, evaluate

CURRENT_YEAR = dt.date.today().year

# --------------------------------------------------------------------------- #
# Rule table - (asset family, purpose) -> base severity per track
# --------------------------------------------------------------------------- #
CLASSICAL_BASE: list[tuple[str, str, int, str]] = [
    # (family, purpose, score, rule_id)
    ("MD", "integrity", 85, "CL-001"),
    ("SHA-1", "integrity", 70, "CL-002"),
    ("SHA-1", "digital_signature", 80, "CL-003"),
    ("DES", "encryption", 88, "CL-004"),
    ("RC4", "encryption", 90, "CL-005"),
    ("AES", "encryption", 0, "CL-006"),
    ("TLS", "protocol", 10, "CL-007"),
    ("RSA", "key_establishment", 25, "CL-008"),
    ("RSA", "digital_signature", 20, "CL-009"),
    ("ECDH", "key_establishment", 20, "CL-010"),
    ("DH", "key_establishment", 30, "CL-011"),
    ("ECDSA", "digital_signature", 20, "CL-012"),
    ("EdDSA", "digital_signature", 20, "CL-013"),
    ("DSA", "digital_signature", 35, "CL-014"),
    ("PRNG", "randomness", 70, "CL-015"),
    ("KEY-MATERIAL", "jwt_alg_none", 95, "CL-016"),
]

QUANTUM_BASE: list[tuple[str, int, str]] = [
    ("shor_vulnerable", 90, "Q-001"),
    ("grover_weakened", 35, "Q-002"),
    ("unknown", 30, "Q-003"),
    ("pqc_resistant", 0, "Q-004"),
    ("symmetric_safe", 0, "Q-005"),
]


@dataclass
class Factor:
    rule_id: str
    track: str
    title: str
    delta: int
    factor_value: Optional[str] = None
    evidence: Optional[str] = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "rule_id": self.rule_id, "track": self.track, "title": self.title,
            "delta": self.delta, "factor_value": self.factor_value, "evidence": self.evidence,
        }


@dataclass
class RiskResult:
    classical_risk: int
    quantum_risk: int
    composite_risk: int
    band: str
    mosca_state: str
    mosca_margin_years: Optional[float]
    urgency_score: int
    effort_score: int
    effective_confidence: float
    evidence_class: str
    deadline_year: Optional[int]
    capped_by_confidence: bool
    explanation: str
    factors: list[Factor] = field(default_factory=list)
    drivers: dict[str, Any] = field(default_factory=dict)

    def assessment_id(self, scan_id: str, finding_id: str) -> str:
        return stable_id("ra", scan_id, finding_id)


def _clamp(value: float, lo: int = 0, hi: int = 100) -> int:
    return int(max(lo, min(hi, round(value))))


def _band_index(band: str) -> int:
    return BAND_ORDER.index(band)


def _cap_band(band: str, cap: Optional[str]) -> tuple[str, bool]:
    if not cap:
        return band, False
    if _band_index(band) > _band_index(cap):
        return cap, True
    return band, False


def assess(
    *,
    asset: dict[str, Any],
    evidence_class: str,
    confidence: float,
    corroborations: int = 0,
    context: Optional[dict[str, Any]] = None,
    mosca: Optional[MoscaResult] = None,
    extra: Optional[dict[str, Any]] = None,
    purpose_override: Optional[str] = None,
) -> RiskResult:
    context = context or {}
    extra = extra or {}
    purpose = purpose_override or asset.get("purpose", "unknown")
    family = asset.get("family", "unknown")
    mode = (asset.get("mode") or "").lower()
    key_size = asset.get("key_size_bits")
    name = asset.get("canonical_name", "unknown")
    factors: list[Factor] = []

    # ---------------- classical track ---------------- #
    classical = 0
    for fam, pur, score, rule in CLASSICAL_BASE:
        if fam == family and pur == purpose:
            classical = max(classical, score)
            factors.append(Factor(rule, "classical", f"{family}/{purpose} baseline", score, f"{score}"))
    if family == "AES":
        if mode == "ecb" or name.endswith("ECB"):
            classical = max(classical, 80)
            factors.append(Factor("CL-020", "classical", "AES in ECB mode leaks block structure", 80, name))
        elif mode == "cbc":
            classical = max(classical, 30)
            factors.append(Factor("CL-021", "classical", "AES-CBC without AEAD", 30, name))
    if family in {"RSA", "DH", "DSA"} and isinstance(key_size, int):
        floor = 2048 if family != "DSA" else 2048
        if key_size < floor:
            delta = 70 if key_size <= 1024 else 45
            classical = max(classical, delta)
            factors.append(Factor("CL-030", "classical", f"{family} key size below {floor} bits",
                                  delta, f"{key_size} bits"))
    if family == "TLS":
        if any(tag in name for tag in ("v1.0", "v1.1", "SSLv3", "v1")):
            classical = max(classical, 80)
            factors.append(Factor("CL-040", "classical", f"obsolete protocol {name}", 80, name))
        elif "1.2" in name:
            classical = max(classical, 15)
            factors.append(Factor("CL-041", "classical", "TLS 1.2 acceptable today, 2030 target is 1.3", 15, name))
    if asset.get("asset_type") == "library":
        classical = max(classical, 12)
        factors.append(Factor("CL-050", "classical", "crypto library declared, usage not yet proven", 12, name))
    if extra.get("hardcoded_material"):
        classical = max(classical, 25)
        factors.append(Factor("CL-060", "classical", "key material embedded in source tree", 25, "embedded key"))
    if extra.get("critical") == "JWT 'alg: none' accepted - signature bypass":
        classical = 95
        factors.append(Factor("CL-070", "classical", "JWT signature verification can be bypassed", 95, "alg=none"))

    cert = extra.get("certificate") or {}
    if cert:
        days = cert.get("days_to_expiry")
        if isinstance(days, int):
            if days < 0:
                classical = max(classical, 60)
                factors.append(Factor("CL-080", "classical", f"certificate expired {abs(days)} days ago", 60))
            elif days < 30:
                classical = max(classical, 25)
                factors.append(Factor("CL-081", "classical", f"certificate expires in {days} days", 25))
        if cert.get("is_self_signed") and not cert.get("is_ca"):
            classical = max(classical, 25)
            factors.append(Factor("CL-082", "classical", "self-signed leaf certificate", 25))
        if "SHA-1" in str(cert.get("signature_algorithm")) or "MD5" in str(cert.get("signature_algorithm")):
            classical = max(classical, 75)
            factors.append(Factor("CL-083", "classical",
                                  f"certificate signed with {cert.get('signature_algorithm')}", 75))
        if isinstance(cert.get("public_key_bits"), int) and cert["public_key_bits"] < 2048:
            classical = max(classical, 60)
            factors.append(Factor("CL-084", "classical",
                                  f"certificate key size {cert['public_key_bits']} bits", 60))
        if cert.get("is_self_signed") and cert.get("is_ca") and not cert.get("is_trust_store"):
            classical = max(classical, 20)
            factors.append(Factor("CL-085", "classical", "private trust anchor shipped in application", 20))

    # ---------------- quantum track ---------------- #
    status = asset.get("quantum_status", "unknown")
    quantum = 0
    for st, score, rule in QUANTUM_BASE:
        if st == status:
            quantum = score
            factors.append(Factor(rule, "quantum", f"quantum status: {st}", score, st))
    if status == "grover_weakened" and (asset.get("quantum_security_bits") or 0) < 128:
        factors.append(Factor("Q-010", "quantum",
                              f"effective {asset.get('quantum_security_bits')}-bit security under Grover",
                              0, str(asset.get("quantum_security_bits"))))
    if asset.get("is_post_quantum"):
        factors.append(Factor("Q-020", "quantum", "post-quantum algorithm already in use", 0, name))
    if status == "unknown":
        factors.append(Factor("Q-030", "quantum",
                              "quantum status unknown - not evidence of safety (Coverage Honesty)", 0, name))
    if family == "TLS" and "1.2" in name:
        quantum = max(quantum, 55)
        factors.append(Factor("Q-040", "quantum",
                              "TLS 1.2 server certificates are RSA/ECDSA signed: breakable by Shor", 55, name))

    deadline = asset.get("nist_disallowed_after") or asset.get("nist_deprecated_after")
    if isinstance(deadline, int) and deadline - CURRENT_YEAR <= 3:
        delta = 10
        quantum = max(quantum, min(100, quantum + delta))
        factors.append(Factor("Q-050", "quantum",
                              f"NIST IR 8547 timeline: {name} disallowed after {deadline} (<=3y)", delta, str(deadline)))

    # Mosca floor: long-lived data + Shor-vulnerable key establishment = time-critical
    long_lived = float(context.get("data_lifetime_years") or 0) >= POLICY_PACK["mosca"]["long_lived_threshold_years"]
    mosca_breach_applies = bool(mosca and mosca.holds and asset.get("quantum_status") == "shor_vulnerable")
    if mosca_breach_applies:
        floor = POLICY_PACK["mosca"]["breach_quantum_floor"]
        # Always record the factor, even when the floor does not bind: an auditor
        # must be able to see that the temporal exposure was evaluated, not that it
        # happened to be lower than another rule.
        factors.append(Factor("M-001", "mosca",
                              f"Mosca breach: X+Y={mosca.x_years + mosca.y_years:g}y > Z={mosca.z_years:g}y "
                              f"(quantum floor {floor})",
                              max(0, floor - quantum),
                              f"X={mosca.x_years:g},Y={mosca.y_years:g},Z={mosca.z_years:g}"))
        quantum = max(quantum, floor)
    elif mosca and mosca.state == "borderline" and asset.get("quantum_status") == "shor_vulnerable":
        quantum = min(100, quantum + 10)
        factors.append(Factor("M-002", "mosca", "Mosca borderline: no safety margin against Z", 10))

    # ---------------- context track ---------------- #
    ctx_weights = POLICY_PACK["context_weights"]
    context_points = (
        ctx_weights["exposure"].get(context.get("exposure", "unknown"), 0)
        + ctx_weights["criticality"].get(context.get("criticality", "unknown"), 0)
        + ctx_weights["classification"].get(context.get("classification", "internal"), 0)
    )
    if long_lived:
        context_points += 5
        factors.append(Factor("M-010", "context", f"data shelf-life {context.get('data_lifetime_years')}y >= 10y", 5))

    source_context = (context.get("source_context") or "unknown")
    if source_context == "non_production":
        context_points = int(context_points * POLICY_PACK["source_context_weights"]["non_production"])
        factors.append(Factor(
            "M-012", "context",
            "occurrence is in a test, fixture, or vendored path - real, but not a "
            "production exposure on this evidence", 0, "non_production"))

    composite = _clamp(max(classical, quantum) + context_points)

    # evidence gating
    effective_confidence = min(0.99, confidence * (1 + 0.15 * max(corroborations, 0)))
    cap = band_cap(evidence_class)
    band, capped = _cap_band(band_for(composite), cap)
    if capped:
        factors.append(Factor("G-001", "context",
                              f"severity capped at {cap} by evidence class {evidence_class}", 0, evidence_class))

    # A Mosca breach on long-lived data under Shor-vulnerable key establishment is
    # at least High *by time*, and that floor outranks the evidence cap: the whole
    # point of the inequality is that the exposure already exists today.
    mosca_band_floor = POLICY_PACK["mosca"]["breach_floor_band"] if long_lived else None
    if mosca_breach_applies and mosca_band_floor and _band_index(band) < _band_index(mosca_band_floor):
        band = mosca_band_floor
        factors.append(Factor("M-005", "mosca",
                              f"Mosca breach floor: {mosca_band_floor} regardless of evidence class", 0,
                              f"data shelf-life {context.get('data_lifetime_years')}y"))

    # urgency (priority to migrate) - separate from effort
    w = POLICY_PACK["urgency_weights"]
    mosca_pressure = {"breached": 100, "borderline": 60, "safe": 25, "not_evaluated": 40}[mosca.state if mosca else "not_evaluated"]
    urgency = _clamp(
        w["risk"] * composite + w["mosca"] * mosca_pressure + w["exposure"] * min(100, context_points * 4)
    )

    explanation = _explain(name, classical, quantum, context_points, band, capped, evidence_class, mosca, factors)
    return RiskResult(
        classical_risk=_clamp(classical),
        quantum_risk=_clamp(quantum),
        composite_risk=composite,
        band=band,
        mosca_state=mosca.state if mosca else "not_evaluated",
        mosca_margin_years=mosca.margin_years if mosca else None,
        urgency_score=urgency,
        effort_score=0,
        effective_confidence=round(effective_confidence, 3),
        evidence_class=evidence_class,
        deadline_year=deadline if isinstance(deadline, int) else None,
        capped_by_confidence=capped,
        explanation=explanation,
        factors=factors,
        drivers={
            "context": {k: context.get(k) for k in ("exposure", "criticality", "classification", "data_lifetime_years")},
            "context_points": context_points,
            "track_taken": "classical" if classical >= quantum else "quantum",
            "mosca": mosca.as_dict() if mosca else None,
            "corroborations": corroborations,
        },
    )


def _explain(
    name: str, classical: int, quantum: int, context_points: int, band: str, capped: bool,
    evidence_class: str, mosca: Optional[MoscaResult], factors: list[Factor],
) -> str:
    lead = (
        f"{name}: classical track {classical}/100"
        + (f", quantum track {quantum}/100 (Shor-vulnerable)" if quantum >= 60 else f", quantum track {quantum}/100")
        + (f", context +{context_points}" if context_points else "")
        + f" -> {band.upper()}"
    )
    if mosca and mosca.holds:
        lead += f". Mosca BREACHED: {mosca.narrative}"
    top = [f for f in factors if f.delta][:3]
    if top:
        lead += ". Drivers: " + "; ".join(f"{f.rule_id} {f.title} (+{f.delta})" for f in top)
    if capped:
        lead += f". Severity capped at {band} because evidence class {evidence_class} is not conclusive"
    return lead[:1200]


def summarise(assessments: list[RiskResult], mosca: Optional[MoscaResult]) -> dict[str, Any]:
    bands: dict[str, int] = {b: 0 for b in BAND_ORDER}
    for a in assessments:
        bands[a.band] = bands.get(a.band, 0) + 1
    return {
        "by_band": bands,
        "classical_critical": sum(1 for a in assessments if a.classical_risk >= 80),
        "quantum_critical": sum(1 for a in assessments if a.quantum_risk >= 80),
        "mosca": mosca.as_dict() if mosca else None,
    }
