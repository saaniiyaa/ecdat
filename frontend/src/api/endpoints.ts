import {
  apiRequest,
  ApiResponse,
  getBaseUrl,
  getApiKey,
} from './client';
import {
  HealthOut,
  WorkspaceOut,
  WorkspaceCreate,
  ScanOut,
  ScanCreate,
  ScanEventOut,
  CoverageOut,
  FindingOut,
  Page,
  RiskSummaryOut,
  MoscaSimulateRequest,
  MoscaSimulateResponse,
  RecommendationOut,
  MigrationItemOut,
  MigrationItemUpdate,
  CertificateOut,
  AttestationCreate,
  AttestationOut,
  VerifyOut,
  RegistryOut,
  ScanDiffResult,
  AccuracyReport,
  VersionOut,
} from '../types/api';

export const ecdatApi = {
  // Meta
  getHealth: () => apiRequest<HealthOut>('/health'),
  getVersion: () => apiRequest<VersionOut>('/version'),
  getRegistry: () => apiRequest<RegistryOut>('/registry'),
  // Measured detector accuracy, served from docs/accuracy_report.json.
  // Fetched, never hardcoded: a number typed into a component is a number that
  // will eventually contradict the tool it claims to describe.
  getAccuracy: () => apiRequest<AccuracyReport>('/accuracy'),

  // Workspaces
  listWorkspaces: () => apiRequest<WorkspaceOut[]>('/workspaces'),
  createWorkspace: (data: WorkspaceCreate) =>
    apiRequest<WorkspaceOut>('/workspaces', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Scans
  listScans: (workspaceId?: string, limit = 50) =>
    apiRequest<ScanOut[]>('/scans', {
      params: { workspace_id: workspaceId, limit },
    }),
  getScan: (scanId: string) => apiRequest<ScanOut>(`/scans/${scanId}`),
  createScan: (data: ScanCreate, waitSeconds = 0) =>
    apiRequest<ScanOut>('/scans', {
      method: 'POST',
      params: { wait_seconds: waitSeconds },
      body: JSON.stringify(data),
    }),
  cancelScan: (scanId: string) =>
    apiRequest<any>(`/scans/${scanId}/cancel`, { method: 'POST' }),
  retryScan: (scanId: string) =>
    apiRequest<ScanOut>(`/scans/${scanId}/retry`, { method: 'POST' }),
  getScanEvents: (scanId: string, since = 0) =>
    apiRequest<ScanEventOut[]>(`/scans/${scanId}/events`, {
      params: { since },
    }),
  getScanCoverage: (scanId: string) =>
    apiRequest<CoverageOut>(`/scans/${scanId}/coverage`),
  getScanSurfaces: (scanId: string, params: { observation_state?: string; surface_kind?: string; limit?: number; offset?: number } = {}) =>
    apiRequest<Page<any>>(`/scans/${scanId}/surfaces`, { params }),

  // Target Upload
  uploadTarget: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiRequest<{ path: string; name: string; kind: string; sha256: string }>('/uploads', {
      method: 'POST',
      body: formData,
    });
  },

  // Findings
  listFindings: (
    scanId: string,
    params: {
      band?: string;
      quantum_status?: string;
      evidence_class?: string;
      purpose?: string;
      file_path?: string;
      search?: string;
      sort?: 'risk' | 'urgency' | 'path' | 'confidence';
      order?: 'asc' | 'desc';
      limit?: number;
      offset?: number;
    } = {}
  ) => apiRequest<Page<FindingOut>>(`/scans/${scanId}/findings`, { params }),

  getFinding: (scanId: string, findingId: string) =>
    apiRequest<FindingOut>(`/scans/${scanId}/findings/${findingId}`),

  // Risk & Mosca
  getRiskSummary: (scanId: string) =>
    apiRequest<RiskSummaryOut>(`/scans/${scanId}/risk/summary`),
  simulateMosca: (scanId: string, data: MoscaSimulateRequest) =>
    apiRequest<MoscaSimulateResponse>(`/scans/${scanId}/risk/simulate`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Recommendations & Migration
  listRecommendations: (scanId: string, limit = 100, offset = 0) =>
    apiRequest<Page<RecommendationOut>>(`/scans/${scanId}/recommendations`, {
      params: { limit, offset },
    }),
  listMigrationItems: (scanId?: string, limit = 100, offset = 0) =>
    apiRequest<Page<MigrationItemOut>>('/migration/items', {
      params: { scan_id: scanId, limit, offset },
    }),
  updateMigrationItem: (itemId: string, data: MigrationItemUpdate) =>
    apiRequest<MigrationItemOut>(`/migration/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // Certificates & Data Exposure
  getCertificates: (scanId: string) =>
    apiRequest<CertificateOut[]>(`/scans/${scanId}/certificates`),
  getDataExposure: (scanId: string) =>
    apiRequest<any>(`/scans/${scanId}/data-exposure`),

  // Diff
  getScanDiff: (scanId: string, againstScanId: string) =>
    apiRequest<ScanDiffResult>(`/scans/${scanId}/diff`, {
      params: { against_scan_id: againstScanId },
    }),

  // Attestations
  createAttestation: (scanId: string, data: AttestationCreate) =>
    apiRequest<AttestationOut>(`/scans/${scanId}/attestation`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  verifyAttestation: (attestationId: string) =>
    apiRequest<VerifyOut>(`/attestations/${attestationId}/verify`),

  // Exports URLs and Downloaders
  getExportUrl: (scanId: string, type: 'cbom' | 'sarif' | 'report' | 'findings.csv', specVersion?: '1.6' | '1.7') => {
    let url = `${getBaseUrl()}/scans/${scanId}/exports/${type}`;
    if (type === 'cbom' && specVersion) {
      url += `?spec_version=${specVersion}`;
    }
    return url;
  },

  downloadExport: async (scanId: string, type: 'cbom' | 'sarif' | 'report' | 'findings.csv', specVersion?: '1.6' | '1.7') => {
    const url = ecdatApi.getExportUrl(scanId, type, specVersion);
    const resp = await fetch(url, {
      headers: {
        'X-API-Key': getApiKey(),
      },
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `Export failed with status ${resp.status}`);
    }
    const blob = await resp.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    const ext = type === 'cbom' || type === 'sarif' ? 'json' : type === 'report' ? 'md' : 'csv';
    a.download = `ecdat-${scanId.substring(0, 8)}-${type}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(downloadUrl);
  }
};
