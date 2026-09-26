"""Risk engine + Mosca engine: the numbers the judges will probe."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.registry import canonicalise, material_asset  # noqa: E402
from app.services import mosca as mosca_svc  # noqa: E402
from app.services import recommend as recommend_svc  # noqa: E402
from app.services import risk as risk_svc  # noqa: E402
from app.scanners.base import AST_RESOLVED, DECLARED_ONLY, INFERRED, PATTERN  # noqa: E402


def _ctx(**kwargs):
    base = {"exposure": "internal", "criticality": "unknown",
            "classification": "internal", "data_lifetime_years": 5}
    base.update(kwargs)
    return base


# --------------------------------------------------------------------------- #
# Mosca
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    "x,y,z,expected",
    [
        (15, 5, 10, "breached"),
        (5, 4, 10, "borderline"),
        (2, 2, 10, "safe"),
        (10, 0, 10, "borderline"),   # exactly at Z: no margin
    ],
)
def test_mosca_states(x, y, z, expected):
    assert mosca_svc.evaluate(x, y, z).state == expected


def test_mosca_breach_margin_and_start_by():
    result = mosca_svc.evaluate(15, 4, 10)
    assert result.holds is True
    assert result.margin_years < 0
    import datetime as dt

    assert dt.date.fromisoformat(result.must_start_by) == dt.date.today()  # already past: start now
    assert "BREACHED" in result.narrative


def test_mosca_scenario_defaults_resolve():
    x, y, z, _ = mosca_svc.resolve("conservative", None, None, None)
    assert z == 15 and x == 10 and y == 4
    x, y, z, _ = mosca_svc.resolve("baseline", 12, None, None)
    assert (x, y, z) == (12, 4, 10)


# --------------------------------------------------------------------------- #
# Dual track
# --------------------------------------------------------------------------- #
def test_tracks_are_separate_for_aes128():
    asset = canonicalise("AES-128-GCM")
    result = risk_svc.assess(asset=asset, evidence_class=AST_RESOLVED, confidence=0.95, context=_ctx())
    assert result.classical_risk <= 30, "AES-128-GCM is not a classical problem"
    assert 0 < result.quantum_risk <= 40, "Grover halves the bits but does not break AES-128"
    assert result.composite_risk == max(result.classical_risk, result.quantum_risk) + result.drivers["context_points"]


def test_md5_is_classical_not_quantum():
    asset = canonicalise("MD5")
    result = risk_svc.assess(asset=asset, evidence_class=AST_RESOLVED, confidence=0.95, context=_ctx())
    assert result.classical_risk >= 80
    assert result.quantum_risk < 40


def test_rsa_is_quantum_critical():
    asset = canonicalise("RSA-2048")
    result = risk_svc.assess(asset=asset, evidence_class=AST_RESOLVED, confidence=0.95, context=_ctx())
    assert result.quantum_risk >= 85
    assert result.deadline_year == 2035


def test_unknown_quantum_status_is_not_treated_as_safe():
    asset = canonicalise("SomeVendorCipher")
    result = risk_svc.assess(asset=asset, evidence_class=AST_RESOLVED, confidence=0.95, context=_ctx())
    assert result.quantum_risk > 0
    assert any(f.rule_id == "Q-003" for f in result.factors)


def test_mosca_breach_raises_quantum_floor_for_shor_vulnerable():
    asset = canonicalise("RSA-2048")
    breached = mosca_svc.evaluate(20, 5, 10)
    result = risk_svc.assess(asset=asset, evidence_class=AST_RESOLVED, confidence=0.95,
                             context=_ctx(data_lifetime_years=20), mosca=breached)
    assert result.quantum_risk >= 80
    assert any(f.rule_id in {"M-001", "M-005"} for f in result.factors)
    assert result.band in {"high", "critical"}
    assert "BREACHED" in result.explanation


# --------------------------------------------------------------------------- #
# Evidence gating
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    "evidence,expected_cap",
    [("AST_RESOLVED", "critical"), ("PATTERN", "high"),
     ("DECLARED_ONLY", "medium"), ("INFERRED", "medium")],
)
def test_evidence_class_caps_severity(evidence, expected_cap):
    asset = canonicalise("MD5")
    result = risk_svc.assess(asset=asset, evidence_class=evidence, confidence=0.9, context=_ctx())
    index = {"low": 0, "medium": 1, "high": 2, "critical": 3}
    assert index[result.band] <= index[expected_cap]
    if evidence in {"DECLARED_ONLY", "INFERRED"}:
        assert result.capped_by_confidence is True


def test_binary_inference_alone_cannot_reach_critical():
    asset = canonicalise("RSA-2048")
    result = risk_svc.assess(asset=asset, evidence_class=INFERRED, confidence=0.4, context=_ctx())
    assert result.band != "critical"
    assert result.capped_by_confidence


def test_corroboration_raises_effective_confidence():
    asset = canonicalise("RSA-2048")
    single = risk_svc.assess(asset=asset, evidence_class=PATTERN, confidence=0.75, corroborations=0, context=_ctx())
    multi = risk_svc.assess(asset=asset, evidence_class=PATTERN, confidence=0.75, corroborations=3, context=_ctx())
    assert multi.effective_confidence > single.effective_confidence


def test_every_point_is_attributable():
    asset = canonicalise("RSA-1024")
    result = risk_svc.assess(asset=asset, evidence_class=AST_RESOLVED, confidence=0.95,
                             context=_ctx(exposure="internet_facing", criticality="sovereign_critical",
                                          classification="top_secret", data_lifetime_years=20),
                             mosca=mosca_svc.evaluate(20, 5, 10))
    assert len(result.factors) >= 3
    assert all(f.rule_id and f.track for f in result.factors)
    assert {f.track for f in result.factors} & {"classical", "quantum", "mosca", "context"}
    assert "Drivers:" in result.explanation


def test_urgency_and_effort_are_separate_numbers():
    asset = canonicalise("RSA-2048")
    result = risk_svc.assess(asset=asset, evidence_class=AST_RESOLVED, confidence=0.95, context=_ctx(),
                             mosca=mosca_svc.evaluate(20, 5, 10))
    assert result.urgency_score >= 60, "a breached, high-shelf-life exposure is urgent"
    reco = recommend_svc.build(asset, mosca_breached=True)
    assert reco is not None and reco.effort_score >= 45, "RSA key transport is genuinely hard work"


# --------------------------------------------------------------------------- #
# Recommendations
# --------------------------------------------------------------------------- #
def test_key_establishment_vs_signature_produce_different_answers():
    kem = recommend_svc.build(canonicalise("RSA-2048"), mosca_breached=True, is_tls=False)
    from app.registry import with_purpose

    sig_asset = with_purpose(canonicalise("RSA-2048"), "digital_signature")
    sig = recommend_svc.build(sig_asset, mosca_breached=True)
    assert kem.target_standard.startswith("NIST FIPS 203")
    assert "ML-KEM" in kem.target_algorithm
    assert "FIPS 204" in sig.target_standard and "ML-DSA" in sig.target_algorithm


def test_tls_gets_the_rfc10024_hybrid():
    reco = recommend_svc.build(canonicalise("X25519"), is_tls=True)
    assert reco.deployment_mode == "hybrid"
    assert reco.target_algorithm == "X25519MLKEM768"
    assert "RFC 10024" in reco.target_standard


def test_rsa_transport_is_high_effort_ecdh_is_lower():
    transport = recommend_svc.build(canonicalise("RSA-2048"))
    agreement = recommend_svc.build(canonicalise("X25519"))
    assert transport.effort_score > agreement.effort_score
    assert "Encapsulate" in transport.effort_rationale or "KEM" in transport.effort_rationale


def test_already_pqc_has_no_migration_work():
    reco = recommend_svc.build(canonicalise("ML-KEM-768"))
    assert reco.effort_score == 0 and "crypto-agil" in reco.effort_rationale


def test_blocked_standards_are_documented_not_recommended():
    from app.services.recommend import BLOCKED_TARGETS

    assert "FIPS 206" in " ".join(BLOCKED_TARGETS)


def test_jwt_none_is_a_vulnerability_not_a_migration():
    asset = material_asset("jwt_alg_none")
    result = risk_svc.assess(asset=asset, evidence_class=AST_RESOLVED, confidence=0.95, context=_ctx(),
                             extra={"critical": "JWT 'alg: none' accepted - signature bypass"})
    assert result.classical_risk >= 90 and result.band == "critical"
    reco = recommend_svc.build(asset)
    assert reco.priority == 95 and reco.effort_score == 5
