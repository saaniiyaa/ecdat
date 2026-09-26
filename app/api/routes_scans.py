"""Scans, workspaces, surfaces, events and scan-to-scan diffing."""

from __future__ import annotations

import datetime as dt
import shutil
import uuid
from pathlib import Path
from typing import Annotated, Any, Optional

from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile
from fastapi.responses import JSONResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import Pagination, get_session, paginate, require_api_key
from app.config import Settings
from app.db import utcnow
from app.errors import Conflict, InvalidInput, NotFound
from app.models import Artifact, Scan, ScanEvent, ScanSurface, Workspace
from app.schemas import (
    ErrorEnvelope, ScanCreate, ScanEventOut, ScanOut, SurfaceOut, WorkspaceCreate, WorkspaceOut, iso,
)
from app.services import mosca as mosca_svc
from app.services import scan_runner

router = APIRouter(prefix="/api/v1", tags=["scans"], dependencies=[Depends(require_api_key)])


def _scan_out(scan: Scan) -> dict[str, Any]:
    return {
        "id": scan.id, "workspace_id": scan.workspace_id, "name": scan.name or "",
        "target_uri": scan.target_uri, "target_kind": scan.target_kind, "target_sha256": scan.target_sha256,
        "status": scan.status, "phase": scan.phase, "progress_pct": scan.progress_pct,
        "engine_version": scan.engine_version, "policy_pack_version": scan.policy_pack_version,
        "started_at": iso(scan.started_at), "finished_at": iso(scan.finished_at), "duration_ms": scan.duration_ms,
        "file_count": scan.file_count, "surface_count": scan.surface_count, "finding_count": scan.finding_count,
        "error_code": scan.error_code, "error_message": scan.error_message, "stats": scan.stats or {},
        "created_at": iso(scan.created_at),
    }


def get_scan(session: Session, scan_id: str) -> Scan:
    scan = session.get(Scan, scan_id)
    if scan is None:
        raise NotFound(f"scan '{scan_id}' not found", details={"scan_id": scan_id})
    return scan


# --------------------------------------------------------------------------- #
@router.get("/workspaces", response_model=list[WorkspaceOut], summary="List workspaces")
def list_workspaces(session: Session = Depends(get_session)) -> list[dict]:
    return [{"id": w.id, "slug": w.slug, "name": w.name, "deployment_mode": w.deployment_mode,
             "policy_pack_version": w.policy_pack_version, "created_at": iso(w.created_at)}
            for w in session.query(Workspace).order_by(Workspace.created_at).all()]


@router.post("/workspaces", response_model=WorkspaceOut, status_code=201, summary="Create workspace")
def create_workspace(payload: WorkspaceCreate, session: Session = Depends(get_session)) -> dict:
    slug = (payload.slug or payload.name.lower().replace(" ", "-"))[:64]
    if session.query(Workspace).filter(Workspace.slug == slug).one_or_none():
        raise Conflict(f"workspace slug '{slug}' already exists", details={"slug": slug})
    workspace = Workspace(id=str(uuid.uuid4()), slug=slug, name=payload.name,
                          deployment_mode=payload.deployment_mode)
    session.add(workspace)
    session.flush()
    return {"id": workspace.id, "slug": workspace.slug, "name": workspace.name,
            "deployment_mode": workspace.deployment_mode, "policy_pack_version": workspace.policy_pack_version,
            "created_at": iso(workspace.created_at)}


@router.get("/scans", response_model=list[ScanOut], summary="List scans (newest first)")
def list_scans(
    workspace_id: Optional[str] = None,
    limit: int = Query(default=20, ge=1, le=200),
    session: Session = Depends(get_session),
) -> list[dict]:
    query = session.query(Scan)
    if workspace_id:
        query = query.filter(Scan.workspace_id == workspace_id)
    return [_scan_out(s) for s in query.order_by(Scan.created_at.desc()).limit(limit).all()]


@router.post(
    "/scans",
    status_code=202,
    summary="Start a discovery scan (202 queued, or 201 when wait_seconds>0 and it finished)",
    responses={
        201: {"description": "Scan completed inside the `wait_seconds` window (CLI, CI, tests)"},
        202: {"description": "Scan accepted and queued; poll GET /scans/{scan_id} or stream /events"},
        422: {"description": "INVALID_INPUT / UNSUPPORTED_TARGET / UNSUPPORTED_TIER"},
    },
)
async def create_scan(
    payload: ScanCreate,
    request: Request,
    wait_seconds: int = Query(default=0, ge=0, le=300,
                              description="0 = run in background; >0 = block up to N seconds (CLI/tests)"),
    session: Session = Depends(get_session),
) -> JSONResponse:
    settings: Settings = request.app.state.settings
    target = Path(payload.target_uri)
    if not target.exists():
        raise InvalidInput(f"target '{payload.target_uri}' does not exist on the scan host",
                           details={"target_uri": payload.target_uri})
    workspace_id = payload.workspace_id or _default_workspace(session)
    if session.get(Workspace, workspace_id) is None:
        raise NotFound(f"workspace '{workspace_id}' not found", details={"workspace_id": workspace_id})

    scan = Scan(
        workspace_id=workspace_id, name=payload.name or target.name,
        target_uri=str(target), target_kind=payload.target_kind, target_sha256="",
        status="queued", phase="queued", progress_pct=0,
        engine_version=settings.engine_version, policy_pack_version=payload.policy_pack_version or settings.policy_pack_version,
    )
    session.add(scan)
    session.flush()

    scan_request = scan_runner.ScanRequest(
        workspace_id=workspace_id, target_uri=str(target), target_kind=payload.target_kind,
        name=scan.name, tiers=list(payload.tiers), live_probe=payload.live_probe,
        context=payload.context.model_dump(), mosca=payload.mosca.model_dump(),
        policy_pack_version=scan.policy_pack_version,
    )
    if payload.live_probe and not settings.allow_live_probe:
        raise InvalidInput("live probe disabled on this host",
                           details={"enable": "ECDAT_ALLOW_LIVE_PROBE=true"})

    # Commit before handing the job to the worker: the worker opens its own
    # session/connection and must be able to see the scan row.
    session.commit()

    executor = request.app.state.executor
    future = executor.submit(_run_scan_safely, request.app, scan.id, scan_request)
    request.app.state.future_registry.add(future)
    future.add_done_callback(request.app.state.future_registry.discard)

    if wait_seconds > 0:
        future.result(timeout=wait_seconds)
        session.expire_all()
        return JSONResponse(status_code=201, content=_scan_out(get_scan(session, scan.id)))
    session.refresh(scan)
    return JSONResponse(status_code=202, content=_scan_out(scan))


def _default_workspace(session: Session) -> str:
    workspace = session.query(Workspace).order_by(Workspace.created_at).first()
    if workspace is None:
        workspace = Workspace(id=str(uuid.uuid4()), slug="default", name="Default workspace",
                              deployment_mode="local")
        session.add(workspace)
        session.flush()
    return workspace.id


def _run_scan_safely(app, scan_id: str, scan_request: scan_runner.ScanRequest) -> None:
    from app.db import session_scope

    try:
        with session_scope(app.state.session_factory) as session:
            scan = session.get(Scan, scan_id)
            if scan is None:
                return
            scan_runner.execute(session, scan, scan_request, app.state.settings)
    except Exception as exc:  # surface the failure on the scan row, never 500 silently
        with session_scope(app.state.session_factory) as session:
            scan = session.get(Scan, scan_id)
            if scan is not None:
                scan.status = "failed"
                scan.phase = "failed"
                scan.error_code = "SCAN_FAILED"
                scan.error_message = str(exc)[:2000]
                scan.finished_at = utcnow()
                seq = session.query(ScanEvent).filter(ScanEvent.scan_id == scan_id).count()
                session.add(ScanEvent(scan_id=scan_id, seq=seq, phase="failed", message=str(exc)[:500]))


@router.get("/scans/{scan_id}", response_model=ScanOut, summary="Scan status and statistics")
def read_scan(scan_id: str, session: Session = Depends(get_session)) -> dict:
    return _scan_out(get_scan(session, scan_id))


@router.get("/scans/{scan_id}/events", response_model=list[ScanEventOut], summary="Live progress log")
def scan_events(scan_id: str, since: int = Query(default=0, ge=0),
                session: Session = Depends(get_session)) -> list[dict]:
    get_scan(session, scan_id)
    rows = (session.query(ScanEvent)
            .filter(ScanEvent.scan_id == scan_id, ScanEvent.seq >= since)
            .order_by(ScanEvent.seq).all())
    return [{"seq": r.seq, "phase": r.phase, "message": r.message, "created_at": iso(r.created_at)} for r in rows]


@router.get("/scans/{scan_id}/surfaces", summary="Coverage ledger (every enumerated surface)")
def scan_surfaces(
    scan_id: str,
    observation_state: Optional[str] = None,
    surface_kind: Optional[str] = None,
    page: Pagination = Depends(),
    session: Session = Depends(get_session),
) -> dict:
    get_scan(session, scan_id)
    query = session.query(ScanSurface).filter(ScanSurface.scan_id == scan_id)
    if observation_state:
        query = query.filter(ScanSurface.observation_state == observation_state)
    if surface_kind:
        query = query.filter(ScanSurface.surface_kind == surface_kind)
    rows = query.order_by(ScanSurface.surface_path).all()
    items = [{"id": r.id, "surface_path": r.surface_path, "surface_kind": r.surface_kind,
              "observation_state": r.observation_state, "observation_reason": r.observation_reason,
              "detector_id": r.detector_id, "byte_size": r.byte_size, "sha256": r.sha256,
              "line_count": r.line_count, "finding_count": r.finding_count} for r in rows]
    return paginate(items, page.limit, page.offset)


@router.get("/scans/{scan_id}/coverage", summary="Coverage index + unobserved surfaces")
def scan_coverage(scan_id: str, session: Session = Depends(get_session)) -> dict:
    from app.services import coverage as coverage_svc

    get_scan(session, scan_id)
    rows = session.query(ScanSurface).filter(ScanSurface.scan_id == scan_id).all()
    report = coverage_svc.compute(rows)
    return {"scan_id": scan_id, **report.as_dict()}


@router.post("/scans/{scan_id}/cancel", summary="Cancel a queued/running scan")
def cancel_scan(scan_id: str, session: Session = Depends(get_session)) -> dict:
    scan = get_scan(session, scan_id)
    if scan.status in {"completed", "failed", "cancelled"}:
        raise Conflict(f"scan is already {scan.status}", details={"status": scan.status})
    scan.status = "cancelled"
    scan.phase = "cancelled"
    scan.finished_at = utcnow()
    return _scan_out(scan)


@router.post("/scans/{scan_id}/retry", response_model=ScanOut, status_code=202, summary="Re-run a failed scan")
def retry_scan(scan_id: str, request: Request, session: Session = Depends(get_session)) -> dict:
    settings: Settings = request.app.state.settings
    scan = get_scan(session, scan_id)
    scan_request = scan_runner.ScanRequest(
        workspace_id=scan.workspace_id, target_uri=scan.target_uri, target_kind=scan.target_kind,
        name=scan.name, tiers=["source", "manifest", "config", "cert", "binary", "container"],
        live_probe=False, context=((scan.stats or {}).get("context") or {}),
        mosca={"scenario": "baseline"},
        policy_pack_version=scan.policy_pack_version,
    )
    request.app.state.executor.submit(_run_scan_safely, request.app, scan.id, scan_request)
    return _scan_out(scan)


@router.get("/scans/{scan_id}/diff", summary="Diff this scan against a previous scan")
def diff_scan(
    scan_id: str,
    against: str = Query(alias="against_scan_id", description="baseline scan id"),
    session: Session = Depends(get_session),
) -> dict:
    from app.models import Finding, RiskAssessment
    from app.services import diff as diff_svc

    get_scan(session, scan_id)
    baseline = get_scan(session, against)

    def index(scan_id_: str) -> dict[str, dict[str, Any]]:
        out: dict[str, dict[str, Any]] = {}
        rows = (session.query(Finding, RiskAssessment)
                .join(RiskAssessment, RiskAssessment.finding_id == Finding.pk)
                .filter(Finding.scan_id == scan_id_).all())
        for finding, risk in rows:
            out[finding.evidence_hash] = {
                "finding_id": finding.id, "file_path": finding.file_path,
                "asset_id": finding.asset_id, "band": risk.band,
                "composite_risk": risk.composite_risk, "urgency": risk.urgency_score,
            }
        return out

    before, after = index(baseline.id), index(scan_id)
    return diff_svc.compute(before, after, baseline.id, scan_id)


@router.post("/uploads", status_code=201, summary="Upload a scan target (zip / tar.gz / cert bundle)")
async def upload_target(
    file: Annotated[UploadFile, File()],
    request: Request,
    session: Session = Depends(get_session),
) -> dict:
    from app.ids import sha256_hex

    settings: Settings = request.app.state.settings
    dest_dir = Path(request.app.state.upload_dir)
    dest_dir.mkdir(parents=True, exist_ok=True)
    stem = Path(file.filename or "upload.bin").stem[:60]
    dest = dest_dir / f"{stem}-{uuid.uuid4().hex[:8]}{Path(file.filename or '').suffix}"
    digest_parts: list[bytes] = []
    total = 0
    with open(dest, "wb") as out:
        while chunk := await file.read(1 << 20):
            total += len(chunk)
            if total > settings.max_upload_bytes:
                out.close()
                dest.unlink(missing_ok=True)
                raise InvalidInput("upload exceeds ECDAT_MAX_UPLOAD_BYTES",
                                   details={"max_bytes": settings.max_upload_bytes})
            out.write(chunk)
            digest_parts.append(chunk)
    artifact = Artifact(
        workspace_id=_default_workspace(session), filename=file.filename or dest.name,
        sha256=sha256_hex(*[c.decode("latin-1") for c in digest_parts]), size_bytes=total,
        stored_path=str(dest), media_type=file.content_type or "application/octet-stream",
    )
    session.add(artifact)
    session.flush()
    return {"artifact_id": artifact.id, "filename": artifact.filename, "sha256": artifact.sha256,
            "size_bytes": artifact.size_bytes, "scan_with": f"POST /api/v1/scans with target_uri={dest}"}


ErrorEnvelope.model_rebuild()
