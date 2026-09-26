"""Health, version, registry catalogue and Prometheus-style metrics."""

from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_session, require_api_key
from app.db import utcnow
from app.models import CryptoAsset, Finding, MigrationItem, RiskAssessment, Scan, ScanSurface
from app.registry import ALGORITHMS, LIBRARIES, POLICY_PACK, PROTOCOL_ASSETS, registry_snapshot
from app.schemas import HealthOut, VersionOut, iso

router = APIRouter(prefix="/api/v1", tags=["meta"])

_STARTED_AT = time.time()
_COUNTERS: dict[str, int] = {"scans": 0, "findings": 0, "requests": 0, "errors": 0}


def bump(counter: str, amount: int = 1) -> None:
    _COUNTERS[counter] = _COUNTERS.get(counter, 0) + amount


@router.get("/health", response_model=HealthOut, summary="Liveness/readiness probe")
def health(request: Request, session: Session = Depends(get_session)) -> dict:
    settings = request.app.state.settings
    database = "connected"
    dialect = "postgresql" if not settings.is_sqlite else "sqlite"
    try:
        session.execute(select(1))
    except Exception:  # pragma: no cover
        database = "disconnected"
    queue_depth = request.app.state.executor._max_workers - len(request.app.state.future_registry)
    return {
        "status": "healthy" if database == "connected" else "unhealthy",
        "version": settings.version, "engine_version": settings.engine_version,
        "policy_pack_version": settings.policy_pack_version, "database": database, "dialect": dialect,
        "uptime_seconds": round(time.time() - _STARTED_AT, 1), "queue_depth": queue_depth,
        "timestamp": iso(utcnow()),
    }


@router.get("/version", response_model=VersionOut, summary="Component versions")
def version(request: Request) -> dict:
    settings = request.app.state.settings
    return {"name": settings.app_name, "version": settings.version,
            "engine_version": settings.engine_version, "policy_pack_version": settings.policy_pack_version}


@router.get("/registry", summary="Algorithm catalogue and policy pack (the tool's knowledge base)")
def registry() -> dict[str, Any]:
    return {
        "snapshot": registry_snapshot(),
        "algorithms": [
            {
                "canonical_name": a["canonical_name"], "family": a["family"], "purpose": a["purpose"],
                "oid": a.get("oid"), "classical_bits": a.get("classical_bits", 0),
                "quantum_bits": a.get("quantum_bits", 0), "quantum_status": a.get("quantum_status"),
                "is_post_quantum": bool(a.get("is_post_quantum")),
                "nist_deprecated_after": a.get("nist_deprecated_after"),
                "nist_disallowed_after": a.get("nist_disallowed_after"),
                "replacement_hint": a.get("replacement_hint"),
            }
            for a in ALGORITHMS
        ],
        "protocols": [
            {"name": name, "canonical_name": spec["canonical_name"]} for name, spec in PROTOCOL_ASSETS.items()
        ],
        "libraries": sorted(LIBRARIES),
        "policy_pack": POLICY_PACK,
    }


@router.get("/metrics", summary="Prometheus text exposition")
def metrics(request: Request, session: Session = Depends(get_session)) -> str:
    settings = request.app.state.settings
    scans = session.query(func.count(Scan.id)).scalar() or 0
    findings = session.query(func.count(Finding.id)).scalar() or 0
    surfaces = session.query(func.count(ScanSurface.id)).scalar() or 0
    assets = session.query(func.count(CryptoAsset.id)).scalar() or 0
    queue_depth = request.app.state.executor._max_workers - len(request.app.state.future_registry)
    lines = [
        "# HELP ecdat_scans_total scans created",
        "# TYPE ecdat_scans_total counter",
        f"ecdat_scans_total {scans}",
        "# HELP ecdat_findings_total findings persisted",
        "# TYPE ecdat_findings_total counter",
        f"ecdat_findings_total {findings}",
        "# HELP ecdat_surfaces_total enumerated surfaces",
        "# TYPE ecdat_surfaces_total counter",
        f"ecdat_surfaces_total {surfaces}",
        "# HELP ecdat_assets_total canonical crypto assets",
        "# TYPE ecdat_assets_total counter",
        f"ecdat_assets_total {assets}",
        "# HELP ecdat_scan_queue_depth running scans",
        "# TYPE ecdat_scan_queue_depth gauge",
        f"ecdat_scan_queue_depth {queue_depth}",
        "# HELP ecdat_uptime_seconds process uptime",
        "# TYPE ecdat_uptime_seconds gauge",
        f"ecdat_uptime_seconds {round(time.time() - _STARTED_AT, 1)}",
        "# HELP ecdat_build_info build metadata",
        "# TYPE ecdat_build_info gauge",
        f'ecdat_build_info{{version="{settings.version}",engine="{settings.engine_version}",'
        f'policy_pack="{settings.policy_pack_version}",dialect="{"sqlite" if settings.is_sqlite else "postgresql"}"}} 1',
    ]
    for counter, value in sorted(_COUNTERS.items()):
        lines += [f"# TYPE ecdat_{counter}_total counter", f"ecdat_{counter}_total {value}"]
    return "\n".join(lines) + "\n"


@router.get("/stats", summary="Installation statistics", dependencies=[Depends(require_api_key)])
def stats(session: Session = Depends(get_session)) -> dict:
    bands = session.query(RiskAssessment.band, func.count(RiskAssessment.id)).group_by(RiskAssessment.band).all()
    return {
        "scans": session.query(func.count(Scan.id)).scalar() or 0,
        "findings": session.query(func.count(Finding.id)).scalar() or 0,
        "assets": session.query(func.count(CryptoAsset.id)).scalar() or 0,
        "surfaces": session.query(func.count(ScanSurface.id)).scalar() or 0,
        "migration_items": session.query(func.count(MigrationItem.id)).scalar() or 0,
        "by_band": {band: count for band, count in bands},
    }
