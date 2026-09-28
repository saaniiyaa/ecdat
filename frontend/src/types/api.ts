// ECDAT Frozen OpenAPI 3.1 Contract Types
// Generated from openapi.json - do not diverge from server-side definitions

export type Band = 'critical' | 'high' | 'medium' | 'low' | 'informational';

export type EvidenceClass = 'PARSED_STRUCTURE' | 'SYMBOL_INFERRED' | 'INFERRED' | 'PATTERN';

export type QuantumStatus = 'shor_vulnerable' | 'grover_affected' | 'quantum_resistant' | 'post_quantum_standard' | string;

export interface ApiError {
  code:
    | 'BAD_REQUEST'
    | 'UNAUTHORIZED'
    | 'FORBIDDEN'
    | 'NOT_FOUND'
    | 'CONFLICT'
    | 'EXPORT_TOO_LARGE'
    | 'UNSUPPORTED_TARGET'
    | 'INVALID_INPUT'
    | 'RATE_LIMITED'
    | 'SCAN_FAILED'
    | 'UPSTREAM_UNAVAILABLE'
    | string;
  message: string;
  details?: Record<string, any>;
}

export interface ErrorEnvelope {
  error: ApiError;
  timestamp: string;
  request_id?: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  has_next: boolean;
}

export interface HealthOut {
  status: string;
  version: string;
  engine_version: string;
  policy_pack_version: string;
  database: string;
  dialect: string;
  uptime_seconds: number;
  queue_depth: number;
  timestamp: string;
}

export interface WorkspaceCreate {
  name: string;
  slug: string;
  deployment_mode?: string;
}

export interface WorkspaceOut {
  id: string;
  slug: string;
  name: string;
  deployment_mode: string;
  policy_pack_version?: string;
  created_at: string;
}

export interface ScanContext {
  exposure?: 'internet_facing' | 'internal' | 'air_gapped' | string;
  criticality?: 'sovereign_critical' | 'business_critical' | 'standard' | string;
  classification?: 'secret' | 'confidential' | 'restricted' | 'public' | string;
  data_lifetime_years?: number;
  system_name?: string;
}

export interface MoscaInput {
  scenario?: 'baseline' | 'conservative' | 'accelerated' | string;
  x_years?: number;
  y_years?: number;
  z_years?: number;
}

export interface ScanCreate {
  target_uri: string;
  workspace_id?: string;
  target_kind?: 'directory' | 'git' | 'zip' | 'tar' | 'archive' | 'binary' | string;
  name?: string;
  tiers?: string[];
  live_probe?: boolean;
  context?: ScanContext;
  mosca?: MoscaInput;
  policy_pack_version?: string;
}

export interface ScanOut {
  id: string;
  workspace_id?: string | null;
  name: string;
  target_uri: string;
  target_kind: string;
  target_sha256?: string | null;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  phase?: string | null;
  progress_pct: number;
  engine_version: string;
  policy_pack_version: string;
  started_at?: string | null;
  finished_at?: string | null;
  duration_ms?: number | null;
  file_count: number;
  surface_count: number;
  finding_count: number;
  error_code?: string | null;
  error_message?: string | null;
  stats?: Record<string, any>;
  created_at: string;
}

export interface ScanEventOut {
  seq: number;
  phase: string;
  message: string;
  created_at: string;
}

export interface AssetOut {
  id: string;
  canonical_name: string;
  oid?: string | null;
  asset_type?: string | null;
  family?: string | null;
  primitive?: string | null;
  purpose?: string | null;
  key_size_bits?: number | null;
  curve?: string | null;
  mode?: string | null;
  classical_security_bits?: number | null;
  quantum_security_bits?: number | null;
  quantum_status?: string | null;
  is_post_quantum?: boolean;
  nist_deprecated_after?: number | null;
  nist_disallowed_after?: number | null;
  replacement_hint?: string | null;
}

export interface FactorOut {
  seq: number;
  rule_id: string;
  track: 'classical' | 'quantum' | 'context' | 'composite' | string;
  title: string;
  factor_value?: string | number | null;
  delta: number;
  evidence?: string | null;
}

export interface RiskOut {
  id: string;
  classical_risk: number;
  quantum_risk: number;
  composite_risk: number;
  band: Band;
  mosca_state?: 'holds' | 'breached' | string | null;
  mosca_margin_years?: number | null;
  urgency_score: number;
  effort_score: number;
  effective_confidence: number;
  evidence_class: EvidenceClass | string;
  deadline_year?: number | null;
  capped_by_confidence: boolean;
  explanation?: string | null;
  drivers?: Record<string, any>;
  factors: FactorOut[];
}

export interface FindingOut {
  id: string;
  scan_id: string;
  file_path: string;
  line_start?: number | null;
  line_end?: number | null;
  symbol?: string | null;
  detector_id: string;
  evidence_class: EvidenceClass | string;
  confidence: number;
  corroborations?: number;
  snippet_redacted?: string | null;
  source?: string | null;
  asset?: AssetOut | null;
  risk?: RiskOut | null;
}

export interface TrackBreakdown {
  classical_critical: number;
  quantum_critical: number;
  post_quantum_adopted: number;
  quantum_vulnerable_assets: number;
  unobserved_surfaces: number;
}

export interface RiskSummaryOut {
  scan_id: string;
  total_findings: number;
  total_assets: number;
  by_band: Array<{ band: Band; count: number }>;
  by_family: Array<{ family: string; count: number }>;
  by_evidence_class: Array<{ evidence_class: string; count: number }>;
  top_risks: Array<{
    band: Band;
    algorithm: string;
    file: string;
    quantum_risk: number;
    classical_risk?: number;
    composite_risk?: number;
  }>;
  tracks: TrackBreakdown;
  mosca: {
    x_years: number;
    y_years: number;
    z_years: number;
    state: 'holds' | 'breached' | string;
    holds: boolean;
    margin_years: number;
    must_start_by: string;
  };
  coverage_index: number;
  unobserved_pct: number;
  policy_pack_version: string;
  generated_at: string;
}

export interface UnobservedSample {
  path: string;
  kind: string;
  state: 'unsupported' | 'partial' | 'skipped' | string;
  reason: string;
}

export interface CoverageOut {
  scan_id: string;
  coverage_index: number;
  unobserved_pct: number;
  counts: {
    observed: number;
    unsupported?: number;
    partial?: number;
    skipped?: number;
    [key: string]: number | undefined;
  };
  by_kind: Record<string, Record<string, number>>;
  unobserved_samples: UnobservedSample[];
}

export interface MoscaSimulateRequest {
  x_years: number;
  y_years: number;
  z_years: number;
  scope?: string;
}

export interface MoscaSimulateResponse {
  x_years: number;
  y_years: number;
  z_years: number;
  x_plus_y: number;
  state: 'holds' | 'breached';
  holds: boolean;
  margin_years: number;
  must_start_by: string;
  affected_findings: number;
  affected_assets: number;
  by_band: Record<string, number>;
  affected_file_paths: string[];
  narrative: string;
}

export interface RecommendationOut {
  id: string;
  current_asset_id?: string | null;
  canonical_name: string;
  file_path?: string | null;
  band: Band;
  urgency_score: number;
  mosca_state?: string | null;
  target_standard: string;
  target_algorithm: string;
  target_parameter_set?: string | null;
  deployment_mode: string;
  effort_score: number;
  effort_rationale?: string | null;
  tradeoff?: string | null;
  blocked_reason?: string | null;
  priority: number;
}

export interface MigrationItemOut {
  id: string;
  scan_id: string;
  recommendation_id?: string | null;
  title: string;
  owner?: string | null;
  wave: number;
  status: 'backlog' | 'in_progress' | 'verified' | 'blocked' | string;
  urgency_score: number;
  effort_score: number;
  target_standard: string;
  due_by?: string | null;
  notes?: string | null;
  updated_at: string;
}

export interface MigrationItemUpdate {
  status?: string;
  owner?: string;
  wave?: number;
  notes?: string;
}

export interface CertificateOut {
  id: string;
  fingerprint_sha256: string;
  subject: string;
  issuer: string;
  serial_number: string;
  not_before: string;
  not_after: string;
  expired: boolean;
  signature_algorithm: string;
  public_key_algorithm: string;
  public_key_bits: number;
  is_ca: boolean;
  is_self_signed: boolean;
  source_path: string;
}

export interface AttestationCreate {
  officer_name: string;
  officer_role: string;
  declaration?: string;
  include_tpm?: boolean;
}

export interface AttestationOut {
  id: string;
  scan_id: string;
  schema_version: string;
  officer_name: string;
  officer_role: string;
  declaration: string;
  merkle_root: string;
  leaf_count: number;
  ledger_head: string;
  signature_alg: string;
  signature_b64: string;
  public_key_b64: string;
  key_origin: 'ephemeral_demo' | 'tpm_attested' | 'hardware_key' | string;
  dossier: Record<string, any>;
  created_at: string;
}

export interface VerifyOut {
  scan_id: string;
  merkle_root_matches: boolean;
  ledger_chain_valid: boolean;
  signature_valid: boolean;
  leaf_count: number;
  recomputed_root: string;
  stored_root: string;
  verdict: 'authentic' | 'tampered' | string;
  checked_at: string;
}

export interface RegistryAlgorithm {
  canonical_name: string;
  family: string;
  purpose: string;
  oid?: string | null;
  classical_bits?: number;
  quantum_bits?: number;
  quantum_status: string;
  is_post_quantum: boolean;
  nist_deprecated_after?: number | null;
  nist_disallowed_after?: number | null;
  replacement_hint?: string | null;
}

export interface RegistryOut {
  algorithms: RegistryAlgorithm[];
  oids?: Record<string, string>;
  libraries?: Record<string, any>;
  protocol_profiles?: Record<string, any>;
  policy_pack?: Record<string, any>;
}

export interface ScanDiffResult {
  scan_id: string;
  against_scan_id: string;
  findings: {
    added: FindingOut[];
    removed: FindingOut[];
    changed: Array<{ finding_id: string; before: FindingOut; after: FindingOut; diff: string[] }>;
  };
  summary: {
    added_count: number;
    removed_count: number;
    changed_count: number;
    risk_delta: number;
  };
}
