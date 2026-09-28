"""Serializers: ORM rows -> API dicts (keeps route files thin and shapes stable)."""

from __future__ import annotations

from typing import Any, Optional

from app.models import CryptoAsset, Finding, RiskAssessment, RiskFactor
from app.schemas import iso


def asset_out(asset: CryptoAsset) -> dict[str, Any]:
    return {
        "id": asset.id, "canonical_name": asset.canonical_name, "oid": asset.oid,
        "asset_type": asset.asset_type, "family": asset.family, "primitive": asset.primitive,
        "purpose": asset.purpose, "key_size_bits": asset.key_size_bits, "curve": asset.curve,
        "mode": asset.mode, "classical_security_bits": asset.classical_security_bits,
        "quantum_security_bits": asset.quantum_security_bits, "quantum_status": asset.quantum_status,
        "is_post_quantum": asset.is_post_quantum, "nist_deprecated_after": asset.nist_deprecated_after,
        "nist_disallowed_after": asset.nist_disallowed_after, "replacement_hint": asset.replacement_hint,
    }


def risk_out(risk: Optional[RiskAssessment], factors: list[RiskFactor] | None = None) -> Optional[dict[str, Any]]:
    if risk is None:
        return None
    return {
        "id": risk.id, "classical_risk": risk.classical_risk, "quantum_risk": risk.quantum_risk,
        "composite_risk": risk.composite_risk, "band": risk.band, "mosca_state": risk.mosca_state,
        "mosca_margin_years": risk.mosca_margin_years, "urgency_score": risk.urgency_score,
        "effort_score": risk.effort_score, "effective_confidence": risk.effective_confidence,
        "evidence_class": risk.evidence_class, "deadline_year": risk.deadline_year,
        "capped_by_confidence": risk.capped_by_confidence, "explanation": risk.explanation,
        "drivers": risk.drivers or {}, "factors": factors or [],
    }


def finding_out(
    finding: Finding,
    asset: CryptoAsset,
    risk: Optional[RiskAssessment] = None,
    factors: list[RiskFactor] | None = None,
) -> dict[str, Any]:
    return {
        "id": finding.id, "scan_id": finding.scan_id, "file_path": finding.file_path,
        "line_start": finding.line_start, "line_end": finding.line_end, "symbol": finding.symbol,
        "detector_id": finding.detector_id, "evidence_class": finding.evidence_class,
        "confidence": finding.confidence, "corroborations": finding.corroborations,
        "snippet_redacted": finding.snippet_redacted, "source": finding.source,
        # The detector's own reasoning. `extra.declaration` is why a scanner
        # believes a declaration, and without it the console can only show that
        # a finding exists - not the argument for it. An auditor's first
        # question about a non-AST finding is "on what basis?", and the answer
        # was being discarded here.
        "extra": finding.extra or {},
        "asset": asset_out(asset), "risk": risk_out(risk, factors),
    }
