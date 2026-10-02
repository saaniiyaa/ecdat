import React, { useEffect, useState, useCallback } from 'react';
import { useScan } from '../context/ScanContext';
import { ecdatApi } from '../api/endpoints';
import { CoverageOut, AttestationOut, VerifyOut } from '../types/api';
import { HelpTooltip } from '../components/common/HelpTooltip';
import {
  Download,
  ShieldCheck,
  FileText,
  FileSpreadsheet,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Lock,
  Layers,
  Fingerprint,
  KeyRound,
  FileCheck2,
} from 'lucide-react';

export const EvidenceAndExport: React.FC = () => {
  const { activeScanId } = useScan();

  const [coverage, setCoverage] = useState<CoverageOut | null>(null);
  const [loadingCoverage, setLoadingCoverage] = useState(true);

  // Attestation State
  const [officerName, setOfficerName] = useState('A. Sharma');
  const [officerRole, setOfficerRole] = useState('Principal Cryptographer');
  const [declaration, setDeclaration] = useState('Official ECDAT forensic verification for NTRO PS 26164');
  const [attestation, setAttestation] = useState<AttestationOut | null>(null);
  const [creatingAttestation, setCreatingAttestation] = useState(false);
  const [verification, setVerification] = useState<VerifyOut | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [attestationError, setAttestationError] = useState<string | null>(null);

  // Export Loading States
  const [exportingType, setExportingType] = useState<string | null>(null);

  const loadCoverage = useCallback(async () => {
    if (!activeScanId) return;
    setLoadingCoverage(true);
    try {
      const res = await ecdatApi.getScanCoverage(activeScanId);
      setCoverage(res.data);
    } catch {
      // ignore
    } finally {
      setLoadingCoverage(false);
    }
  }, [activeScanId]);

  useEffect(() => {
    loadCoverage();
  }, [loadCoverage]);

  const handleCreateAttestation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeScanId) return;

    setCreatingAttestation(true);
    setAttestationError(null);
    setVerification(null);
    try {
      const res = await ecdatApi.createAttestation(activeScanId, {
        officer_name: officerName.trim(),
        officer_role: officerRole.trim(),
        declaration: declaration.trim(),
      });
      setAttestation(res.data);

      // Immediately verify the created attestation to show authentic proof
      const verRes = await ecdatApi.verifyAttestation(res.data.id);
      setVerification(verRes.data);
    } catch (err: any) {
      setAttestationError(err.message || 'Failed to create forensic attestation');
    } finally {
      setCreatingAttestation(false);
    }
  };

  const handleExport = async (type: 'cbom' | 'sarif' | 'report' | 'findings.csv', specVersion?: '1.6' | '1.7') => {
    if (!activeScanId) return;
    setExportingType(type + (specVersion || ''));
    try {
      await ecdatApi.downloadExport(activeScanId, type, specVersion);
    } catch (err: any) {
      alert(`Export error: ${err.message}`);
    } finally {
      setExportingType(null);
    }
  };

  if (!activeScanId) {
    return (
      <div className="max-w-4xl mx-auto p-12 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-surface-2 border border-border flex items-center justify-center mx-auto text-accent shadow-card">
          <Fingerprint className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-text-main">No Scan Target Selected</h2>
        <p className="text-sm text-text-muted">
          Select or launch a scan to review coverage ledger, export CBOM/SARIF, and generate forensic attestations.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8 animate-in fade-in duration-200">
      {/* Title */}
      <div className="border-b border-border pb-5">
        <div className="flex items-center gap-2.5">
          <Fingerprint className="w-6 h-6 text-accent" />
          <h1 className="text-2xl font-bold text-text-main tracking-tight">
            Evidence Ledger, Attestation & Forensic Exports
          </h1>
          <HelpTooltip
            title="Cryptographic Dossier & Attestation"
            content="Generates byte-reproducible CycloneDX CBOMs, SARIF reports, and Ed25519-signed Merkle trees proving finding authenticity without tampering."
          />
        </div>
        <p className="text-xs sm:text-sm text-text-muted mt-1">
          Deterministic CycloneDX CBOM, SARIF 2.1.0, audit reports, and Ed25519-signed Merkle forensic dossier.
        </p>
      </div>

      {/* Export Section Cards */}
      <div className="p-6 rounded-card bg-surface border border-border shadow-card space-y-5">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-text-main flex items-center gap-2">
            <Download className="w-4 h-4 text-accent" />
            1. Standardized Export Pipelines
          </h2>
          <span className="text-xs text-text-dim font-mono font-semibold">Byte-reproducible outputs</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* CBOM v1.7 */}
          <div className="p-5 rounded-card bg-surface-2 border border-border shadow-sm flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-text-main">CycloneDX CBOM</span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-accent-subtle text-accent border border-accent-border font-mono">
                  v1.7 / v1.6
                </span>
              </div>
              <p className="text-xs text-text-muted mt-2 leading-relaxed">
                Cryptographic Bill of Materials with full asset algorithm & certificate metadata.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleExport('cbom', '1.7')}
                disabled={exportingType === 'cbom1.7'}
                className="flex-1 py-2.5 px-3 rounded-xl bg-accent hover:bg-accent-hover text-bg font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition disabled:opacity-50 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{exportingType === 'cbom1.7' ? 'Exporting...' : 'CBOM 1.7'}</span>
              </button>
              <button
                onClick={() => handleExport('cbom', '1.6')}
                disabled={exportingType === 'cbom1.6'}
                className="py-2.5 px-3 rounded-xl border border-border bg-surface text-text-main text-xs hover:bg-surface-3 transition font-semibold cursor-pointer"
                title="Download CBOM 1.6"
              >
                1.6
              </button>
            </div>
          </div>

          {/* SARIF 2.1.0 */}
          <div className="p-5 rounded-card bg-surface-2 border border-border shadow-sm flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-text-main">SARIF Interop</span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-accent-2-subtle text-accent-2 border border-accent-2-border font-mono">
                  v2.1.0
                </span>
              </div>
              <p className="text-xs text-text-muted mt-2 leading-relaxed">
                Static Analysis Results Interchange Format for GitHub / GitLab Code Scanning.
              </p>
            </div>
            <button
              onClick={() => handleExport('sarif')}
              disabled={exportingType === 'sarif'}
              className="w-full py-2.5 px-3 rounded-xl bg-accent-2 hover:bg-accent-2-hover text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition disabled:opacity-50 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{exportingType === 'sarif' ? 'Exporting...' : 'Download SARIF'}</span>
            </button>
          </div>

          {/* Markdown Security Audit */}
          <div className="p-5 rounded-card bg-surface-2 border border-border shadow-sm flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-text-main">Security Briefing</span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-accent-subtle text-accent border border-accent-border font-mono">
                  Markdown
                </span>
              </div>
              <p className="text-xs text-text-muted mt-2 leading-relaxed">
                Executive & compliance audit report ready for institutional submission.
              </p>
            </div>
            <button
              onClick={() => handleExport('report')}
              disabled={exportingType === 'report'}
              className="w-full py-2.5 px-3 rounded-xl bg-accent hover:bg-accent-hover text-bg font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition disabled:opacity-50 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{exportingType === 'report' ? 'Exporting...' : 'Download Report'}</span>
            </button>
          </div>

          {/* CSV Findings Export */}
          <div className="p-5 rounded-card bg-surface-2 border border-border shadow-sm flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-text-main">CSV Spreadsheet</span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-warning-subtle text-warning border border-warning-border font-mono">
                  CSV
                </span>
              </div>
              <p className="text-xs text-text-muted mt-2 leading-relaxed">
                Raw flat finding rows, risk bands, confidence, and line numbers for analysis.
              </p>
            </div>
            <button
              onClick={() => handleExport('findings.csv')}
              disabled={exportingType === 'findings.csv'}
              className="w-full py-2.5 px-3 rounded-xl bg-surface border border-border hover:bg-surface-3 text-text-main font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition disabled:opacity-50 cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-warning" />
              <span>{exportingType === 'findings.csv' ? 'Exporting...' : 'Download CSV'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Forensic Attestation & Verification (Merkle Root + Ed25519) */}
      <div className="p-6 rounded-card bg-surface border border-border shadow-card space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-text-main flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-accent" />
              2. Forensic Attestation & Cryptographic Verification
            </h2>
            <p className="text-xs text-text-muted mt-0.5">
              Signs all scan finding digests into a sorted Merkle tree with a SHA-256 hash-chain ledger.
            </p>
          </div>

          {/* Rule 6.6 Notice */}
          <div className="px-3 py-1 rounded-full bg-warning-subtle border border-warning-border text-warning text-xs font-semibold flex items-center gap-1.5 self-start sm:self-auto">
            <Lock className="w-3.5 h-3.5" />
            <span>Key Origin: Ephemeral Demo (Rule 6.6)</span>
          </div>
        </div>

        {/* Creation Form */}
        <form onSubmit={handleCreateAttestation} className="p-5 rounded-xl bg-surface-2 border border-border space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-text-muted font-bold mb-1.5">Attesting Officer Name:</label>
              <input
                type="text"
                required
                value={officerName}
                onChange={(e) => setOfficerName(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-surface border border-border text-text-main font-semibold focus:outline-none focus:border-accent transition"
              />
            </div>

            <div>
              <label className="block text-text-muted font-bold mb-1.5">Officer Role / Designation:</label>
              <input
                type="text"
                required
                value={officerRole}
                onChange={(e) => setOfficerRole(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-surface border border-border text-text-main font-semibold focus:outline-none focus:border-accent transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-text-muted font-bold mb-1.5">Formal Declaration:</label>
            <input
              type="text"
              required
              value={declaration}
              onChange={(e) => setDeclaration(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-surface border border-border text-text-main font-semibold focus:outline-none focus:border-accent transition"
            />
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={creatingAttestation}
              className="px-5 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-bg font-bold text-xs flex items-center gap-2 shadow-sm transition disabled:opacity-50 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{creatingAttestation ? 'Generating Merkle Attestation...' : 'Attest & Verify Scan'}</span>
            </button>
          </div>
        </form>

        {/* Verification Result Card */}
        {attestation && (
          <div className="p-5 rounded-xl bg-surface-2 border border-border space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-accent" />
                <span className="font-bold text-text-main text-sm">
                  Signed Attestation Record ({attestation.id})
                </span>
              </div>

              {verification && (
                <div
                  className={`px-3 py-1 rounded-full font-bold uppercase text-xs border ${
                    verification.verdict === 'authentic'
                      ? 'bg-accent-subtle border-accent-border text-accent'
                      : 'bg-danger-subtle border-danger-border text-danger'
                  }`}
                >
                  Verdict: {verification.verdict}
                </div>
              )}
            </div>

            {attestation.key_origin === 'ephemeral_demo' && (
              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-warning-subtle border border-warning-border text-warning text-xs">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <div className="leading-relaxed">
                  <strong>Demonstration key notice.</strong> This dossier was signed with a throwaway key generated at scan time ({attestation.key_origin}). It cryptographically proves the evidence has not been altered since signing.
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
              <div className="space-y-1">
                <span className="text-text-dim">
                  Merkle Root (Sorted {attestation.leaf_count}-Leaf):
                </span>
                <div className="p-2.5 rounded-lg bg-surface border border-border text-accent break-all select-all font-semibold">
                  {attestation.merkle_root}
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-text-dim">Ledger Chain Head:</span>
                <div className="p-2.5 rounded-lg bg-surface border border-border text-accent-2 break-all select-all font-semibold">
                  {attestation.ledger_head}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1">
              <div>
                <span className="text-text-dim block">Leaves:</span>
                <span className="font-bold font-mono text-text-main">{attestation.leaf_count} findings</span>
              </div>
              <div>
                <span className="text-text-dim block">Signature Alg:</span>
                <span className="font-bold font-mono text-text-main">{attestation.signature_alg}</span>
              </div>
              <div>
                <span className="text-text-dim block">Chain Valid:</span>
                <span className="font-bold font-mono text-accent">
                  {verification?.ledger_chain_valid ? 'True (SHA-256)' : 'Checking...'}
                </span>
              </div>
              <div>
                <span className="text-text-dim block">Signature Valid:</span>
                <span className="font-bold font-mono text-accent">
                  {verification?.signature_valid ? 'True (Ed25519)' : 'Checking...'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Full Coverage Honesty Breakdown */}
      {coverage && (
        <div className="p-6 rounded-card bg-surface border border-border shadow-card space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-text-main flex items-center gap-2">
              <Layers className="w-4 h-4 text-accent" />
              3. Full Coverage Accounting Ledger (Rule 6.1 & 6.4)
            </h2>
            <span className="text-xs text-accent font-bold font-mono">
              Coverage: {coverage.coverage_index.toFixed(3)}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
            <div className="p-3.5 rounded-xl bg-surface-2 border border-border">
              <span className="text-text-dim font-sans font-semibold">Observed Surfaces:</span>
              <div className="text-xl font-bold text-accent mt-1">
                {coverage.counts.observed || 0}
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-surface-2 border border-border">
              <span className="text-text-dim font-sans font-semibold">Partial Surfaces:</span>
              <div className="text-xl font-bold text-warning mt-1">
                {coverage.counts.partial || 0}
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-surface-2 border border-border">
              <span className="text-text-dim font-sans font-semibold">Unsupported Surfaces:</span>
              <div className="text-xl font-bold text-text-muted mt-1">
                {coverage.counts.unsupported || 0}
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-surface-2 border border-border">
              <span className="text-text-dim font-sans font-semibold">Unobserved Percentage:</span>
              <div className="text-xl font-bold text-danger mt-1">
                {coverage.unobserved_pct}%
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
