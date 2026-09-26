"""ORM models - the inventory data model.

Design rules enforced here (this is the part that makes the tool defensible):

* A **CryptoAsset** is a canonical *algorithm/profile* fact, global to the
  installation, content-addressed by canonical name. It is NOT a finding.
* A **Finding** is "this asset, observed here, by this detector, with this
  evidence class" - it belongs to exactly one scan and is content-addressed by
  its evidence hash, which is what makes re-scans diffable and reports stable.
* A **ScanSurface** is the unit of coverage accounting. Every enumerated surface
  is recorded with an explicit observation state, so "we did not look" is a
  first-class, queryable fact (never silently "secure").
* A **RiskAssessment** stores the two tracks separately plus every
  **RiskFactor** that produced them, so any score can be re-derived and audited.
* Data classification (**DataAsset**) and cryptography are linked many-to-many
  (**Protection**): one algorithm commonly protects several data classes and one
  data class is usually protected by several layers. Mosca's X is per data class.
"""

from __future__ import annotations

import datetime as dt
import uuid
from typing import Any, Optional

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base, JSONVariant, utcnow


def _uuid() -> str:
    return str(uuid.uuid4())


# --------------------------------------------------------------------------- #
# Workspace / scans / surfaces
# --------------------------------------------------------------------------- #
class Workspace(Base):
    """An assessment boundary: one organisation, one estate, one policy pack."""

    __tablename__ = "workspaces"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    slug: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    deployment_mode: Mapped[str] = mapped_column(String(32), default="local")  # local|air_gapped|cloud
    policy_pack_version: Mapped[str] = mapped_column(String(32), default="pp-2026.09")
    created_at: Mapped[dt.datetime] = mapped_column(default=utcnow)
    updated_at: Mapped[dt.datetime] = mapped_column(default=utcnow, onupdate=utcnow)


class Artifact(Base):
    """An uploaded scan target (zip / tar.gz / binary / cert bundle)."""

    __tablename__ = "artifacts"
    __table_args__ = (
        Index("ix_artifacts_ws_created", "workspace_id", "created_at"),
        CheckConstraint("size_bytes >= 0", name="ck_artifacts_size"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    filename: Mapped[str] = mapped_column(String(512), nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    stored_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    media_type: Mapped[str] = mapped_column(String(128), default="application/octet-stream")
    created_at: Mapped[dt.datetime] = mapped_column(default=utcnow)


class Scan(Base):
    """One immutable discovery run over one target digest."""

    __tablename__ = "scans"
    __table_args__ = (
        Index("ix_scans_ws_created", "workspace_id", "created_at"),
        Index("ix_scans_status", "status"),
        CheckConstraint(
            "status IN ('queued','running','completed','failed','cancelled')",
            name="ck_scans_status",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    artifact_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("artifacts.id", ondelete="SET NULL"), index=True
    )
    name: Mapped[str] = mapped_column(String(255), default="")
    target_uri: Mapped[str] = mapped_column(String(1024), nullable=False)
    target_kind: Mapped[str] = mapped_column(String(32), default="repo")  # repo|upload|fixture
    target_sha256: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(16), default="queued")  # index: ix_scans_status
    phase: Mapped[str] = mapped_column(String(48), default="queued")
    progress_pct: Mapped[int] = mapped_column(Integer, default=0)
    engine_version: Mapped[str] = mapped_column(String(32), default="1.0.0")
    policy_pack_version: Mapped[str] = mapped_column(String(32), default="pp-2026.09")
    started_at: Mapped[Optional[dt.datetime]] = mapped_column()
    finished_at: Mapped[Optional[dt.datetime]] = mapped_column()
    duration_ms: Mapped[Optional[int]] = mapped_column(Integer)
    file_count: Mapped[int] = mapped_column(Integer, default=0)
    surface_count: Mapped[int] = mapped_column(Integer, default=0)
    finding_count: Mapped[int] = mapped_column(Integer, default=0)
    error_code: Mapped[Optional[str]] = mapped_column(String(64))
    error_message: Mapped[Optional[str]] = mapped_column(Text)
    stats: Mapped[dict[str, Any]] = mapped_column(JSONVariant, default=dict)
    created_at: Mapped[dt.datetime] = mapped_column(default=utcnow, index=True)


class ScanEvent(Base):
    """Append-only progress log powering the live console UI."""

    __tablename__ = "scan_events"
    __table_args__ = (Index("ix_scan_events_scan_seq", "scan_id", "seq"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    scan_id: Mapped[str] = mapped_column(ForeignKey("scans.id", ondelete="CASCADE"), nullable=False)
    seq: Mapped[int] = mapped_column(Integer, default=0)
    phase: Mapped[str] = mapped_column(String(48), default="")
    message: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[dt.datetime] = mapped_column(default=utcnow)


class ScanSurface(Base):
    """Coverage accounting unit - one enumerated thing the scanner looked at.

    observation_state:
      observed   - fully inspected by a detector
      partial    - inspected with known blind spots (e.g. truncated file)
      unsupported- language/surface we do not parse
      unobserved - enumerated but not inspected (budget, binary blob, out of scope)
      skipped    - deliberately excluded by policy
    """

    __tablename__ = "scan_surfaces"
    __table_args__ = (
        UniqueConstraint("scan_id", "surface_path", "surface_kind", name="uq_surface_identity"),
        Index("ix_surfaces_scan_state", "scan_id", "observation_state"),
        Index("ix_surfaces_scan_kind", "scan_id", "surface_kind"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    scan_id: Mapped[str] = mapped_column(ForeignKey("scans.id", ondelete="CASCADE"), nullable=False)
    surface_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    surface_kind: Mapped[str] = mapped_column(String(32), nullable=False)  # source|binary|container|cert|config|manifest
    observation_state: Mapped[str] = mapped_column(String(16), nullable=False, default="observed")
    observation_reason: Mapped[Optional[str]] = mapped_column(Text)
    detector_id: Mapped[Optional[str]] = mapped_column(String(64))
    byte_size: Mapped[int] = mapped_column(Integer, default=0)
    sha256: Mapped[str] = mapped_column(String(64), default="", index=True)
    line_count: Mapped[int] = mapped_column(Integer, default=0)
    finding_count: Mapped[int] = mapped_column(Integer, default=0)
    meta: Mapped[dict[str, Any]] = mapped_column(JSONVariant, default=dict)
    created_at: Mapped[dt.datetime] = mapped_column(default=utcnow)


# --------------------------------------------------------------------------- #
# Cryptographic assets
# --------------------------------------------------------------------------- #
class CryptoAsset(Base):
    """Canonical cryptographic asset (algorithm / certificate / protocol / material)."""

    __tablename__ = "crypto_assets"
    __table_args__ = (
        UniqueConstraint("canonical_name", name="uq_asset_canonical_name"),
        Index("ix_assets_family", "family"),
        Index("ix_assets_quantum_status", "quantum_status"),
        Index("ix_assets_purpose", "purpose"),
    )

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    canonical_name: Mapped[str] = mapped_column(String(255), nullable=False)
    oid: Mapped[Optional[str]] = mapped_column(String(64), index=True)
    asset_type: Mapped[str] = mapped_column(String(32), default="algorithm")
    family: Mapped[str] = mapped_column(String(64), default="unknown")
    primitive: Mapped[str] = mapped_column(String(32), default="unknown")
    purpose: Mapped[str] = mapped_column(String(32), default="unknown")
    key_size_bits: Mapped[Optional[int]] = mapped_column(Integer)
    parameter_set: Mapped[Optional[str]] = mapped_column(String(64))
    curve: Mapped[Optional[str]] = mapped_column(String(64))
    mode: Mapped[Optional[str]] = mapped_column(String(32))
    padding: Mapped[Optional[str]] = mapped_column(String(32))
    classical_security_bits: Mapped[int] = mapped_column(Integer, default=0)
    quantum_security_bits: Mapped[int] = mapped_column(Integer, default=0)
    quantum_status: Mapped[str] = mapped_column(String(32), default="unknown")
    is_post_quantum: Mapped[bool] = mapped_column(Boolean, default=False)
    nist_deprecated_after: Mapped[Optional[int]] = mapped_column(Integer)
    nist_disallowed_after: Mapped[Optional[int]] = mapped_column(Integer)
    replacement_hint: Mapped[Optional[str]] = mapped_column(String(255))
    registry_source: Mapped[str] = mapped_column(String(64), default="ecdat-policy-pack")
    meta: Mapped[dict[str, Any]] = mapped_column(JSONVariant, default=dict)
    created_at: Mapped[dt.datetime] = mapped_column(default=utcnow)


class Finding(Base):
    """An observed use of a CryptoAsset at a specific location with specific evidence."""

    __tablename__ = "findings"
    __table_args__ = (
        UniqueConstraint("scan_id", "evidence_hash", name="uq_finding_evidence"),
        Index("ix_findings_scan_path", "scan_id", "file_path"),
        Index("ix_findings_scan_asset", "scan_id", "asset_id"),
        Index("ix_findings_scan_conf", "scan_id", "confidence"),
    )

    # `pk` is the row identity; `id` is the *canonical detection identity* - the
    # same detection in two scans of the same bytes must have the same id, which
    # is what makes diffing, CBOM stability and Merkle leaves reproducible.
    pk: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    id: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    scan_id: Mapped[str] = mapped_column(ForeignKey("scans.id", ondelete="CASCADE"), nullable=False)
    asset_id: Mapped[str] = mapped_column(ForeignKey("crypto_assets.id"), nullable=False, index=True)
    surface_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("scan_surfaces.id", ondelete="SET NULL"), index=True
    )
    file_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    line_start: Mapped[Optional[int]] = mapped_column(Integer)
    line_end: Mapped[Optional[int]] = mapped_column(Integer)
    symbol: Mapped[Optional[str]] = mapped_column(String(255))
    detector_id: Mapped[str] = mapped_column(String(64), nullable=False)
    evidence_class: Mapped[str] = mapped_column(String(32), nullable=False, default="PATTERN")
    confidence: Mapped[float] = mapped_column(Float, default=0.5)
    corroborations: Mapped[int] = mapped_column(Integer, default=0)
    snippet_redacted: Mapped[Optional[str]] = mapped_column(Text)
    evidence_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    source: Mapped[str] = mapped_column(String(16), default="static")  # static|config|cert|binary|container|live
    extra: Mapped[dict[str, Any]] = mapped_column(JSONVariant, default=dict)
    created_at: Mapped[dt.datetime] = mapped_column(default=utcnow)


class Dependency(Base):
    """Declared software dependency (SBOM slice) cross-referenced to crypto assets."""

    __tablename__ = "dependencies"
    __table_args__ = (
        Index("ix_deps_scan_name", "scan_id", "name"),
    )

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    scan_id: Mapped[str] = mapped_column(ForeignKey("scans.id", ondelete="CASCADE"), nullable=False)
    ecosystem: Mapped[str] = mapped_column(String(32), default="unknown")
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    version: Mapped[Optional[str]] = mapped_column(String(64))
    purl: Mapped[Optional[str]] = mapped_column(String(512))
    manifest_path: Mapped[str] = mapped_column(String(1024), default="")
    is_crypto_library: Mapped[bool] = mapped_column(Boolean, default=False)
    is_pqc_capable: Mapped[bool] = mapped_column(Boolean, default=False)
    linked_asset_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("crypto_assets.id", ondelete="SET NULL"), index=True
    )
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[dt.datetime] = mapped_column(default=utcnow)


class Certificate(Base):
    """X.509 certificate fact table (never stores key material)."""

    __tablename__ = "certificates"
    __table_args__ = (
        UniqueConstraint("scan_id", "fingerprint_sha256", name="uq_cert_fingerprint"),
        Index("ix_certs_scan_notafter", "scan_id", "not_after"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    scan_id: Mapped[str] = mapped_column(ForeignKey("scans.id", ondelete="CASCADE"), nullable=False)
    fingerprint_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    subject: Mapped[str] = mapped_column(String(512), default="")
    issuer: Mapped[str] = mapped_column(String(512), default="")
    serial_number: Mapped[str] = mapped_column(String(128), default="")
    not_before: Mapped[Optional[dt.datetime]] = mapped_column()
    not_after: Mapped[dt.datetime] = mapped_column()
    signature_algorithm: Mapped[str] = mapped_column(String(128), default="")
    public_key_algorithm: Mapped[str] = mapped_column(String(64), default="")
    public_key_bits: Mapped[Optional[int]] = mapped_column(Integer)
    is_ca: Mapped[bool] = mapped_column(Boolean, default=False)
    is_self_signed: Mapped[bool] = mapped_column(Boolean, default=False)
    source_path: Mapped[str] = mapped_column(String(1024), default="")
    signature_asset_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("crypto_assets.id", ondelete="SET NULL"), index=True
    )
    meta: Mapped[dict[str, Any]] = mapped_column(JSONVariant, default=dict)
    created_at: Mapped[dt.datetime] = mapped_column(default=utcnow)


class ProtocolExposure(Base):
    """Observed protocol handshake facts (config-derived or bounded live probe)."""

    __tablename__ = "protocol_exposures"
    __table_args__ = (
        Index("ix_protos_scan_endpoint", "scan_id", "endpoint"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    scan_id: Mapped[str] = mapped_column(ForeignKey("scans.id", ondelete="CASCADE"), nullable=False)
    endpoint: Mapped[str] = mapped_column(String(255), nullable=False)
    protocol: Mapped[str] = mapped_column(String(32), default="tls")
    version: Mapped[str] = mapped_column(String(32), default="")
    cipher_suite: Mapped[Optional[str]] = mapped_column(String(128))
    kex_group: Mapped[Optional[str]] = mapped_column(String(128))
    source: Mapped[str] = mapped_column(String(16), default="config")  # config|live|fixture
    peer_cert_fingerprint: Mapped[Optional[str]] = mapped_column(String(64))
    asset_ids: Mapped[list[str]] = mapped_column(JSONVariant, default=list)
    observed_at: Mapped[dt.datetime] = mapped_column(default=utcnow)


# --------------------------------------------------------------------------- #
# Business context: data assets, protections, Mosca scenarios
# --------------------------------------------------------------------------- #
class DataAsset(Base):
    """A category of data with a confidentiality lifetime (Mosca's X)."""

    __tablename__ = "data_assets"
    __table_args__ = (Index("ix_data_assets_ws", "workspace_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    classification: Mapped[str] = mapped_column(String(32), default="internal")
    confidentiality_lifetime_years: Mapped[float] = mapped_column(Float, default=10.0)
    lifetime_basis: Mapped[str] = mapped_column(String(255), default="assumption: no owner declared")
    regulatory_ref: Mapped[Optional[str]] = mapped_column(String(255))
    owner: Mapped[Optional[str]] = mapped_column(String(255))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[dt.datetime] = mapped_column(default=utcnow)


class Protection(Base):
    """M:N - which crypto asset protects which data class (and in what role)."""

    __tablename__ = "protections"
    __table_args__ = (
        UniqueConstraint("data_asset_id", "crypto_asset_id", name="uq_protection_pair"),
        Index("ix_protections_asset", "crypto_asset_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    data_asset_id: Mapped[str] = mapped_column(ForeignKey("data_assets.id", ondelete="CASCADE"), nullable=False, index=True)
    crypto_asset_id: Mapped[str] = mapped_column(ForeignKey("crypto_assets.id", ondelete="CASCADE"), nullable=False)
    role: Mapped[str] = mapped_column(String(32), default="primary")
    strength: Mapped[str] = mapped_column(String(16), default="depends_on_asset")
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[dt.datetime] = mapped_column(default=utcnow)


class MoscaScenario(Base):
    """Named (X, Y, Z) planning scenario with a citable source for Z."""

    __tablename__ = "mosca_scenarios"
    __table_args__ = (Index("ix_scenarios_ws", "workspace_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    workspace_id: Mapped[Optional[str]] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    x_years: Mapped[float] = mapped_column(Float, default=10.0)
    y_years: Mapped[float] = mapped_column(Float, default=4.0)
    z_years: Mapped[float] = mapped_column(Float, default=10.0)
    horizon_label: Mapped[str] = mapped_column(String(64), default="")
    source_citation: Mapped[str] = mapped_column(String(512), default="")
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[dt.datetime] = mapped_column(default=utcnow)


# --------------------------------------------------------------------------- #
# Risk, recommendations, migration
# --------------------------------------------------------------------------- #
class RiskAssessment(Base):
    """Per-finding verdict: two tracks + composite + urgency, fully explained."""

    __tablename__ = "risk_assessments"
    __table_args__ = (
        UniqueConstraint("scan_id", "finding_id", name="uq_assessment_finding"),
        Index("ix_assess_scan_band", "scan_id", "band"),
        Index("ix_assess_scan_urgency", "scan_id", "urgency_score"),
        Index("ix_assess_scan_risk", "scan_id", "composite_risk"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    scan_id: Mapped[str] = mapped_column(ForeignKey("scans.id", ondelete="CASCADE"), nullable=False)
    finding_id: Mapped[str] = mapped_column(ForeignKey("findings.pk", ondelete="CASCADE"), nullable=False, index=True)
    asset_id: Mapped[str] = mapped_column(ForeignKey("crypto_assets.id"), nullable=False, index=True)
    policy_pack_version: Mapped[str] = mapped_column(String(32), default="pp-2026.09")
    classical_risk: Mapped[int] = mapped_column(Integer, default=0)
    quantum_risk: Mapped[int] = mapped_column(Integer, default=0)
    composite_risk: Mapped[int] = mapped_column(Integer, default=0)
    band: Mapped[str] = mapped_column(String(16), default="low")
    mosca_state: Mapped[str] = mapped_column(String(16), default="not_evaluated")
    mosca_margin_years: Mapped[Optional[float]] = mapped_column(Float)
    urgency_score: Mapped[int] = mapped_column(Integer, default=0)
    effort_score: Mapped[int] = mapped_column(Integer, default=0)
    effective_confidence: Mapped[float] = mapped_column(Float, default=0.0)
    evidence_class: Mapped[str] = mapped_column(String(32), default="PATTERN")
    deadline_year: Mapped[Optional[int]] = mapped_column(Integer)
    capped_by_confidence: Mapped[bool] = mapped_column(Boolean, default=False)
    explanation: Mapped[str] = mapped_column(Text, default="")
    drivers: Mapped[dict[str, Any]] = mapped_column(JSONVariant, default=dict)
    created_at: Mapped[dt.datetime] = mapped_column(default=utcnow)


class RiskFactor(Base):
    """One auditable contribution to a score (rule + observed value + delta)."""

    __tablename__ = "risk_factors"
    __table_args__ = (Index("ix_factors_assessment", "assessment_id", "seq"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    assessment_id: Mapped[str] = mapped_column(ForeignKey("risk_assessments.id", ondelete="CASCADE"), nullable=False)
    seq: Mapped[int] = mapped_column(Integer, default=0)
    rule_id: Mapped[str] = mapped_column(String(32), nullable=False)
    track: Mapped[str] = mapped_column(String(16), nullable=False)  # classical|quantum|mosca|context
    title: Mapped[str] = mapped_column(String(255), default="")
    factor_value: Mapped[Optional[str]] = mapped_column(String(128))
    delta: Mapped[int] = mapped_column(Integer, default=0)
    evidence: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[dt.datetime] = mapped_column(default=utcnow)


class Recommendation(Base):
    """Purpose-aware PQC substitution proposal bound to a NIST/IETF standard."""

    __tablename__ = "recommendations"
    __table_args__ = (Index("ix_recos_assessment", "assessment_id"),)

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    assessment_id: Mapped[str] = mapped_column(ForeignKey("risk_assessments.id", ondelete="CASCADE"), nullable=False)
    current_asset_id: Mapped[str] = mapped_column(ForeignKey("crypto_assets.id"), nullable=False, index=True)
    target_standard: Mapped[str] = mapped_column(String(128), default="")
    target_algorithm: Mapped[str] = mapped_column(String(128), default="")
    target_parameter_set: Mapped[Optional[str]] = mapped_column(String(64))
    deployment_mode: Mapped[str] = mapped_column(String(32), default="hybrid")
    effort_score: Mapped[int] = mapped_column(Integer, default=0)
    effort_rationale: Mapped[str] = mapped_column(Text, default="")
    tradeoff: Mapped[str] = mapped_column(Text, default="")
    blocked_reason: Mapped[Optional[str]] = mapped_column(Text)
    priority: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[dt.datetime] = mapped_column(default=utcnow)


class MigrationItem(Base):
    """Trackable migration work item (urgency and effort kept separate on purpose)."""

    __tablename__ = "migration_items"
    __table_args__ = (
        UniqueConstraint("workspace_id", "scan_id", "recommendation_id", name="uq_migration_item"),
        Index("ix_migration_status", "workspace_id", "status"),
        Index("ix_migration_wave", "workspace_id", "wave"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    scan_id: Mapped[str] = mapped_column(ForeignKey("scans.id", ondelete="CASCADE"), nullable=False, index=True)
    recommendation_id: Mapped[str] = mapped_column(
        ForeignKey("recommendations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(512), default="")
    owner: Mapped[Optional[str]] = mapped_column(String(255))
    wave: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String(24), default="backlog")
    urgency_score: Mapped[int] = mapped_column(Integer, default=0)
    effort_score: Mapped[int] = mapped_column(Integer, default=0)
    target_standard: Mapped[str] = mapped_column(String(128), default="")
    due_by: Mapped[Optional[str]] = mapped_column(String(32))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[dt.datetime] = mapped_column(default=utcnow)
    updated_at: Mapped[dt.datetime] = mapped_column(default=utcnow, onupdate=utcnow)


# --------------------------------------------------------------------------- #
# Forensic attestation
# --------------------------------------------------------------------------- #
class EvidenceLedger(Base):
    """Append-only hash chain over scan evidence (tamper-evident by construction)."""

    __tablename__ = "evidence_ledger"
    __table_args__ = (
        UniqueConstraint("scan_id", "seq", name="uq_ledger_seq"),
        Index("ix_ledger_scan", "scan_id", "seq"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    scan_id: Mapped[str] = mapped_column(ForeignKey("scans.id", ondelete="CASCADE"), nullable=False)
    seq: Mapped[int] = mapped_column(Integer, default=0)
    kind: Mapped[str] = mapped_column(String(32), default="finding")
    payload_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    prev_hash: Mapped[str] = mapped_column(String(64), default="")
    entry_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[dt.datetime] = mapped_column(default=utcnow)


class Attestation(Base):
    """Signed forensic dossier over the scan evidence tree (BSA Section 63 aligned)."""

    __tablename__ = "attestations"
    __table_args__ = (
        UniqueConstraint("scan_id", "merkle_root", name="uq_attestation_root"),
        Index("ix_attest_created", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    scan_id: Mapped[str] = mapped_column(ForeignKey("scans.id", ondelete="CASCADE"), nullable=False, index=True)
    schema_version: Mapped[str] = mapped_column(String(16), default="1.0")
    officer_name: Mapped[str] = mapped_column(String(255), default="")
    officer_role: Mapped[str] = mapped_column(String(255), default="")
    declaration: Mapped[str] = mapped_column(Text, default="")
    merkle_root: Mapped[str] = mapped_column(String(64), nullable=False)
    leaf_count: Mapped[int] = mapped_column(Integer, default=0)
    ledger_head: Mapped[str] = mapped_column(String(64), default="")
    signature_alg: Mapped[str] = mapped_column(String(32), default="Ed25519")
    signature_b64: Mapped[str] = mapped_column(Text, default="")
    public_key_b64: Mapped[str] = mapped_column(Text, default="")
    key_origin: Mapped[str] = mapped_column(String(32), default="ephemeral_demo")
    tpm_quote: Mapped[Optional[str]] = mapped_column(Text)
    tpm_pcr_summary: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONVariant)
    dossier: Mapped[dict[str, Any]] = mapped_column(JSONVariant, default=dict)
    created_at: Mapped[dt.datetime] = mapped_column(default=utcnow)
