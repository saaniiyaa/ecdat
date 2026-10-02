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
  ShieldAlert,
  Clock,
  ExternalLink,
  Tag,
  CheckCircle,
  HelpCircle,
  Copy,
  Check,
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
      ecdatApi.getFinding(scanId, finding.id)
        .then((res) => {
          setDetail(res.data);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [scanId, finding]);

  if (!finding) return null;

  const activeFinding = detail || finding;
  const asset = activeFinding.asset;
  const risk = activeFinding.risk;
  const regAlg = asset ? resolveAlgorithm(asset.canonical_name) : undefined;

  const handleCopyPath = () => {
    const loc = `${activeFinding.file_path}${activeFinding.line_start ? `:${activeFinding.line_start}` : ''}`;
    navigator.clipboard.writeText(loc);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-950/70 backdrop-blur-sm flex justify-end">
      <div className="w-full max-w-2xl bg-slate-900 border-l border-slate-700/60 h-full flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="p-6 border-b border-slate-800/80 bg-slate-900/95 flex items-start justify-between gap-4">
          <div className="space-y-2 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {risk && <BandBadge band={risk.band} size="lg" />}
              <EvidenceBadge
                evidenceClass={activeFinding.evidence_class}
                confidence={activeFinding.confidence}
                cappedByConfidence={risk?.capped_by_confidence}
              />
              {asset && <QuantumBadge status={asset.quantum_status} isPostQuantum={asset.is_post_quantum} />}
            </div>
            <h2 className="text-xl font-bold text-slate-100 truncate">
              {asset?.canonical_name || activeFinding.symbol || 'Cryptographic Finding'}
            </h2>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="truncate font-mono">{activeFinding.file_path}</span>
              {activeFinding.line_start && (
                <span className="text-sky-400 font-semibold font-mono">L{activeFinding.line_start}{activeFinding.line_end ? `-${activeFinding.line_end}` : ''}</span>
              )}
              <button
                onClick={handleCopyPath}
                title="Copy file path & line"
                className="p-1 hover:text-slate-200 transition"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Rule 6.3: Dual Track Risk Comparison (Classical vs Quantum) */}
          <div className="p-5 rounded-2xl bg-slate-800/40 border border-slate-700/60 shadow-sm backdrop-blur-sm space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold uppercase tracking-wider text-slate-300">
                Dual-Track Risk Accounting (Rule 6.3)
              </span>
              <span className="font-mono">Composite Score: {risk?.composite_risk ?? 0}/100</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Classical Track */}
              <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-700/50 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300 font-medium">Classical Track</span>
                  <span className="font-mono font-bold text-amber-400">{risk?.classical_risk ?? 0}/100</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-amber-500 h-2 rounded-full transition-all"
                    style={{ width: `${Math.min(100, risk?.classical_risk ?? 0)}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-400">
                  Sec bits: {asset?.classical_security_bits ?? 'N/A'} · NIST deprecated: {asset?.nist_deprecated_after ?? 'N/A'}
                </p>
              </div>

              {/* Quantum Track */}
              <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-700/50 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300 font-medium">Quantum Track</span>
                  <span className="font-mono font-bold text-indigo-400">{risk?.quantum_risk ?? 0}/100</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-indigo-500 h-2 rounded-full transition-all"
                    style={{ width: `${Math.min(100, risk?.quantum_risk ?? 0)}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-400">
                  Sec bits: {asset?.quantum_security_bits ?? 0} · Shor vulnerable: {asset?.quantum_status === 'shor_vulnerable' ? 'Yes' : 'No'}
                </p>
              </div>
            </div>

            {/* Mosca Inequality Status */}
            {risk?.mosca_state && (
              <div className="mt-2 p-3 rounded-xl bg-slate-900/70 border border-slate-700/50 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-sky-400" />
                  <span className="text-slate-300">Mosca Horizon Status:</span>
                  <span
                    className={`font-semibold px-2 py-0.5 rounded-md ${
                      risk.mosca_state === 'breached'
                        ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                        : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    }`}
                  >
                    {risk.mosca_state === 'breached' ? 'Migration Required' : 'Safe Window'}
                  </span>
                </div>
                {risk.mosca_margin_years !== undefined && risk.mosca_margin_years !== null && (
                  <span className="text-slate-400 font-mono">
                    Margin: <span className="font-semibold text-slate-200">{risk.mosca_margin_years}y</span>
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Rule 6.5: Evidence & Snippet (Redacted) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-mono text-slate-400">
              <span className="font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <FileCode className="w-4 h-4 text-cyan-400" />
                Detection Evidence (Rule 6.5)
              </span>
              <span>Detector: {activeFinding.detector_id}</span>
            </div>

            <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-2 font-mono text-xs">
              <div className="flex items-center justify-between text-slate-400">
                <span>Location: <span className="text-slate-200">{activeFinding.file_path}{activeFinding.line_start ? `:${activeFinding.line_start}` : ''}</span></span>
                <span>Source: <span className="text-slate-200">{activeFinding.source || 'file'}</span></span>
              </div>

              {activeFinding.symbol && (
                <div className="text-slate-400">
                  Symbol: <span className="text-cyan-300">{activeFinding.symbol}</span>
                </div>
              )}

              {activeFinding.snippet_redacted ? (
                <div>
                  <div className="text-slate-400 text-[11px] mb-1">Redacted Code Snippet:</div>
                  <pre className="p-2.5 rounded bg-slate-900 border border-slate-800/80 text-slate-300 text-xs overflow-x-auto whitespace-pre-wrap">
                    {activeFinding.snippet_redacted}
                  </pre>
                </div>
              ) : (
                <div className="text-slate-500 italic text-[11px]">
                  (No snippet or non-textual artefact; source AST/symbol/cert parsed directly)
                </div>
              )}
            </div>
          </div>

          {/* Rule 6.2: Complete Factor Attribution */}
          <div className="space-y-2">
            <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-300">
              Risk Attribution & Factor Breakdown
            </h3>
            {loading ? (
              <div className="p-6 text-center text-xs text-slate-500 font-mono animate-pulse">
                Loading factor attribution from server...
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
            <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                <span className="font-semibold uppercase tracking-wider text-slate-300">
                  Cryptographic Inventory Details
                </span>
                {asset.oid && <span>OID: {asset.oid}</span>}
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono text-slate-300">
                <div><span className="text-slate-500">Family:</span> {asset.family || 'N/A'}</div>
                <div><span className="text-slate-500">Primitive:</span> {asset.primitive || 'N/A'}</div>
                <div><span className="text-slate-500">Purpose:</span> {asset.purpose || 'N/A'}</div>
                <div><span className="text-slate-500">Key Size:</span> {asset.key_size_bits ? `${asset.key_size_bits} bits` : 'N/A'}</div>
                <div><span className="text-slate-500">Curve:</span> {asset.curve || 'N/A'}</div>
                <div><span className="text-slate-500">Mode:</span> {asset.mode || 'N/A'}</div>
              </div>

              {(asset.replacement_hint || regAlg?.replacement_hint) && (
                <div className="mt-3 p-3 rounded-lg bg-emerald-950/20 border border-emerald-500/30 text-xs">
                  <div className="font-semibold text-emerald-400 flex items-center gap-1.5 mb-1 font-mono">
                    <CheckCircle className="w-4 h-4" />
                    Target PQC Migration Recommendation
                  </div>
                  <p className="text-slate-300 font-mono">
                    {asset.replacement_hint || regAlg?.replacement_hint}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Drawer Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 flex items-center justify-between text-xs font-mono text-slate-400">
          <span>Finding ID: {activeFinding.id}</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
