import React, { useEffect, useState } from 'react';
import { FindingOut } from '../../types/api';
import { ecdatApi } from '../../api/endpoints';
import { BandBadge } from '../common/BandBadge';
import { EvidenceBadge } from '../common/EvidenceBadge';
import { QuantumBadge } from '../common/QuantumBadge';
import { FactorBreakdown } from '../common/FactorBreakdown';
import { useRegistry } from '../../context/RegistryContext';
import {
  X,
  FileCode,
  Clock,
  CheckCircle,
  Copy,
  Check,
  ShieldCheck,
  Cpu,
  Layers,
  Terminal,
} from 'lucide-react';

interface FindingDetailDrawerProps {
  scanId: string;
  finding: FindingOut | null;
  onClose: () => void;
}

export const FindingDetailDrawer: React.FC<FindingDetailDrawerProps> = ({
  scanId,
  finding,
  onClose,
}) => {
  const [detail, setDetail] = useState<FindingOut | null>(finding);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const { resolveAlgorithm } = useRegistry();

  useEffect(() => {
    if (!finding) {
      setDetail(null);
      return;
    }

    setDetail(finding);
    // If factors are empty, fetch full detail from server
    if (!finding.risk?.factors || finding.risk.factors.length === 0) {
      setLoading(true);
      ecdatApi
        .getFinding(scanId, finding.id)
        .then((res) => {
          setDetail(res.data);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [scanId, finding]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && finding) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [finding, onClose]);

  if (!finding) return null;

  const activeFinding = detail || finding;
  const asset = activeFinding.asset;
  const risk = activeFinding.risk;
  const regAlg = asset ? resolveAlgorithm(asset.canonical_name) : undefined;

  const handleCopyPath = () => {
    const loc = `${activeFinding.file_path}${
      activeFinding.line_start ? `:${activeFinding.line_start}` : ''
    }`;
    navigator.clipboard.writeText(loc);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-sm flex justify-end animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-white border-l border-slate-300 h-full flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-right duration-250">
        {/* Drawer Header */}
        <div className="p-6 border-b border-slate-200 bg-slate-50 flex items-start justify-between gap-4">
          <div className="space-y-2.5 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {risk && <BandBadge band={risk.band} size="lg" />}
              <EvidenceBadge
                evidenceClass={activeFinding.evidence_class}
                confidence={activeFinding.confidence}
                cappedByConfidence={risk?.capped_by_confidence}
              />
              {asset && (
                <QuantumBadge
                  status={asset.quantum_status}
                  isPostQuantum={asset.is_post_quantum}
                />
              )}
            </div>

            <h2 className="text-xl font-bold text-slate-900 truncate">
              {asset?.canonical_name || activeFinding.symbol || 'Cryptographic Finding'}
            </h2>

            <div className="flex items-center gap-2 text-xs text-slate-600">
              <span className="truncate font-mono font-medium">{activeFinding.file_path}</span>
              {activeFinding.line_start && (
                <span className="text-indigo-700 font-bold font-mono">
                  L{activeFinding.line_start}
                  {activeFinding.line_end ? `–${activeFinding.line_end}` : ''}
                </span>
              )}
              <button
                onClick={handleCopyPath}
                title="Copy file path & line"
                className="p-1 hover:text-indigo-600 transition text-slate-400 rounded"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition cursor-pointer"
            aria-label="Close details"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Rule 6.3: Dual Track Risk Comparison (Classical vs Quantum) */}
          <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 shadow-sm space-y-3.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold uppercase tracking-wider text-slate-700">
                Dual-Track Risk Accounting (Rule 6.3)
              </span>
              <span className="font-mono font-bold text-indigo-700">
                Composite Score: {risk?.composite_risk ?? 0}/100
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Classical Track */}
              <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600 font-semibold">Classical Track</span>
                  <span className="font-mono font-bold text-amber-700">
                    {risk?.classical_risk ?? 0}/100
                  </span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-amber-600 h-2 rounded-full transition-all"
                    style={{ width: `${Math.min(100, risk?.classical_risk ?? 0)}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-500 font-mono">
                  Sec bits: {asset?.classical_security_bits ?? 'N/A'} · NIST deprecated:{' '}
                  {asset?.nist_deprecated_after ?? 'N/A'}
                </p>
              </div>

              {/* Quantum Track */}
              <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600 font-semibold">Quantum Track</span>
                  <span className="font-mono font-bold text-rose-700">
                    {risk?.quantum_risk ?? 0}/100
                  </span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-rose-600 h-2 rounded-full transition-all"
                    style={{ width: `${Math.min(100, risk?.quantum_risk ?? 0)}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-500 font-mono">
                  Sec bits: {asset?.quantum_security_bits ?? 0} · Shor vulnerable:{' '}
                  {asset?.quantum_status === 'shor_vulnerable' ? 'Yes' : 'No'}
                </p>
              </div>
            </div>

            {/* Mosca Inequality Status */}
            {risk?.mosca_state && (
              <div className="p-3 rounded-xl bg-white border border-slate-200 flex items-center justify-between text-xs font-mono">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-indigo-600" />
                  <span className="text-slate-600 font-sans font-semibold">Mosca Status:</span>
                  <span
                    className={`font-bold px-2 py-0.5 rounded-full border ${
                      risk.mosca_state === 'breached'
                        ? 'bg-amber-50 text-amber-900 border-amber-300'
                        : 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    }`}
                  >
                    {risk.mosca_state === 'breached' ? 'Migration Required' : 'Safe Window'}
                  </span>
                </div>
                {risk.mosca_margin_years !== undefined && risk.mosca_margin_years !== null && (
                  <span className="text-slate-500">
                    Margin: <span className="font-bold text-slate-900">{risk.mosca_margin_years}y</span>
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Rule 6.5: Evidence & Snippet (Redacted) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-mono text-slate-500">
              <span className="font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5 font-sans">
                <FileCode className="w-4 h-4 text-indigo-600" />
                Detection Evidence (Rule 6.5)
              </span>
              <span>Detector: {activeFinding.detector_id}</span>
            </div>

            <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-2.5 font-mono text-xs">
              <div className="flex items-center justify-between text-slate-600">
                <span>
                  Location:{' '}
                  <span className="text-slate-900 font-semibold">
                    {activeFinding.file_path}
                    {activeFinding.line_start ? `:${activeFinding.line_start}` : ''}
                  </span>
                </span>
                <span>
                  Source: <span className="text-slate-900 font-semibold">{activeFinding.source || 'file'}</span>
                </span>
              </div>

              {activeFinding.symbol && (
                <div className="text-slate-600">
                  Symbol: <span className="text-indigo-700 font-bold">{activeFinding.symbol}</span>
                </div>
              )}

              {activeFinding.snippet_redacted ? (
                <div>
                  <div className="text-slate-500 text-[11px] mb-1">Redacted Code Snippet:</div>
                  <pre className="p-3 rounded-lg bg-slate-100 border border-slate-200 text-slate-800 text-xs overflow-x-auto whitespace-pre-wrap leading-relaxed">
                    {activeFinding.snippet_redacted}
                  </pre>
                </div>
              ) : (
                <div className="text-slate-500 italic text-[11px] bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  (No snippet or non-textual artefact; source AST/symbol/cert parsed directly)
                </div>
              )}
            </div>
          </div>

          {/* Rule 6.2: Complete Factor Attribution */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 font-sans">
              Risk Attribution & Factor Breakdown
            </h3>
            {loading ? (
              <div className="p-6 text-center text-xs text-slate-500 font-mono animate-pulse">
                Loading factor attribution from engine...
              </div>
            ) : (
              <FactorBreakdown
                factors={risk?.factors || []}
                explanation={risk?.explanation}
                drivers={risk?.drivers}
              />
            )}
          </div>

          {/* Asset Metadata & PQC Recommendation */}
          {asset && (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex items-center justify-between text-xs font-mono text-slate-500">
                <span className="font-bold uppercase tracking-wider text-slate-700 font-sans">
                  Cryptographic Inventory Details
                </span>
                {asset.oid && <span>OID: {asset.oid}</span>}
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono text-slate-600">
                <div>
                  <span className="text-slate-500 font-sans">Family:</span>{' '}
                  <span className="text-slate-900 font-semibold">{asset.family || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-sans">Primitive:</span>{' '}
                  <span className="text-slate-900 font-semibold">{asset.primitive || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-sans">Purpose:</span>{' '}
                  <span className="text-slate-900 font-semibold">{asset.purpose || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-sans">Key Size:</span>{' '}
                  <span className="text-slate-900 font-semibold">
                    {asset.key_size_bits ? `${asset.key_size_bits} bits` : 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 font-sans">Curve:</span>{' '}
                  <span className="text-slate-900 font-semibold">{asset.curve || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-sans">Mode:</span>{' '}
                  <span className="text-slate-900 font-semibold">{asset.mode || 'N/A'}</span>
                </div>
              </div>

              {(asset.replacement_hint || regAlg?.replacement_hint) && (
                <div className="mt-3 p-3.5 rounded-xl bg-indigo-50 border border-indigo-200 text-xs">
                  <div className="font-bold text-indigo-900 flex items-center gap-1.5 mb-1 font-sans">
                    <CheckCircle className="w-4 h-4 text-indigo-700 shrink-0" />
                    Target PQC Migration Recommendation
                  </div>
                  <p className="text-slate-900 font-mono text-xs leading-relaxed">
                    {asset.replacement_hint || regAlg?.replacement_hint}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Drawer Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs font-mono text-slate-500">
          <span>Finding ID: {activeFinding.id}</span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 font-bold transition cursor-pointer"
          >
            Close Drawer
          </button>
        </div>
      </div>
    </div>
  );
};
