"""Pydantic v2 request/response contracts (the frontend's source of truth)."""

from __future__ import annotations

import datetime as dt
from typing import Any, Generic, Literal, Optional, TypeVar

from pydantic import BaseModel, ConfigDict, Field, field_validator

T = TypeVar("T")


def iso(value: Optional[dt.datetime]) -> Optional[str]:
    """ISO-8601 UTC with explicit 'Z' - identical in every response."""
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=dt.timezone.utc)
    return value.astimezone(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --------------------------------------------------------------------------- #
# Envelope / meta
# --------------------------------------------------------------------------- #
class ErrorBody(BaseModel):
    code: str
    message: str
    details: dict[str, Any] = Field(default_factory=dict)


class ErrorEnvelope(BaseModel):
    error: ErrorBody
    timestamp: str
    request_id: str


class HealthOut(BaseModel):
    status: Literal["healthy", "degraded", "unhealthy"]
    version: str
    engine_version: str
    policy_pack_version: str
    database: str
    dialect: str
    uptime_seconds: float
    queue_depth: int
    timestamp: str


class VersionOut(BaseModel):
    name: str
    version: str
    engine_version: str
    policy_pack_version: str
    api_version: str = "v1"


# --------------------------------------------------------------------------- #
# Workspace
# --------------------------------------------------------------------------- #
class WorkspaceCreate(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    slug: Optional[str] = Field(default=None, max_length=64)
    deployment_mode: Literal["local", "air_gapped", "cloud"] = "local"


class WorkspaceOut(ORMModel):
    id: str
    slug: str
    name: str
    deployment_mode: str
    policy_pack_version: str
    created_at: Optional[str] = None


# --------------------------------------------------------------------------- #
# Scans
# --------------------------------------------------------------------------- #
class ScanContext(BaseModel):
    """Business context injected per scan; drives the context/mosca track."""

    exposure: Literal["internet_facing", "dmz", "internal", "air_gapped", "unknown"] = "unknown"
    criticality: Literal["sovereign_critical", "core_operations", "peripheral", "unknown"] = "unknown"
    classification: Literal["top_secret", "secret", "confidential", "internal", "public"] = "internal"
    data_lifetime_years: float = Field(default=10.0, ge=0, le=200)
    system_name: Optional[str] = Field(default=None, max_length=255)

    @field_validator("system_name")
    @classmethod
    def _strip(cls, v: Optional[str]) -> Optional[str]:
        return v.strip() if v else v


class MoscaInput(BaseModel):
    scenario: Literal["conservative", "baseline", "extended", "custom"] = "baseline"
    x_years: Optional[float] = Field(default=None, ge=0, le=200)
    y_years: Optional[float] = Field(default=None, ge=0, le=200)
    z_years: Optional[float] = Field(default=None, ge=0, le=200)


class ScanCreate(BaseModel):
    target_uri: str = Field(min_length=1, max_length=1024, description="Absolute path, repo path or https URL")
    workspace_id: Optional[str] = Field(default=None, max_length=36)
    target_kind: Literal["repo", "upload", "fixture"] = "repo"
    name: Optional[str] = Field(default=None, max_length=255)
    tiers: list[Literal["source", "manifest", "config", "cert", "binary", "container"]] = Field(
        default_factory=lambda: ["source", "manifest", "config", "cert", "binary", "container"]
    )
    live_probe: bool = False
    context: ScanContext = Field(default_factory=ScanContext)
    mosca: MoscaInput = Field(default_factory=MoscaInput)
    policy_pack_version: Optional[str] = Field(default=None, max_length=32)

    @field_validator("target_uri")
    @classmethod
    def _norm_uri(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("target_uri must not be blank")
        return v


class ScanOut(ORMModel):
    id: str
    workspace_id: str
    name: str
    target_uri: str
    target_kind: str
    target_sha256: str
    status: str
    phase: str
    progress_pct: int
    engine_version: str
    policy_pack_version: str
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    duration_ms: Optional[int] = None
    file_count: int
    surface_count: int
    finding_count: int
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    stats: dict[str, Any] = Field(default_factory=dict)
    created_at: Optional[str] = None


class ScanEventOut(ORMModel):
    seq: int
    phase: str
    message: str
    created_at: Optional[str] = None


class SurfaceOut(ORMModel):
    id: str
    surface_path: str
    surface_kind: str
    observation_state: str
    observation_reason: Optional[str] = None
    detector_id: Optional[str] = None
    byte_size: int
    sha256: str
    line_count: int
    finding_count: int


# --------------------------------------------------------------------------- #
# Findings / risk
# --------------------------------------------------------------------------- #
class AssetOut(ORMModel):
    id: str
    canonical_name: str
    oid: Optional[str] = None
    asset_type: str
    family: str
    primitive: str
    purpose: str
    key_size_bits: Optional[int] = None
    curve: Optional[str] = None
    mode: Optional[str] = None
    classical_security_bits: int
    quantum_security_bits: int
    quantum_status: str
    is_post_quantum: bool
    nist_deprecated_after: Optional[int] = None
    nist_disallowed_after: Optional[int] = None
    replacement_hint: Optional[str] = None


class FindingOut(BaseModel):
    id: str
    scan_id: str
    file_path: str
    line_start: Optional[int] = None
    line_end: Optional[int] = None
    symbol: Optional[str] = None
    detector_id: str
    evidence_class: str
    confidence: float
    corroborations: int
    snippet_redacted: Optional[str] = None
    source: str
    asset: AssetOut
    risk: Optional["RiskOut"] = None


class FactorOut(ORMModel):
    seq: int
    rule_id: str
    track: str
    title: str
    factor_value: Optional[str] = None
    delta: int
    evidence: Optional[str] = None


class RiskOut(ORMModel):
    id: str
    classical_risk: int
    quantum_risk: int
    composite_risk: int
    band: str
    mosca_state: str
    mosca_margin_years: Optional[float] = None
    urgency_score: int
    effort_score: int
    effective_confidence: float
    evidence_class: str
    deadline_year: Optional[int] = None
    capped_by_confidence: bool
    explanation: str
    drivers: dict[str, Any] = Field(default_factory=dict)
    factors: list[FactorOut] = Field(default_factory=list)


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    limit: int
    offset: int
    has_next: bool


# --------------------------------------------------------------------------- #
# Risk summary / simulation
# --------------------------------------------------------------------------- #
class BandCount(BaseModel):
    band: str
    count: int


class FamilyCount(BaseModel):
    family: str
    count: int


class EvidenceClassCount(BaseModel):
    evidence_class: str
    count: int


class TrackBreakdown(BaseModel):
    classical_critical: int
    quantum_critical: int
    post_quantum_adopted: int
    quantum_vulnerable_assets: int
    unobserved_surfaces: int


class RiskSummaryOut(BaseModel):
    scan_id: str
    total_findings: int
    total_assets: int
    by_band: list[BandCount]
    by_family: list[FamilyCount]
    by_evidence_class: list[EvidenceClassCount]
    top_risks: list[FindingOut]
    tracks: TrackBreakdown
    mosca: dict[str, Any]
    coverage_index: float
    unobserved_pct: float
    policy_pack_version: str
    generated_at: str


class MoscaSimulateRequest(BaseModel):
    x_years: float = Field(ge=0, le=200)
    y_years: float = Field(ge=0, le=200)
    z_years: float = Field(ge=0, le=200)
    scope: Literal["all", "band:critical", "band:high", "band:medium"] = "all"


class MoscaSimulateResponse(BaseModel):
    """Same Mosca vocabulary as `risk/summary.mosca` (`state`, `holds`, `margin_years`),
    plus the what-if specifics. One vocabulary across the API: the console renders
    both from the same component."""
    x_years: float
    y_years: float
    z_years: float
    x_plus_y: float
    state: Literal["breached", "borderline", "safe"]
    holds: bool
    margin_years: float
    must_start_by: str
    affected_findings: int
    affected_assets: int
    by_band: dict[str, int]
    affected_file_paths: list[str]
    narrative: str


# --------------------------------------------------------------------------- #
# Recommendations / migration
# --------------------------------------------------------------------------- #
class RecommendationOut(ORMModel):
    id: str
    current_asset_id: str
    target_standard: str
    target_algorithm: str
    target_parameter_set: Optional[str] = None
    deployment_mode: str
    effort_score: int
    effort_rationale: str
    tradeoff: str
    blocked_reason: Optional[str] = None
    priority: int


class MigrationItemOut(ORMModel):
    id: str
    scan_id: str
    recommendation_id: str
    title: str
    owner: Optional[str] = None
    wave: int
    status: str
    urgency_score: int
    effort_score: int
    target_standard: str
    due_by: Optional[str] = None
    notes: Optional[str] = None
    updated_at: Optional[str] = None


class MigrationItemUpdate(BaseModel):
    status: Optional[Literal["backlog", "ready", "in_progress", "blocked", "done"]] = None
    owner: Optional[str] = Field(default=None, max_length=255)
    wave: Optional[int] = Field(default=None, ge=1, le=20)
    notes: Optional[str] = Field(default=None, max_length=4000)


# --------------------------------------------------------------------------- #
# Data assets (Mosca X) / scenarios
# --------------------------------------------------------------------------- #
class DataAssetCreate(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    classification: Literal["top_secret", "secret", "confidential", "internal", "public"] = "internal"
    confidentiality_lifetime_years: float = Field(default=10.0, ge=0, le=200)
    lifetime_basis: str = Field(default="assumption: no owner declared", max_length=255)
    regulatory_ref: Optional[str] = Field(default=None, max_length=255)
    owner: Optional[str] = Field(default=None, max_length=255)


class DataAssetOut(ORMModel):
    id: str
    name: str
    classification: str
    confidentiality_lifetime_years: float
    lifetime_basis: str
    regulatory_ref: Optional[str] = None
    owner: Optional[str] = None


class ProtectionCreate(BaseModel):
    crypto_asset_id: str
    role: Literal["primary", "secondary", "unknown"] = "primary"


class ScenarioCreate(BaseModel):
    name: str = Field(min_length=2, max_length=128)
    x_years: float = Field(ge=0, le=200)
    y_years: float = Field(ge=0, le=200)
    z_years: float = Field(ge=0, le=200)
    horizon_label: str = Field(default="", max_length=64)
    source_citation: str = Field(default="", max_length=512)
    is_default: bool = False


class ScenarioOut(ORMModel):
    id: str
    name: str
    x_years: float
    y_years: float
    z_years: float
    horizon_label: str
    source_citation: str
    is_default: bool


# --------------------------------------------------------------------------- #
# Diff / exports / attestation
# --------------------------------------------------------------------------- #
class DiffOut(BaseModel):
    from_scan_id: str
    to_scan_id: str
    added: list[str]
    removed: list[str]
    unchanged: int
    risk_delta: int
    band_moves: list[dict[str, str]]
    coverage_delta: float
    summary: str


class AttestationCreate(BaseModel):
    officer_name: str = Field(min_length=2, max_length=255)
    officer_role: str = Field(default="assessing officer", max_length=255)
    declaration: str = Field(default="", max_length=4000)
    include_tpm: bool = True


class AttestationOut(ORMModel):
    id: str
    scan_id: str
    schema_version: str
    officer_name: str
    officer_role: str
    declaration: str
    merkle_root: str
    leaf_count: int
    ledger_head: str
    signature_alg: str
    signature_b64: str
    public_key_b64: str
    key_origin: str
    dossier: dict[str, Any] = Field(default_factory=dict)
    created_at: Optional[str] = None


class VerifyOut(BaseModel):
    scan_id: str
    merkle_root_matches: bool
    ledger_chain_valid: bool
    signature_valid: bool
    leaf_count: int
    recomputed_root: str
    stored_root: str
    verdict: Literal["authentic", "tampered", "incomplete"]
    checked_at: str


FindingOut.model_rebuild()
