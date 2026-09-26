"""Exports (CBOM / SARIF / report / CSV) and forensic attestation."""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_session, require_api_key
from app.api.routes_scans import get_scan
from app.db import utcnow
from app.errors import Conflict, NotFound, PayloadTooLarge
from app.ids import canonical_json, merkle_root
from app.models import Attestation, CryptoAsset, Finding, RiskAssessment, ScanSurface
from app.schemas import AttestationCreate, AttestationOut, VerifyOut, iso
from app.services import attestation as att
from app.services import coverage as coverage_svc
from app.services import exports

router = APIRouter(prefix="/api/v1", tags=["evidence"], dependencies=[Depends(require_api_key)])


def _triples(session: Session, scan_id: str) -> list[tuple[Finding, CryptoAsset, RiskAssessment]]:
    return list(
        session.query(Finding, CryptoAsset, RiskAssessment)
        .join(CryptoAsset, CryptoAsset.id == Finding.asset_id)
        .join(RiskAssessment, RiskAssessment.finding_id == Finding.pk)
        .filter(Finding.scan_id == scan_id)
        .all()
    )


def _guard_export_size(session: Session, scan_id: str) -> None:
    """Exports are synchronous and O(findings). Refuse early with an honest error."""
    from app.config import get_settings

    total = session.query(func.count(Finding.pk)).filter(Finding.scan_id == scan_id).scalar() or 0
    limit = get_settings().export_max_findings
    if total > limit:
        raise PayloadTooLarge(
            f"scan {scan_id} has {total} findings; the synchronous exporter is bounded at "
            f"{limit}. Export a filtered subset, or raise ECDAT_EXPORT_MAX_FINDINGS and "
            "run the export off the request path.",
            details={"findings": total, "limit": limit, "scan_id": scan_id},
        )


@router.get("/scans/{scan_id}/exports/cbom", summary="CycloneDX 1.6/1.7 Cryptographic Bill of Materials")
def export_cbom(
    scan_id: str,
    spec_version: str = Query(default="1.6", pattern="^1\\.[67]$"),
    session: Session = Depends(get_session),
) -> Response:
    scan = get_scan(session, scan_id)
    triples = _triples(session, scan_id)
    _guard_export_size(session, scan_id)
    assets = {asset.id: asset for _, asset, _ in triples}
    findings = [f for f, _, _ in triples]
    surfaces = session.query(ScanSurface).filter(ScanSurface.scan_id == scan_id).all()
    coverage = coverage_svc.compute(surfaces).as_dict()
    document = exports.build_cbom(scan=scan, assets=assets.values(), findings=findings,
                                  coverage=coverage, spec_version=spec_version)
    return Response(
        content=exports.dumps(document),
        media_type="application/vnd.cyclonedx+json",
        headers={"Content-Disposition": f'attachment; filename="cbom-{scan_id[:8]}-{spec_version}.json"'},
    )


@router.get("/scans/{scan_id}/exports/sarif", summary="SARIF 2.1.0 for code-scanning CI gates")
def export_sarif(scan_id: str, session: Session = Depends(get_session)) -> Response:
    _guard_export_size(session, scan_id)
    scan = get_scan(session, scan_id)
    payload = exports.build_sarif(scan, _triples(session, scan_id))
    return Response(
        content=exports.dumps(payload),
        media_type="application/sarif+json",
        headers={"Content-Disposition": f'attachment; filename="ecdat-{scan_id[:8]}.sarif"'},
    )


@router.get("/scans/{scan_id}/exports/report", summary="Human-readable Markdown report")
def export_report(scan_id: str, session: Session = Depends(get_session)) -> Response:
    from app.api.routes_analysis import risk_summary

    _guard_export_size(session, scan_id)

    scan = get_scan(session, scan_id)
    summary = risk_summary(scan_id, top=25, session=session)
    surfaces = session.query(ScanSurface).filter(ScanSurface.scan_id == scan_id).all()
    coverage = coverage_svc.compute(surfaces)
    attestation = session.query(Attestation).filter(Attestation.scan_id == scan_id).order_by(
        Attestation.created_at.desc()).first()
    markdown = exports.build_markdown_report(
        scan=scan, summary=summary, coverage=coverage.as_dict(), top=summary["top_risks"],
        mosca=summary["mosca"], disclaimer_text=coverage_svc.disclaimer(coverage, summary["total_findings"]),
        attestation={
            "merkle_root": attestation.merkle_root, "leaf_count": attestation.leaf_count,
            "ledger_head": attestation.ledger_head, "signature_alg": attestation.signature_alg,
            "key_origin": attestation.key_origin,
        } if attestation else None,
    )
    return Response(content=markdown, media_type="text/markdown; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="ecdat-report-{scan_id[:8]}.md"'})


@router.get("/scans/{scan_id}/exports/findings.csv", summary="Findings CSV for analysts")
def export_csv(scan_id: str, session: Session = Depends(get_session)) -> Response:
    get_scan(session, scan_id)
    rows = []
    for finding, asset, risk in _triples(session, scan_id):
        rows.append({
            "id": finding.id, "band": risk.band, "composite_risk": risk.composite_risk,
            "classical_risk": risk.classical_risk, "quantum_risk": risk.quantum_risk,
            "urgency_score": risk.urgency_score, "canonical_name": asset.canonical_name,
            "quantum_status": asset.quantum_status, "purpose": asset.purpose,
            "file_path": finding.file_path, "line_start": finding.line_start,
            "detector_id": finding.detector_id, "evidence_class": finding.evidence_class,
            "confidence": finding.confidence, "mosca_state": risk.mosca_state,
        })
    return Response(content=exports.build_findings_csv(rows), media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="ecdat-findings-{scan_id[:8]}.csv"'})


# --------------------------------------------------------------------------- #
@router.post("/scans/{scan_id}/attestation", response_model=AttestationOut, status_code=201,
             summary="Generate the signed forensic dossier (BSA Section 63 aligned)")
def create_attestation(scan_id: str, payload: AttestationCreate, session: Session = Depends(get_session)) -> dict:
    scan = get_scan(session, scan_id)
    if scan.status not in {"completed", "failed"}:
        raise Conflict(f"attestation requires a finished scan (status={scan.status})")

    triples = _triples(session, scan_id)
    if not triples:
        raise Conflict("no findings to attest; the evidence tree would be empty")

    leaves = att.build_leaves(triples)
    root = merkle_root(leaves)
    key, public_b64, key_origin = att.load_or_create_key()

    ledger_entries = [{"kind": "scan", "scan_id": scan_id, "target_sha256": scan.target_sha256,
                       "engine": scan.engine_version}] + [
        {"kind": "finding", "leaf": leaf} for leaf in leaves
    ]
    head = att.append_ledger(session, scan_id, ledger_entries)
    session.flush()

    quote, pcrs = (att.tpm_quote() if payload.include_tpm else (None, None))

    declaration = payload.declaration or (
        f"I certify that on {utcnow().date().isoformat()} the scan {scan_id} of {scan.target_uri} "
        f"(target SHA-256 {scan.target_sha256}) was executed by the named officer on the attested host, "
        f"that {len(leaves)} cryptographic evidence records were observed, and that no private key material "
        f"was exported from the target. This dossier evidences the integrity of the inventory; it does not "
        f"certify that the target is free of quantum-vulnerable cryptography outside the observed scope."
    )

    dossier = {
        "scan": {
            "id": scan.id, "target_uri": scan.target_uri, "target_sha256": scan.target_sha256,
            "status": scan.status, "engine_version": scan.engine_version,
            "policy_pack_version": scan.policy_pack_version, "created_at": iso(scan.created_at),
            "finished_at": iso(scan.finished_at), "stats": scan.stats or {},
        },
        "evidence": {"leaf_count": len(leaves), "merkle_root": root, "ledger_head": head},
        "counts": {
            "critical": sum(1 for _, _, r in triples if r.band == "critical"),
            "high": sum(1 for _, _, r in triples if r.band == "high"),
            "medium": sum(1 for _, _, r in triples if r.band == "medium"),
            "low": sum(1 for _, _, r in triples if r.band == "low"),
        },
        "tpm": {"quote": quote, "pcrs": pcrs, "available": bool(quote)},
        "statement": "NOT DETECTED is not QUANTUM-SAFE; see coverage section of the report.",
    }
    message = canonical_json(dossier)
    signature = att.sign(message.encode("utf-8"), key)

    record = Attestation(
        scan_id=scan_id, officer_name=payload.officer_name, officer_role=payload.officer_role,
        declaration=declaration, merkle_root=root, leaf_count=len(leaves), ledger_head=head,
        signature_alg="Ed25519", signature_b64=signature, public_key_b64=public_b64,
        key_origin=key_origin, tpm_quote=quote, tpm_pcr_summary=pcrs, dossier=dossier,
    )
    session.add(record)
    session.flush()
    return _attestation_out(record)


def _attestation_out(record: Attestation) -> dict[str, Any]:
    return {
        "id": record.id, "scan_id": record.scan_id, "schema_version": record.schema_version,
        "officer_name": record.officer_name, "officer_role": record.officer_role,
        "declaration": record.declaration, "merkle_root": record.merkle_root, "leaf_count": record.leaf_count,
        "ledger_head": record.ledger_head, "signature_alg": record.signature_alg,
        "signature_b64": record.signature_b64, "public_key_b64": record.public_key_b64,
        "key_origin": record.key_origin, "dossier": record.dossier or {}, "created_at": iso(record.created_at),
    }


@router.get("/scans/{scan_id}/attestation", response_model=list[AttestationOut])
def list_attestations(scan_id: str, session: Session = Depends(get_session)) -> list[dict]:
    get_scan(session, scan_id)
    return [_attestation_out(a) for a in session.query(Attestation)
            .filter(Attestation.scan_id == scan_id).order_by(Attestation.created_at).all()]


@router.get("/attestations/{attestation_id}/verify", response_model=VerifyOut,
            summary="Recompute the evidence tree and detect tampering")
def verify_attestation(attestation_id: str, session: Session = Depends(get_session)) -> dict:
    record = session.get(Attestation, attestation_id)
    if record is None:
        raise NotFound(f"attestation '{attestation_id}' not found")
    triples = _triples(session, record.scan_id)
    leaves = att.build_leaves(triples)
    recomputed = merkle_root(leaves)
    chain_ok, head = att.verify_ledger(session, record.scan_id)
    message = canonical_json(record.dossier or {})
    sig_ok = att.verify_signature(message.encode("utf-8"), record.signature_b64, record.public_key_b64)
    root_ok = recomputed == record.merkle_root and record.leaf_count == len(leaves)

    if not root_ok or not chain_ok:
        verdict = "tampered"
    elif not sig_ok:
        verdict = "incomplete"
    else:
        verdict = "authentic"
    return {
        "scan_id": record.scan_id, "merkle_root_matches": root_ok, "ledger_chain_valid": chain_ok,
        "signature_valid": sig_ok, "leaf_count": len(leaves), "recomputed_root": recomputed,
        "stored_root": record.merkle_root, "verdict": verdict, "checked_at": iso(utcnow()),
    }
