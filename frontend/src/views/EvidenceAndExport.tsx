import React, { useEffect, useState, useCallback } from 'react';
import { useScan } from '../context/ScanContext';
import { ecdatApi } from '../api/endpoints';
import { CoverageOut, AttestationOut, VerifyOut } from '../types/api';
import {
  Download,
  ShieldCheck,
  FileCheck2,
  FileText,
  FileSpreadsheet,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Lock,
  Layers,
  Fingerprint,
  KeyRound,
  ShieldAlert,
} from 'lucide-react';

export const EvidenceAndExport: React.FC = () => {
  const { activeScanId, activeScan } = useScan();

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

  // Export bounds. Both numbers are *fetched*: the cap is a per-deployment
  // setting, and the count is this scan's real total. A button that cannot
  // succeed should look disabled, not fail with a 413 after the user commits
  // to the click.
  const [exportCap, setExportCap] = useState<number | null>(null);
  const [findingTotal, setFindingTotal] = useState<number | null>(null);

  useEffect(() => {
    ecdatApi.getVersion()
      .then((r) => setExportCap(r.data.export_max_findings ?? null))
      .catch(() => setExportCap(null));
  }, []);

  useEffect(() => {
    if (!activeScanId) { setFindingTotal(null); return; }
    ecdatApi.listFindings(activeScanId, { limit: 1 })
      .then((r) => setFindingTotal(r.data.total))
      .catch(() => setFindingTotal(null));
  }, [activeScanId]);

  const overCap = exportCap != null && findingTotal != null && findingTotal > exportCap;

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

  const handleVerify = async () => {
    if (!attestation) return;
    setVerifying(true);
    try {
      const res = await ecdatApi.verifyAttestation(attestation.id);
      setVerification(res.data);
    } catch (err: any) {
      alert(`Verification failed: ${err.message}`);
    } finally {
      setVerifying(false);
    }
  };

  const handleExport = async (type: 'cbom' | 'sarif' | 'report' | 'findings.csv', specVersion?: '1.6' | '1.7') => {
    if (overCap) return;
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
        <Layers className="w-12 h-12 text-slate-500 mx-auto" />
        <h2 className="text-xl font-bold font-mono text-slate-200">No Scan Selected</h2>
        <p className="text-sm text-slate-400 font-mono">
          Select or launch a scan to review coverage ledger, export CBOM/SARIF, and generate forensic attestations.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8 font-mono">
      {/* Title */}
      <div className="border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2">
          <Fingerprint className="w-6 h-6 text-cyan-400" />
          <h1 className="text-2xl font-bold text-slate-100">
            Evidence Ledger, Attestation & Forensic Exports
          </h1>
        </div>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Deterministic CycloneDX CBOM, SARIF 2.1.0, audit reports, and Ed25519-signed Merkle forensic dossier
        </p>
      </div>

      {/* Export Section Cards */}
      <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
            <Download className="w-4 h-4 text-cyan-400" />
            1. Standardized Export Pipelines
          </h3>
          <span className="text-xs text-slate-500">Byte-reproducible outputs</span>
        </div>

        {/* Bounds. Stated before the buttons, not discovered through a 413. */}
        <div
          className={`rounded-lg border p-3.5 font-mono text-[11px] ${
            overCap
              ? 'border-rose-500/40 bg-rose-950/20 text-rose-300'
              : 'border-slate-800 bg-slate-950/50 text-slate-400'
          }`}
        >
          {findingTotal == null ? (
            <span>Counting findings in this scan…</span>
          ) : overCap ? (
            <span>
              This scan has <strong className="text-rose-200">{findingTotal.toLocaleString()}</strong> findings.
              The synchronous exporter on this deployment is bounded at{' '}
              <strong className="text-rose-200">{(exportCap || 0).toLocaleString()}</strong>, so these
              exports are unavailable — the server would reject them with 413 EXPORT_TOO_LARGE. Narrow the
              findings by filter and export a subset, or raise ECDAT_EXPORT_MAX_FINDINGS and run the export
              off the request path.
            </span>
          ) : (
            <span>
              This scan has <strong className="text-slate-200">{findingTotal.toLocaleString()}</strong>{' '}
              findings, within the exporter bound of{' '}
              <strong className="text-slate-200">{(exportCap || 0).toLocaleString()}</strong> for this
              deployment. Exports contain the full scan, not a filtered view.
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* CBOM v1.7 */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-200">CycloneDX CBOM</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-500/40">
                  v1.7
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-sans mt-1">
                Cryptographic Bill of Materials with full asset algorithm & certificate metadata.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleExport('cbom', '1.7')}
                disabled={exportingType === 'cbom1.7' || overCap}
                className="flex-1 py-1.5 px-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{exportingType === 'cbom1.7' ? 'Exporting...' : 'CBOM 1.7'}</span>
              </button>
              <button
                onClick={() => handleExport('cbom', '1.6')}
                disabled={exportingType === 'cbom1.6' || overCap}
                className="py-1.5 px-2.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 text-xs hover:bg-slate-700 transition"
                title="Download CBOM 1.6"
              >
                1.6
              </button>
            </div>
          </div>

          {/* SARIF 2.1.0 */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-200">SARIF Interop</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-400 border border-indigo-500/40">
                  v2.1.0
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-sans mt-1">
                Static Analysis Results Interchange Format for GitHub / GitLab Code Scanning.
              </p>
            </div>
            <button
              onClick={() => handleExport('sarif')}
              disabled={exportingType === 'sarif' || overCap}
              className="w-full py-1.5 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{exportingType === 'sarif' ? 'Exporting...' : 'Download SARIF'}</span>
            </button>
          </div>

          {/* Markdown Security Audit */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-200">Security Report</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-500/40">
                  Markdown
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-sans mt-1">
                Executive & compliance briefing report ready for institutional submission.
              </p>
            </div>
            <button
              onClick={() => handleExport('report')}
              disabled={exportingType === 'report' || overCap}
              className="w-full py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition disabled:opacity-50"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{exportingType === 'report' ? 'Exporting...' : 'Download Report'}</span>
            </button>
          </div>

          {/* CSV Findings Export */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-200">CSV Spreadsheet</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-500/40">
                  CSV
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-sans mt-1">
                Raw flat finding rows, risk bands, confidence, and line numbers for analysis.
              </p>
            </div>
            <button
              onClick={() => handleExport('findings.csv')}
              disabled={exportingType === 'findings.csv' || overCap}
              className="w-full py-1.5 px-3 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition disabled:opacity-50"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>{exportingType === 'findings.csv' ? 'Exporting...' : 'Download CSV'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Forensic Attestation & Verification (Merkle Root + Ed25519) */}
      <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-emerald-400" />
              2. Forensic Attestation & Cryptographic Verification
            </h3>
            <p className="text-xs text-slate-400 font-sans mt-0.5">
              Signs all scan finding digests into a sorted Merkle tree with a SHA-256 hash-chain ledger.
            </p>
          </div>

          {/* Rule 6.6 Notice */}
          <div className="px-2.5 py-1 rounded bg-amber-950/40 border border-amber-500/40 text-amber-300 text-[11px] flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-amber-400" />
            <span>Key Origin: Ephemeral Demo (Rule 6.6)</span>
          </div>
        </div>

        {/* Creation Form */}
        <form onSubmit={handleCreateAttestation} className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-400 mb-1">Attesting Officer Name:</label>
              <input
                type="text"
                required
                value={officerName}
                onChange={(e) => setOfficerName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Officer Role / Designation:</label>
              <input
                type="text"
                required
                value={officerRole}
                onChange={(e) => setOfficerRole(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-400 mb-1">Formal Declaration:</label>
            <input
              type="text"
              required
              value={declaration}
              onChange={(e) => setDeclaration(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={creatingAttestation}
              className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold flex items-center gap-2 transition disabled:opacity-50"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{creatingAttestation ? 'Generating Merkle Attestation...' : 'Attest & Verify Scan'}</span>
            </button>
          </div>
        </form>

        {/* Verification Result Card */}
        {attestation && (
          <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-emerald-400" />
                <span className="font-bold text-slate-200">
                  Signed Attestation Record ({attestation.id})
                </span>
              </div>

              {verification && (
                <div
                  className={`px-3 py-1 rounded font-bold uppercase text-xs border ${
                    verification.verdict === 'authentic'
                      ? 'bg-emerald-950/70 border-emerald-500/50 text-emerald-400'
                      : 'bg-rose-950/70 border-rose-500/50 text-rose-400'
                  }`}
                >
                  Verdict: {verification.verdict}
                </div>
              )}
            </div>

            {attestation.key_origin === 'ephemeral_demo' && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-950/40 border border-amber-500/40 text-amber-200 text-xs">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-400" />
                <div>
                  <span className="font-bold">Demonstration key.</span>{' '}
                  This dossier was signed with a throwaway key generated at scan time
                  (<span className="font-mono">{attestation.key_origin}</span>). It proves the
                  evidence has not been altered since signing; it is <em>not</em> an operator
                  signature and proves nothing about who performed the assessment. Configure a
                  real signing key before presenting this as an official record.
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="space-y-1">
                <span className="text-slate-500">
                  Merkle Root (Sorted {attestation.leaf_count}-Leaf):
                </span>
                <div className="p-2 rounded bg-slate-900 border border-slate-800/80 text-cyan-300 break-all select-all">
                  {attestation.merkle_root}
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-slate-500">Ledger Chain Head:</span>
                <div className="p-2 rounded bg-slate-900 border border-slate-800/80 text-cyan-300 break-all select-all">
                  {attestation.ledger_head}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1">
              <div>
                <span className="text-slate-500 block">Leaves:</span>
                <span className="font-bold text-slate-200">{attestation.leaf_count} findings</span>
              </div>
              <div>
                <span className="text-slate-500 block">Signature Alg:</span>
                <span className="font-bold text-slate-200">{attestation.signature_alg}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Chain Valid:</span>
                <span className="font-bold text-emerald-400">
                  {verification?.ledger_chain_valid ? 'True' : 'Checking...'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Signature Valid:</span>
                <span className="font-bold text-emerald-400">
                  {verification?.signature_valid ? 'True' : 'Checking...'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Full Coverage Honesty Breakdown */}
      {coverage && (
        <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              3. Full Coverage Accounting Ledger (Rule 6.1 & 6.4)
            </h3>
            <span className="text-xs text-cyan-400 font-bold">
              Coverage: {coverage.coverage_index.toFixed(3)}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
              <span className="text-slate-400">Observed Surfaces:</span>
              <div className="text-xl font-bold text-emerald-400 mt-1">
                {coverage.counts.observed || 0}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
              <span className="text-slate-400">Partial Surfaces:</span>
              <div className="text-xl font-bold text-amber-400 mt-1">
                {coverage.counts.partial || 0}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
              <span className="text-slate-400">Unsupported Surfaces:</span>
              <div className="text-xl font-bold text-slate-400 mt-1">
                {coverage.counts.unsupported || 0}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
              <span className="text-slate-400">Unobserved Percentage:</span>
              <div className="text-xl font-bold text-rose-400 mt-1">
                {coverage.unobserved_pct}%
              </div>
            </div>
          </div>

          {/* Breakdown by Kind */}
          <div className="mt-4">
            <span className="text-xs text-slate-400 uppercase tracking-wider block mb-2 font-semibold">
              Surfaces Enumerated by Detector Kind:
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
              {Object.entries(coverage.by_kind || {}).map(([kind, stats]) => (
                <div key={kind} className="p-2.5 rounded bg-slate-950 border border-slate-800/80">
                  <span className="text-slate-400 font-bold uppercase text-[11px] block">{kind}</span>
                  <div className="text-slate-200 mt-1">
                    {stats.observed ? (
                      <span className="text-emerald-400 font-bold">{stats.observed} observed</span>
                    ) : (
                      <span className="text-amber-400 font-bold">
                        {stats.unsupported || stats.partial || 0} unobserved
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
