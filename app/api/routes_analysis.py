"""Findings, risk summaries, Mosca simulation, recommendations, migration queue, data assets."""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session, defer

from app.api.deps import Pagination, get_session, paginate, require_api_key
from app.api.routes_scans import get_scan
from app.api.serializers import finding_out, risk_out
from app.errors import NotFound
from app.models import (
    Certificate, CryptoAsset, DataAsset, Dependency, Finding, MigrationItem, MoscaScenario,
    Protection, Recommendation, RiskAssessment, RiskFactor, ScanSurface,
)
from app.db import utcnow
from app.schemas import (
    DataAssetCreate, DataAssetOut, MigrationItemOut, MigrationItemUpdate, MoscaSimulateRequest,
    MoscaSimulateResponse, Page, ProtectionCreate, RiskSummaryOut, ScenarioCreate, ScenarioOut, iso,
)
from app.services import coverage as coverage_svc
from app.services import mosca as mosca_svc

router = APIRouter(prefix="/api/v1", tags=["analysis"], dependencies=[Depends(require_api_key)])


SORTS = {
    "risk": RiskAssessment.composite_risk,
    "urgency": RiskAssessment.urgency_score,
    "path": Finding.file_path,
    "confidence": Finding.confidence,
}


FILTER_KEYS = ("band", "quantum_status", "evidence_class", "purpose", "file_path", "search")

# Sort keys that live on the risk table. Ordering by them through a three-way
# join forces the engine to materialise every candidate row (wide JSON included)
# before it can sort: measured 17 s for a `?search=` page over 6,100 findings.
# Instead both the filtered and unfiltered paths select a *page of primary keys*
# first and hydrate afterwards, which keeps the sort index-driven.
RISK_SORT_COLUMNS = {"risk": RiskAssessment.composite_risk, "urgency": RiskAssessment.urgency_score}


def _predicates(
    *,
    band: Optional[str] = None,
    quantum_status: Optional[str] = None,
    evidence_class: Optional[str] = None,
    purpose: Optional[str] = None,
    file_path: Optional[str] = None,
    search: Optional[str] = None,
) -> list:
    clauses = []
    if band:
        clauses.append(
            Finding.pk.in_(select(RiskAssessment.finding_id).where(RiskAssessment.band == band))
        )
    if quantum_status:
        clauses.append(
            Finding.asset_id.in_(
                select(CryptoAsset.id).where(CryptoAsset.quantum_status == quantum_status)
            )
        )
    if purpose:
        clauses.append(Finding.asset_id.in_(select(CryptoAsset.id).where(CryptoAsset.purpose == purpose)))
    if evidence_class:
        clauses.append(Finding.evidence_class == evidence_class)
    if file_path:
        clauses.append(Finding.file_path.ilike(f"%{file_path}%"))
    if search:
        pattern = f"%{search}%"
        clauses.append(
            Finding.symbol.ilike(pattern)
            | Finding.file_path.ilike(pattern)
            | Finding.asset_id.in_(
                select(CryptoAsset.id).where(CryptoAsset.canonical_name.ilike(pattern))
            )
        )
    return clauses


def _page_ids(
    session: Session, scan_id: str, *, sort: str, order: str, limit: Optional[int], offset: int,
    with_risk_only: bool, **filters,
) -> list[str]:
    """Phase 1: the primary keys of one page, ordered, using indexes only."""
    descending = order == "desc"
    query = session.query(Finding.pk).filter(Finding.scan_id == scan_id, *_predicates(**filters))
    if with_risk_only:
        query = query.filter(Finding.pk.in_(select(RiskAssessment.finding_id)))
    risk_column = RISK_SORT_COLUMNS.get(sort)
    if risk_column is not None:
        # Correlated scalar subquery: one indexed lookup per candidate row, no
        # join, no materialisation of the wide evidence columns.
        correlated = select(risk_column).where(RiskAssessment.finding_id == Finding.pk).scalar_subquery()
        query = query.order_by(correlated.desc() if descending else correlated.asc())
    else:
        column = SORTS.get(sort, Finding.file_path)
        query = query.order_by(column.desc() if descending else column.asc())
    if limit is not None:
        query = query.limit(limit).offset(offset)
    return [row[0] for row in query.all()]


def _hydrate(session: Session, row_ids: list[str]) -> list[tuple[Finding, CryptoAsset, Optional[RiskAssessment]]]:
    """Phase 2: fetch the full (finding, asset, risk) triples for those keys only."""
    if not row_ids:
        return []
    triples = (
        session.query(Finding, CryptoAsset, RiskAssessment)
        .join(CryptoAsset, CryptoAsset.id == Finding.asset_id)
        .outerjoin(RiskAssessment, RiskAssessment.finding_id == Finding.pk)
        .filter(Finding.pk.in_(row_ids))
        .options(defer(RiskAssessment.drivers))
        .all()
    )
    position = {row_id: index for index, row_id in enumerate(row_ids)}
    return sorted(triples, key=lambda triple: position.get(triple[0].pk, 0))


def _load_rows(session: Session, scan_id: str, **kwargs) -> list[tuple[Finding, CryptoAsset, Optional[RiskAssessment]]]:
    """Two-phase read: index-driven page selection, then hydration."""
    limit = kwargs.pop("limit", None)
    offset = kwargs.pop("offset", 0)
    sort = kwargs.pop("sort", "risk")
    order = kwargs.pop("order", "desc")
    with_risk_only = kwargs.pop("with_risk_only", False)
    row_ids = _page_ids(session, scan_id, sort=sort, order=order, limit=limit, offset=offset,
                        with_risk_only=with_risk_only, **kwargs)
    return _hydrate(session, row_ids)


def _load_rows_paged(session: Session, scan_id: str, *, sort: str, order: str, limit: int, offset: int):
    """Default view shortcut: the risk index already stores the page order."""
    column = RISK_SORT_COLUMNS.get(sort)
    if column is None:
        return _load_rows(session, scan_id, sort=sort, order=order, limit=limit, offset=offset,
                          band=None, quantum_status=None, evidence_class=None, purpose=None,
                          file_path=None, search=None)
    row_ids = [
        row[0] for row in (
            session.query(RiskAssessment.finding_id)
            .filter(RiskAssessment.scan_id == scan_id)
            .order_by(column.desc() if order == "desc" else column.asc())
            .limit(limit).offset(offset)
            .all()
        )
    ]
    return _hydrate(session, row_ids)


FILTER_KEYS = ("band", "quantum_status", "evidence_class", "purpose", "file_path", "search")


def _count_rows(session: Session, scan_id: str, **filters) -> int:
    """`SELECT count(*)` over the same predicates. Never materialise rows to count."""
    active = {key: value for key, value in filters.items() if key in FILTER_KEYS and value}
    query = session.query(func.count(Finding.pk)).filter(
        Finding.scan_id == scan_id, *_predicates(**active)
    )
    return query.scalar() or 0



# --------------------------------------------------------------------------- #
@router.get("/scans/{scan_id}/findings", summary="Paginated, filterable findings")
def list_findings(
    scan_id: str,
    band: Optional[str] = Query(default=None, description="low|medium|high|critical"),
    quantum_status: Optional[str] = None,
    evidence_class: Optional[str] = None,
    file_path: Optional[str] = Query(default=None, description="substring match"),
    purpose: Optional[str] = None,
    search: Optional[str] = Query(default=None, description="match asset name, symbol or path"),
    sort: str = Query(default="risk", pattern="^(risk|urgency|path|confidence)$"),
    order: str = Query(default="desc", pattern="^(asc|desc)$"),
    page: Pagination = Depends(),
    session: Session = Depends(get_session),
) -> dict:
    get_scan(session, scan_id)
    filters = dict(band=band, quantum_status=quantum_status, evidence_class=evidence_class,
                   purpose=purpose, file_path=file_path, search=search, sort=sort, order=order)
    total = _count_rows(session, scan_id, **filters)
    if not any(filters.get(key) for key in FILTER_KEYS):
        rows = _load_rows_paged(session, scan_id, sort=sort, order=order,
                                limit=page.limit, offset=page.offset)
    else:
        rows = _load_rows(session, scan_id, limit=page.limit, offset=page.offset, **filters)
    items = [finding_out(finding, asset, risk) for finding, asset, risk in rows]
    return {
        "items": items, "total": total, "limit": page.limit, "offset": page.offset,
        "has_next": page.offset + page.limit < total,
    }


@router.get("/scans/{scan_id}/findings/{finding_id}", summary="Finding detail with every risk factor")
def read_finding(scan_id: str, finding_id: str, session: Session = Depends(get_session)) -> dict:
    get_scan(session, scan_id)
    finding = session.query(Finding).filter(
        Finding.id == finding_id, Finding.scan_id == scan_id
    ).one_or_none()
    if finding is None:
        raise NotFound(f"finding '{finding_id}' not found in scan '{scan_id}'")
    asset = session.get(CryptoAsset, finding.asset_id)
    risk = session.query(RiskAssessment).filter(RiskAssessment.finding_id == finding.pk).one_or_none()
    factors = []
    if risk is not None:
        factors = [{"seq": f.seq, "rule_id": f.rule_id, "track": f.track, "title": f.title,
                    "factor_value": f.factor_value, "delta": f.delta, "evidence": f.evidence}
                   for f in session.query(RiskFactor).filter(RiskFactor.assessment_id == risk.id)
                   .order_by(RiskFactor.seq).all()]
    payload = finding_out(finding, asset, risk, factors)
    payload["extra"] = finding.extra or {}
    return payload


@router.get("/scans/{scan_id}/risk/summary", response_model=RiskSummaryOut, summary="Executive risk summary")
def risk_summary(scan_id: str, top: int = Query(default=10, ge=1, le=50),
                 session: Session = Depends(get_session)) -> dict:
    from sqlalchemy import func

    scan = get_scan(session, scan_id)

    def group(column, model, join_asset: bool = False):
        key = getattr(model, "pk", None) or getattr(model, "id")
        query = session.query(column, func.count(key)).filter(model.scan_id == scan_id)
        if join_asset:
            query = query.join(CryptoAsset, CryptoAsset.id == Finding.asset_id)
        return {value: count for value, count in query.group_by(column).all()}

    by_band = group(RiskAssessment.band, RiskAssessment)
    by_family = group(CryptoAsset.family, Finding, join_asset=True)
    by_evidence = group(Finding.evidence_class, Finding)
    total_findings = session.query(func.count(Finding.pk)).filter(Finding.scan_id == scan_id).scalar() or 0
    total_assets = session.query(func.count(func.distinct(Finding.asset_id))).filter(
        Finding.scan_id == scan_id).scalar() or 0

    surfaces = session.query(ScanSurface).filter(ScanSurface.scan_id == scan_id).all()
    coverage = coverage_svc.compute(surfaces)

    ranked = _load_rows_paged(session, scan_id, sort="urgency", order="desc", limit=top, offset=0)

    mosca_stats = (scan.stats or {}).get("mosca") or {}
    mosca = mosca_stats or mosca_svc.evaluate(10, 4, 10).as_dict()

    return {
        "scan_id": scan_id,
        "total_findings": total_findings,
        "total_assets": total_assets,
        "by_band": [{"band": k, "count": v} for k, v in sorted(by_band.items(), key=lambda kv: -kv[1])],
        "by_family": [{"family": k, "count": v} for k, v in sorted(by_family.items(), key=lambda kv: -kv[1])],
        "by_evidence_class": [
            {"evidence_class": k, "count": v} for k, v in sorted(by_evidence.items(), key=lambda kv: -kv[1])
        ],
        "top_risks": [finding_out(f, a, r) for f, a, r in ranked],
        "tracks": {
            "classical_critical": session.query(func.count(RiskAssessment.id)).filter(
                RiskAssessment.scan_id == scan_id, RiskAssessment.classical_risk >= 80).scalar() or 0,
            "quantum_critical": session.query(func.count(RiskAssessment.id)).filter(
                RiskAssessment.scan_id == scan_id, RiskAssessment.quantum_risk >= 80).scalar() or 0,
            "post_quantum_adopted": session.query(func.count(func.distinct(Finding.asset_id)))
                .join(CryptoAsset, CryptoAsset.id == Finding.asset_id).filter(
                    Finding.scan_id == scan_id, CryptoAsset.is_post_quantum.is_(True)).scalar() or 0,
            "quantum_vulnerable_assets": session.query(func.count(func.distinct(Finding.asset_id)))
                .join(CryptoAsset, CryptoAsset.id == Finding.asset_id).filter(
                    Finding.scan_id == scan_id, CryptoAsset.quantum_status == "shor_vulnerable").scalar() or 0,
            "unobserved_surfaces": coverage.counts.get("unobserved", 0) + coverage.counts.get("unsupported", 0),
        },
        "mosca": mosca,
        "coverage_index": round(coverage.coverage_index, 4),
        "unobserved_pct": round(coverage.unobserved_pct, 2),
        "policy_pack_version": scan.policy_pack_version,
        "generated_at": iso(scan.finished_at or scan.created_at) or "",
    }


@router.post("/scans/{scan_id}/risk/simulate", response_model=MoscaSimulateResponse,
             summary="What-if Mosca simulation (X, Y, Z)")
def simulate_mosca(scan_id: str, payload: MoscaSimulateRequest, session: Session = Depends(get_session)) -> dict:
    get_scan(session, scan_id)
    result = mosca_svc.evaluate(payload.x_years, payload.y_years, payload.z_years)
    rows = _load_rows(session, scan_id)

    affected: list[tuple[Finding, CryptoAsset, Optional[RiskAssessment]]] = []
    for finding, asset, risk in rows:
        if asset.quantum_status != "shor_vulnerable":
            continue
        if payload.scope != "all" and risk is not None and risk.band != payload.scope.split(":", 1)[1]:
            continue
        affected.append((finding, asset, risk))

    by_band: dict[str, int] = {}
    for _, _, risk in affected:
        band = risk.band if risk else "unassessed"
        by_band[band] = by_band.get(band, 0) + 1

    narrative = (
        f"With X={payload.x_years:g}y and Y={payload.y_years:g}y against Z={payload.z_years:g}y, "
        f"{len(affected)} Shor-vulnerable finding(s) sit inside the harvest-now-decrypt-later window. "
        f"{result.narrative}"
    )
    return {
        "x_years": payload.x_years, "y_years": payload.y_years, "z_years": payload.z_years,
        "x_plus_y": round(result.x_years + result.y_years, 3),
        "state": result.state, "holds": result.holds,
        "margin_years": round(result.margin_years, 2), "must_start_by": result.must_start_by,
        "affected_findings": len(affected),
        "affected_assets": len({a.id for _, a, _ in affected}),
        "by_band": by_band,
        "affected_file_paths": sorted({f.file_path for f, _, _ in affected})[:100],
        "narrative": narrative,
    }


@router.get("/scans/{scan_id}/recommendations", summary="Purpose-aware PQC recommendations")
def list_recommendations(scan_id: str, page: Pagination = Depends(),
                         session: Session = Depends(get_session)) -> dict:
    get_scan(session, scan_id)
    rows = (
        session.query(Recommendation, RiskAssessment, CryptoAsset)
        .join(RiskAssessment, RiskAssessment.id == Recommendation.assessment_id)
        .join(CryptoAsset, CryptoAsset.id == Recommendation.current_asset_id)
        .filter(RiskAssessment.scan_id == scan_id)
        .order_by(Recommendation.priority.desc(), Recommendation.effort_score)
        .all()
    )
    items = []
    for reco, risk, asset in rows:
        items.append({
            "id": reco.id, "current_asset_id": asset.id,
            "canonical_name": asset.canonical_name, "file_path": None, "band": risk.band,
            "urgency_score": risk.urgency_score, "mosca_state": risk.mosca_state,
            "target_standard": reco.target_standard, "target_algorithm": reco.target_algorithm,
            "target_parameter_set": reco.target_parameter_set, "deployment_mode": reco.deployment_mode,
            "effort_score": reco.effort_score, "effort_rationale": reco.effort_rationale,
            "tradeoff": reco.tradeoff, "blocked_reason": reco.blocked_reason, "priority": reco.priority,
        })
    return paginate(items, page.limit, page.offset)


@router.get("/scans/{scan_id}/certificates", summary="Discovered X.509 certificates")
def list_certificates(scan_id: str, session: Session = Depends(get_session)) -> list[dict]:
    get_scan(session, scan_id)
    rows = session.query(Certificate).filter(Certificate.scan_id == scan_id).order_by(Certificate.not_after).all()
    return [{
        "id": c.id, "fingerprint_sha256": c.fingerprint_sha256, "subject": c.subject, "issuer": c.issuer,
        "serial_number": c.serial_number, "not_before": iso(c.not_before), "not_after": iso(c.not_after),
        "expired": bool(c.not_after and c.not_after < utcnow()),
        "signature_algorithm": c.signature_algorithm, "public_key_algorithm": c.public_key_algorithm,
        "public_key_bits": c.public_key_bits, "is_ca": c.is_ca, "is_self_signed": c.is_self_signed,
        "source_path": c.source_path,
    } for c in rows]


@router.get("/scans/{scan_id}/dependencies", summary="Crypto-relevant dependencies (SBOM slice)")
def list_dependencies(scan_id: str, page: Pagination = Depends(), session: Session = Depends(get_session)) -> dict:
    get_scan(session, scan_id)
    rows = session.query(Dependency).filter(Dependency.scan_id == scan_id).order_by(Dependency.name).all()
    return paginate([{
        "id": d.id, "name": d.name, "version": d.version, "ecosystem": d.ecosystem, "purl": d.purl,
        "manifest_path": d.manifest_path, "is_crypto_library": d.is_crypto_library,
        "is_pqc_capable": d.is_pqc_capable, "notes": d.notes,
    } for d in rows], page.limit, page.offset)


# --------------------------------------------------------------------------- #
@router.get("/migration/items", response_model=Page[MigrationItemOut], summary="Migration queue")
def list_migration_items(
    workspace_id: Optional[str] = None, status: Optional[str] = None, wave: Optional[int] = None,
    page: Pagination = Depends(), session: Session = Depends(get_session),
) -> dict:
    query = session.query(MigrationItem)
    if workspace_id:
        query = query.filter(MigrationItem.workspace_id == workspace_id)
    if status:
        query = query.filter(MigrationItem.status == status)
    if wave:
        query = query.filter(MigrationItem.wave == wave)
    rows = query.order_by(MigrationItem.urgency_score.desc(), MigrationItem.wave).all()
    items = [{
        "id": i.id, "scan_id": i.scan_id, "recommendation_id": i.recommendation_id, "title": i.title,
        "owner": i.owner, "wave": i.wave, "status": i.status, "urgency_score": i.urgency_score,
        "effort_score": i.effort_score, "target_standard": i.target_standard, "due_by": i.due_by,
        "notes": i.notes, "updated_at": iso(i.updated_at),
    } for i in rows]
    return paginate(items, page.limit, page.offset)


@router.patch("/migration/items/{item_id}", response_model=MigrationItemOut, summary="Update a work item")
def update_migration_item(item_id: str, payload: MigrationItemUpdate,
                          session: Session = Depends(get_session)) -> dict:
    item = session.get(MigrationItem, item_id)
    if item is None:
        raise NotFound(f"migration item '{item_id}' not found")
    for field_name, value in payload.model_dump(exclude_none=True).items():
        setattr(item, field_name, value)
    session.flush()
    return {
        "id": item.id, "scan_id": item.scan_id, "recommendation_id": item.recommendation_id,
        "title": item.title, "owner": item.owner, "wave": item.wave, "status": item.status,
        "urgency_score": item.urgency_score, "effort_score": item.effort_score,
        "target_standard": item.target_standard, "due_by": item.due_by, "notes": item.notes,
        "updated_at": iso(item.updated_at),
    }


# --------------------------------------------------------------------------- #
@router.post("/workspaces/{workspace_id}/data-assets", response_model=DataAssetOut, status_code=201,
             summary="Declare a data class and its confidentiality lifetime (Mosca X)")
def create_data_asset(workspace_id: str, payload: DataAssetCreate, session: Session = Depends(get_session)) -> dict:
    asset = DataAsset(workspace_id=workspace_id, **payload.model_dump())
    session.add(asset)
    session.flush()
    return {"id": asset.id, "name": asset.name, "classification": asset.classification,
            "confidentiality_lifetime_years": asset.confidentiality_lifetime_years,
            "lifetime_basis": asset.lifetime_basis, "regulatory_ref": asset.regulatory_ref,
            "owner": asset.owner}


@router.get("/workspaces/{workspace_id}/data-assets", response_model=list[DataAssetOut])
def list_data_assets(workspace_id: str, session: Session = Depends(get_session)) -> list[dict]:
    rows = session.query(DataAsset).filter(DataAsset.workspace_id == workspace_id).all()
    return [{"id": d.id, "name": d.name, "classification": d.classification,
             "confidentiality_lifetime_years": d.confidentiality_lifetime_years,
             "lifetime_basis": d.lifetime_basis, "regulatory_ref": d.regulatory_ref, "owner": d.owner}
            for d in rows]


@router.post("/data-assets/{data_asset_id}/protections", status_code=201,
             summary="Link a data class to the crypto that protects it (M:N)")
def create_protection(data_asset_id: str, payload: ProtectionCreate, session: Session = Depends(get_session)) -> dict:
    if session.get(DataAsset, data_asset_id) is None:
        raise NotFound(f"data asset '{data_asset_id}' not found")
    if session.get(CryptoAsset, payload.crypto_asset_id) is None:
        raise NotFound(f"crypto asset '{payload.crypto_asset_id}' not found")
    link = Protection(data_asset_id=data_asset_id, crypto_asset_id=payload.crypto_asset_id, role=payload.role)
    session.add(link)
    session.flush()
    return {"id": link.id, "data_asset_id": link.data_asset_id,
            "crypto_asset_id": link.crypto_asset_id, "role": link.role}


@router.get("/scans/{scan_id}/data-exposure", summary="Which data classes rely on which crypto (Mosca X per class)")
def data_exposure(scan_id: str, session: Session = Depends(get_session)) -> dict:
    scan = get_scan(session, scan_id)
    links = (
        session.query(Protection, DataAsset, CryptoAsset)
        .join(DataAsset, DataAsset.id == Protection.data_asset_id)
        .join(CryptoAsset, CryptoAsset.id == Protection.crypto_asset_id)
        .all()
    )
    out: dict[str, dict] = {}
    for link, data_asset, asset in links:
        bucket = out.setdefault(data_asset.id, {
            "data_asset": data_asset.name, "classification": data_asset.classification,
            "x_years": data_asset.confidentiality_lifetime_years, "lifetime_basis": data_asset.lifetime_basis,
            "protecting_assets": [],
        })
        bucket["protecting_assets"].append({
            "asset_id": asset.id, "canonical_name": asset.canonical_name,
            "quantum_status": asset.quantum_status, "role": link.role,
        })
    return {"scan_id": scan_id, "mosca_defaults": (scan.stats or {}).get("mosca"), "classes": list(out.values())}


@router.get("/scenarios", response_model=list[ScenarioOut], summary="List Mosca planning scenarios")
def list_scenarios(workspace_id: Optional[str] = None, session: Session = Depends(get_session)) -> list[dict]:
    query = session.query(MoscaScenario)
    if workspace_id:
        query = query.filter(MoscaScenario.workspace_id == workspace_id)
    rows = query.all()
    if not rows:
        from app.registry import POLICY_PACK

        for preset in POLICY_PACK["scenarios"]:
            rows.append(MoscaScenario(
                workspace_id=workspace_id, name=preset["name"],
                z_years=preset["z_years"], y_years=POLICY_PACK["defaults"]["y_years"],
                x_years=POLICY_PACK["defaults"]["x_years"], horizon_label=preset["label"],
                source_citation=preset["source"], is_default=(preset["name"] == "baseline"),
            ))
    return [{"id": s.id, "name": s.name, "x_years": s.x_years, "y_years": s.y_years, "z_years": s.z_years,
             "horizon_label": s.horizon_label, "source_citation": s.source_citation, "is_default": s.is_default}
            for s in rows]


@router.post("/scenarios", response_model=ScenarioOut, status_code=201)
def create_scenario(payload: ScenarioCreate, session: Session = Depends(get_session)) -> dict:
    scenario = MoscaScenario(**payload.model_dump())
    session.add(scenario)
    session.flush()
    return {"id": scenario.id, "name": scenario.name, "x_years": scenario.x_years, "y_years": scenario.y_years,
            "z_years": scenario.z_years, "horizon_label": scenario.horizon_label,
            "source_citation": scenario.source_citation, "is_default": scenario.is_default}
