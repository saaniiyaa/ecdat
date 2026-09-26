"""Scan orchestrator: enumerate -> detect -> persist -> assess -> recommend.

Execution model
---------------
* Enumeration and detection run on a bounded thread pool (AST work is CPU bound
  but GIL-friendly enough here; file IO dominates on real repos).
* **All** database writes happen in the calling thread inside one transaction,
  which keeps SQLite happy and makes a scan atomic: a failed scan leaves no
  half-populated findings.
* Ordering is fully deterministic (surfaces sorted, findings sorted, IDs
  content-addressed), so two scans of the same bytes produce the same database
  content and the same Merkle root.
"""

from __future__ import annotations

import datetime as dt
import os
import tempfile
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable, Optional

from app.config import Settings
from app.db import utcnow
from app.ids import canonical_json, sha256_hex, stable_id
from app.models import (
    Certificate,
    CryptoAsset,
    DataAsset,
    Dependency,
    Finding,
    MigrationItem,
    Protection,
    Recommendation,
    RiskAssessment,
    RiskFactor,
    Scan,
    ScanEvent,
    ScanSurface,
)
from app.registry import library_asset
from app.scanners import BINARY_SCANNER, TEXT_SCANNERS, binaries, containers
from app.scanners.base import RawFinding, is_probable_text
from app.services import coverage as coverage_svc
from app.services import mosca as mosca_svc
from app.services import recommend as recommend_svc
from app.services import risk as risk_svc
from app.services.serialize import jsonable

MANIFEST_NAMES = {"requirements.txt", "package.json", "go.mod", "pom.xml", "build.gradle",
                  "build.gradle.kts", "cargo.toml", "pyproject.toml", "composer.json", "gemfile",
                  "packages.config", "go.sum", "poetry.lock", "package-lock.json"}
CERT_EXTS = {".pem", ".crt", ".cer", ".der", ".p12", ".pfx", ".key", ".csr"}


@dataclass
class SurfaceRecord:
    path: str
    kind: str
    state: str
    size: int
    sha256: str
    lines: int = 0
    detector: Optional[str] = None
    reason: Optional[str] = None
    findings: list[RawFinding] = field(default_factory=list)
    meta: dict[str, Any] = field(default_factory=dict)


@dataclass
class ScanRequest:
    workspace_id: str
    target_uri: str
    target_kind: str = "repo"
    name: str = ""
    tiers: list[str] = field(default_factory=lambda: ["source", "manifest", "config", "cert", "binary", "container"])
    live_probe: bool = False
    context: dict[str, Any] = field(default_factory=dict)
    mosca: dict[str, Any] = field(default_factory=dict)
    policy_pack_version: str = "pp-2026.09"


# --------------------------------------------------------------------------- #
# Enumeration
# --------------------------------------------------------------------------- #
def scan_path(path: Path, root: Path) -> str:
    r"""Scan-relative path, always POSIX-style.

    A Windows scan of the same estate would otherwise store
    `src\main\java\App.java` while a Linux scan stored `src/main/java/App.java`.
    That breaks three things we claim to do: byte-identical CBOMs across
    platforms, valid `file:` URIs in the CBOM/SARIF evidence, and readable
    paths in the console. One canonical separator, everywhere.
    """
    try:
        return path.relative_to(root).as_posix()
    except ValueError:
        return path.name


def digest_target(root: Path, *, limit: int = 200_000) -> tuple[str, int]:
    """Stable digest of a directory tree: SHA-256 over (relpath, size, filehash).

    The digest is over POSIX-style relative paths, so the same tree hashes
    identically on Windows, macOS and Linux.
    """
    entries: list[str] = []
    count = 0
    for path in sorted(p for p in root.rglob("*") if p.is_file()):
        rel = scan_path(path, root)
        try:
            stat = path.stat()
        except OSError:
            continue
        entries.append(f"{rel}:{stat.st_size}:{sha256_hex(str(rel), str(stat.st_size))[:16]}")
        count += 1
        if count >= limit:
            break
    return sha256_hex(*entries), count


def _classify(path: Path) -> str:
    name = path.name.lower()
    if containers.is_archive(path):
        return "container"
    if name in MANIFEST_NAMES or path.suffix.lower() in {".lock"}:
        return "manifest"
    if path.suffix.lower() in CERT_EXTS:
        return "cert"
    for scanner in TEXT_SCANNERS:
        if scanner.name == "scanner.config" and scanner.supports(path, 0):
            return "config"
    if BINARY_SCANNER.supports(path, 0):
        return "binary"
    for scanner in TEXT_SCANNERS:
        if scanner.supports(path, 0):
            return "source"
    return "other"


def _count_files(path: Path) -> int:
    total = 0
    for _dirpath, _dirnames, filenames in os.walk(path):
        total += len(filenames)
        if total > 100_000:
            break
    return total


def enumerate_surfaces(root: Path, settings: Settings) -> tuple[list[tuple[Path, str, str]], dict[str, Any]]:
    """Walk the target, returning (path, relative, kind) plus walk statistics.

    Policy-excluded directories (node_modules, .git, build, ...) are not scanned,
    but they are *counted and reported* as `skipped` surfaces: an inventory that
    silently ignores 4,000 vendored files is lying by omission.
    """
    results: list[tuple[Path, str, str]] = []
    skipped: list[SurfaceRecord] = []
    truncated = False
    for dirpath, dirnames, filenames in os.walk(root):
        excluded_here = [d for d in dirnames if d in settings.excluded_dirs]
        for name in sorted(excluded_here):
            full = Path(dirpath) / name
            rel = scan_path(full, root)
            count = _count_files(full)
            skipped.append(SurfaceRecord(
                path=f"{rel}/", kind="other", state="skipped", size=0, sha256="",
                reason=f"directory excluded by scan policy ({count} files not inspected)",
                meta={"excluded_by_policy": True, "file_count": count},
            ))
        dirnames[:] = sorted(d for d in dirnames if d not in settings.excluded_dirs)
        for filename in sorted(filenames):
            if len(results) >= settings.max_files:
                truncated = True
                break
            path = Path(dirpath) / filename
            try:
                if path.is_symlink() or not path.is_file():
                    continue
                size = path.stat().st_size
            except OSError:
                continue
            results.append((path, scan_path(path, root), _classify(path)))
        if truncated:
            break
    stats = {
        "excluded_dirs": [r.path for r in skipped],
        "excluded_file_count": sum(int(r.meta.get("file_count", 0)) for r in skipped),
        "truncated": truncated,
        "max_files": settings.max_files,
    }
    return results, stats, skipped


# --------------------------------------------------------------------------- #
# Per-surface detection
# --------------------------------------------------------------------------- #
def _read_text(path: Path, max_bytes: int) -> tuple[Optional[str], bool, int, str]:
    try:
        with open(path, "rb") as handle:
            head = handle.read(8192)
            rest = handle.read(max_bytes)
    except OSError as exc:
        return None, True, 0, f"io error: {exc}"
    data = head + rest
    truncated = len(data) >= max_bytes
    if not is_probable_text(path, head):
        return None, False, 0, "binary content in a text-classified file"
    return data.decode("utf-8", errors="replace"), truncated, data.count(b"\n") + 1, ""


def _file_sha(path: Path) -> str:
    try:
        with open(path, "rb") as handle:
            return sha256_hex(handle.read(4 * 1024 * 1024))
    except OSError:
        return ""


def scan_surface(path: Path, rel: str, kind: str, settings: Settings) -> SurfaceRecord:
    size = 0
    try:
        size = path.stat().st_size
    except OSError:
        pass
    digest = _file_sha(path)

    if kind == "container":
        record = _scan_container(path, rel, settings)
        record.sha256 = digest
        return record

    if kind == "binary":
        try:
            data = path.read_bytes()[: settings.max_file_bytes]
        except OSError as exc:
            return SurfaceRecord(rel, kind, "unobserved", size, digest, reason=f"io error: {exc}")
        binary_kind = BINARY_SCANNER.classify(data)
        if binary_kind == "opaque-blob":
            return SurfaceRecord(rel, kind, "unobserved", size, digest,
                                 reason="no executable format recognised; contents not interpreted")
        findings = BINARY_SCANNER.scan_bytes(data, rel)
        state = "partial" if not findings else "observed"
        return SurfaceRecord(rel, kind, state, size, digest, detector=BINARY_SCANNER.name,
                             findings=findings, meta={"binary_kind": binary_kind})

    text, truncated, lines, reason = _read_text(path, settings.max_file_bytes)
    if text is None:
        return SurfaceRecord(rel, kind, "partial" if reason else "unobserved", size, digest, reason=reason)

    applicable = [s for s in TEXT_SCANNERS if s.supports(path, size)]
    if not applicable:
        return SurfaceRecord(rel, kind, "unsupported", size, digest, lines=lines,
                             reason=f"no detector for {path.suffix or 'this file type'}")

    findings: list[RawFinding] = []
    for scanner in applicable:
        try:
            findings.extend(scanner.scan_text(text, rel))
        except Exception as exc:  # a broken detector must not kill the scan
            findings = findings  # keep going, record below
    deduped: dict[tuple[str, int | None, str], RawFinding] = {}
    for finding in findings:
        key = (finding.asset.get("canonical_name", "?"), finding.line_start, finding.detector_id)
        existing = deduped.get(key)
        if existing is None or finding.confidence > existing.confidence:
            deduped[key] = finding
    unique = sorted(deduped.values(), key=lambda f: (f.file_path, f.line_start or 0, f.asset.get("canonical_name", "")))
    return SurfaceRecord(
        rel, kind, "partial" if truncated else "observed", size, digest,
        lines=lines, detector=",".join(s.name for s in applicable), findings=unique,
        reason="file truncated at max_file_bytes" if truncated else None,
    )


def _scan_container(path: Path, rel: str, settings: Settings) -> SurfaceRecord:
    with tempfile.TemporaryDirectory(prefix="ecdat-oci-") as tmp:
        result = containers.extract_archive(
            path, Path(tmp), max_members=settings.max_container_members,
            max_member_bytes=settings.max_file_bytes, max_total_bytes=settings.max_upload_bytes,
        )
        if not result.extracted_to:
            return SurfaceRecord(rel, "container", "unobserved", 0, "", reason=result.note or "unreadable archive")
        members, _stats, _skipped = enumerate_surfaces(Path(tmp), settings)
        findings: list[RawFinding] = []
        states = {"observed": 0, "partial": 0, "unobserved": 0, "unsupported": 0}
        for member_path, member_rel, member_kind in members:
            member = scan_surface(member_path, f"{rel}!/{member_rel}", member_kind, settings)
            states[member.state] = states.get(member.state, 0) + 1
            findings.extend(member.findings)
        state = "partial" if (result.truncated or states["unobserved"] or states["unsupported"]) else "observed"
        return SurfaceRecord(
            rel, "container", state, 0, "", detector="scanner.containers", findings=findings,
            reason=("archive truncated or contains uninspected members" if state == "partial" else None),
            meta={"members": result.members, "member_bytes": result.total_bytes, "member_states": states},
        )


# --------------------------------------------------------------------------- #
# Persistence helpers
# --------------------------------------------------------------------------- #
def upsert_asset(session, asset_dict: dict[str, Any]) -> CryptoAsset:
    asset = session.query(CryptoAsset).filter(CryptoAsset.canonical_name == asset_dict["canonical_name"]).one_or_none()
    if asset is None:
        asset = CryptoAsset(id=stable_id("a", asset_dict["canonical_name"]), **asset_dict)
        session.add(asset)
    else:
        for field_name in ("quantum_status", "classical_security_bits", "quantum_security_bits", "mode",
                           "curve", "key_size_bits", "purpose", "is_post_quantum", "replacement_hint"):
            value = asset_dict.get(field_name)
            if value not in (None, "") and getattr(asset, field_name) in (None, "", "unknown"):
                setattr(asset, field_name, value)
    session.flush()
    return asset


def _evidence_hash(finding: RawFinding) -> str:
    return sha256_hex(
        finding.file_path,
        str(finding.line_start or 0),
        finding.symbol or "",
        finding.detector_id,
        finding.asset.get("canonical_name", ""),
    )


def persist(session, scan: Scan, request: ScanRequest, records: list[SurfaceRecord],
            mosca_result: mosca_svc.MoscaResult, settings: Settings) -> dict[str, Any]:
    assets_seen: dict[str, CryptoAsset] = {}
    findings_written = 0
    cert_index: dict[str, Certificate] = {}
    dep_index: dict[str, Dependency] = {}
    risk_rows: list[tuple[Finding, CryptoAsset, risk_svc.RiskResult]] = []

    unique_records: dict[tuple[str, str], SurfaceRecord] = {}
    for record in records:
        unique_records.setdefault((record.path, record.kind), record)
    records = list(unique_records.values())

    for record in sorted(records, key=lambda r: r.path):
        surface = ScanSurface(
            scan_id=scan.id, surface_path=record.path, surface_kind=record.kind,
            observation_state=record.state, observation_reason=record.reason,
            detector_id=record.detector, byte_size=record.size, sha256=record.sha256,
            line_count=record.lines, finding_count=len(record.findings), meta=record.meta,
        )
        session.add(surface)
        session.flush()

        for raw in record.findings:
            asset = upsert_asset(session, raw.asset)
            assets_seen[asset.id] = asset
            evidence_hash = _evidence_hash(raw)
            # Content-addressed *within a target*: the same detection in the same
            # bytes always gets the same id (diffable, reproducible), while the
            # same detection in a different target is a different row.
            finding_id = stable_id("f", scan.target_sha256, evidence_hash)
            if session.query(Finding).filter(
                Finding.id == finding_id, Finding.scan_id == scan.id
            ).first():
                continue  # already recorded for this scan (detector overlap)
            extra = jsonable(dict(raw.extra or {}))
            finding = Finding(
                id=finding_id, scan_id=scan.id, asset_id=asset.id, surface_id=surface.id,
                file_path=raw.file_path, line_start=raw.line_start, line_end=raw.line_end,
                symbol=raw.symbol, detector_id=raw.detector_id, evidence_class=raw.evidence_class,
                confidence=raw.confidence, corroborations=_corroborations(session, asset),
                snippet_redacted=raw.snippet, evidence_hash=evidence_hash, source=raw.source, extra=extra,
            )
            session.add(finding)
            session.flush()
            findings_written += 1

            result = risk_svc.assess(
                asset=asset.__dict__, evidence_class=raw.evidence_class, confidence=raw.confidence,
                corroborations=finding.corroborations, context=request.context, mosca=mosca_result,
                extra=extra, purpose_override=extra.get("purpose_override"),
            )
            session.flush()
            assessment = RiskAssessment(
                scan_id=scan.id, finding_id=finding.pk, asset_id=asset.id,
                policy_pack_version=request.policy_pack_version,
                classical_risk=result.classical_risk, quantum_risk=result.quantum_risk,
                composite_risk=result.composite_risk, band=result.band, mosca_state=result.mosca_state,
                mosca_margin_years=result.mosca_margin_years, urgency_score=result.urgency_score,
                effort_score=result.effort_score, effective_confidence=result.effective_confidence,
                evidence_class=result.evidence_class, deadline_year=result.deadline_year,
                capped_by_confidence=result.capped_by_confidence, explanation=result.explanation,
                drivers=jsonable(result.drivers),
            )
            session.add(assessment)
            session.flush()
            for seq, factor in enumerate(result.factors):
                session.add(RiskFactor(
                    assessment_id=assessment.id, seq=seq, rule_id=factor.rule_id, track=factor.track,
                    title=factor.title, factor_value=factor.factor_value, delta=factor.delta,
                    evidence=factor.evidence,
                ))
            risk_rows.append((finding, asset, result))

            # certificate / dependency side records
            cert_data = extra.get("certificate")
            if cert_data and cert_data.get("fingerprint_sha256") not in cert_index:
                cert = Certificate(
                    scan_id=scan.id, fingerprint_sha256=cert_data["fingerprint_sha256"],
                    subject=cert_data.get("subject", ""), issuer=cert_data.get("issuer", ""),
                    serial_number=cert_data.get("serial_number", ""),
                    not_before=_as_datetime(cert_data.get("not_before")),
                    not_after=_as_datetime(cert_data.get("not_after")),
                    signature_algorithm=cert_data.get("signature_algorithm", ""),
                    public_key_algorithm=cert_data.get("public_key_algorithm", ""),
                    public_key_bits=cert_data.get("public_key_bits"), is_ca=bool(cert_data.get("is_ca")),
                    is_self_signed=bool(cert_data.get("is_self_signed")), source_path=raw.file_path,
                    signature_asset_id=asset.id, meta=extra.get("key_material", {}),
                )
                session.add(cert)
                cert_index[cert.fingerprint_sha256] = cert
            lib = extra.get("library")
            if lib:
                dep_key = f"{lib}:{extra.get('version')}"
                if dep_key not in dep_index:
                    dep = Dependency(
                        id=stable_id("dep", scan.id, dep_key), scan_id=scan.id,
                        ecosystem=extra.get("ecosystem", "unknown"), name=lib,
                        version=extra.get("version"), manifest_path=raw.file_path,
                        is_crypto_library=True, is_pqc_capable=bool(extra.get("is_pqc_capable")),
                        linked_asset_id=asset.id, notes="declared in manifest",
                    )
                    session.add(dep)
                    dep_index[dep_key] = dep

    # recommendations + migration queue
    migrated = 0
    for finding, asset, result in risk_rows:
        if result.band == "low" and not result.mosca_state == "breached":
            continue
        is_tls = finding.file_path.endswith((".conf", ".cnf")) or "TLS" in (asset.family or "")
        reco = recommend_svc.build(asset.__dict__, mosca_breached=result.mosca_state == "breached", is_tls=is_tls)
        if not reco:
            continue
        assessment = (
            session.query(RiskAssessment)
            .filter(RiskAssessment.scan_id == scan.id, RiskAssessment.finding_id == finding.pk)
            .one()
        )
        reco_id = reco.reco_id(assessment.id, asset.id)
        if session.query(Recommendation).filter(Recommendation.id == reco_id).first():
            continue
        session.add(Recommendation(
            id=reco_id, assessment_id=assessment.id, current_asset_id=asset.id,
            target_standard=reco.target_standard, target_algorithm=reco.target_algorithm,
            target_parameter_set=reco.target_parameter_set, deployment_mode=reco.deployment_mode,
            effort_score=reco.effort_score, effort_rationale=reco.effort_rationale,
            tradeoff=reco.tradeoff, blocked_reason=reco.blocked_reason, priority=reco.priority,
        ))
        session.flush()  # recommendations.id is referenced by the migration item FK
        wave = 1 if result.band == "critical" else 2 if result.band == "high" else 3
        session.add(MigrationItem(
            workspace_id=request.workspace_id, scan_id=scan.id, recommendation_id=reco_id,
            title=f"{asset.canonical_name} -> {reco.target_algorithm} ({finding.file_path})",
            wave=wave, status="backlog", urgency_score=result.urgency_score, effort_score=reco.effort_score,
            target_standard=reco.target_standard, notes="; ".join(reco.notes) or None,
        ))
        migrated += 1
    session.flush()

    coverage = coverage_svc.compute(
        [r.__dict__ | {"observation_state": r.state, "surface_kind": r.kind, "surface_path": r.path}
         for r in records]
    )
    return {
        "assets": len(assets_seen),
        "findings": findings_written,
        "certificates": len(cert_index),
        "dependencies": len(dep_index),
        "migration_items": migrated,
        "coverage": coverage.as_dict(),
    }


def _as_datetime(value: Any) -> Optional[dt.datetime]:
    if isinstance(value, dt.datetime):
        return value
    if isinstance(value, str):
        try:
            return dt.datetime.fromisoformat(value)
        except ValueError:
            return None
    return None


def _corroborations(session, asset: CryptoAsset) -> int:
    """Independent detectors that already reported this canonical asset."""
    return session.query(Finding).filter(Finding.asset_id == asset.id).count()


# --------------------------------------------------------------------------- #
# Entry point
# --------------------------------------------------------------------------- #
def execute(session, scan: Scan, request: ScanRequest, settings: Settings) -> dict[str, Any]:
    started = time_now()
    scan.status = "running"
    scan.phase = "enumerating"
    scan.started_at = started
    session.commit()

    def event(phase: str, message: str) -> None:
        seq = session.query(ScanEvent).filter(ScanEvent.scan_id == scan.id).count()
        session.add(ScanEvent(scan_id=scan.id, seq=seq, phase=phase, message=message))
        session.commit()

    target = Path(request.target_uri)
    if not target.exists():
        raise FileNotFoundError(f"target not found: {target}")
    if not target.is_dir():
        target = target.parent

    event("digesting", f"hashing target {target}")
    target_digest, file_total = digest_target(target)
    scan.target_sha256 = target_digest
    scan.file_count = file_total

    if request.live_probe and not settings.allow_live_probe:
        event("probe-skipped", "live probe requested but ECDAT_ALLOW_LIVE_PROBE is false")

    surfaces, walk_stats, skipped = enumerate_surfaces(target, settings)
    event("enumerated",
          f"{len(surfaces)} surfaces enumerated ({file_total} files); "
          f"{len(skipped)} policy-excluded directories ({walk_stats['excluded_file_count']} files not inspected)")
    scan.surface_count = len(surfaces)

    scan.phase = "detecting"
    session.commit()
    records: list[SurfaceRecord] = []
    simple = [s for s in surfaces if s[2] != "container"]
    with ThreadPoolExecutor(max_workers=max(1, settings.scan_workers)) as pool:
        futures = {pool.submit(scan_surface, path, rel, kind, settings): (rel, kind) for path, rel, kind in simple}
        for future, (rel, kind) in futures.items():
            try:
                records.append(future.result())
            except Exception as exc:  # pragma: no cover - defensive
                records.append(SurfaceRecord(rel, kind, "unobserved", 0, "", reason=f"detector error: {exc}"))
    records.extend(skipped)
    for path, rel, kind in [s for s in surfaces if s[2] == "container"]:
        try:
            records.append(scan_surface(path, rel, kind, settings))
        except Exception as exc:  # pragma: no cover
            records.append(SurfaceRecord(rel, "container", "unobserved", 0, "", reason=str(exc)))

    event("detected", f"{sum(len(r.findings) for r in records)} raw findings across {len(records)} surfaces")

    x, y, z, _citation = mosca_svc.resolve(
        request.mosca.get("scenario", "baseline"),
        request.mosca.get("x_years"),
        request.mosca.get("y_years"),
        request.mosca.get("z_years"),
    )
    if request.context.get("data_lifetime_years"):
        x = float(request.context["data_lifetime_years"])
    mosca_result = mosca_svc.evaluate(x, y, z)

    scan.phase = "assessing"
    session.commit()
    stats = persist(session, scan, request, records, mosca_result, settings)
    session.commit()

    scan.status = "completed"
    scan.phase = "completed"
    scan.finished_at = utcnow()
    scan.duration_ms = int((scan.finished_at - scan.started_at).total_seconds() * 1000)
    scan.finding_count = stats["findings"]
    scan.progress_pct = 100
    scan.stats = {
        **stats, "walk": walk_stats, "mosca": mosca_result.as_dict(),
        "detectors": sorted({r.detector for r in records if r.detector}),
    }
    event("completed", f"scan complete: {stats['findings']} findings, coverage {stats['coverage']['coverage_index']:.2%}")
    session.commit()
    return scan.stats


def time_now() -> dt.datetime:
    return utcnow()


def data_assets_for(session, workspace_id: str) -> list[DataAsset]:
    return session.query(DataAsset).filter(DataAsset.workspace_id == workspace_id).all()


def protections_for(session, asset_id: str) -> list[Protection]:
    return session.query(Protection).filter(Protection.crypto_asset_id == asset_id).all()


def library_asset_for(name: str, version: str | None) -> dict[str, Any]:
    return library_asset(name, version, False)


def dumps(payload: Any) -> str:
    return canonical_json(payload)


def as_iterable(value: Optional[Iterable]) -> list:
    return list(value or [])
