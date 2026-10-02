import React, { useEffect, useState } from 'react';
import { useScan } from '../context/ScanContext';
import { ecdatApi } from '../api/endpoints';
import { ScanDiffResult } from '../types/api';
import { BandBadge } from '../components/common/BandBadge';
import { HelpTooltip } from '../components/common/HelpTooltip';
import {
  GitCompare,
  Plus,
  Minus,
  RefreshCw,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';

export const ScanDiffView: React.FC = () => {
  const { scans, activeScanId, activeScan } = useScan();
  const [againstId, setAgainstId] = useState<string>('');
  const [diff, setDiff] = useState<ScanDiffResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const otherScans = scans.filter((s) => s.id !== activeScanId);

  useEffect(() => {
    if (otherScans.length > 0 && !againstId) {
      setAgainstId(otherScans[0].id);
    }
  }, [otherScans, againstId]);

  const runDiff = async () => {
    if (!activeScanId || !againstId) return;

    setLoading(true);
    setError(null);
    try {
      const res = await ecdatApi.getScanDiff(activeScanId, againstId);
      setDiff(res.data);
    } catch (err: any) {
      setError(err.message || 'Diff calculation failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeScanId && againstId) {
      runDiff();
    }
  }, [activeScanId, againstId]);

  if (!activeScanId) {
    return (
      <div className="max-w-4xl mx-auto p-12 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-surface-2 border border-border flex items-center justify-center mx-auto text-accent shadow-card">
          <GitCompare className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-text-main">No Scan Selected</h2>
        <p className="text-sm text-text-muted">
          Select an active scan from the header to compare against earlier discovery snapshots.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6 animate-in fade-in duration-200">
      {/* Title */}
      <div className="border-b border-border pb-5">
        <div className="flex items-center gap-2.5">
          <GitCompare className="w-6 h-6 text-accent" />
          <h1 className="text-2xl font-bold text-text-main tracking-tight">
            Scan-over-Scan Cryptographic Diff
          </h1>
          <HelpTooltip
            title="Cryptographic Drift & Delta"
            content="Compares two discovery scans to identify newly introduced vulnerable algorithms, remediated debt, or changes in risk band."
          />
        </div>
        <p className="text-xs sm:text-sm text-text-muted mt-1">
          Detect cryptographic drift, newly introduced vulnerabilities, and remediated debt between scans.
        </p>
      </div>

      {/* Selectors */}
      <div className="p-5 rounded-card bg-surface border border-border shadow-card flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <span className="text-text-muted font-bold">Active Scan:</span>
          <span className="px-3 py-1.5 rounded-xl bg-surface-2 border border-border text-accent font-bold font-mono">
            {activeScan?.name || activeScanId.substring(0, 8)}
          </span>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <ArrowRight className="w-4 h-4 text-text-dim hidden sm:block" />
          <span className="text-text-muted font-bold">Compare Against:</span>
          <select
            value={againstId}
            onChange={(e) => setAgainstId(e.target.value)}
            className="px-3 py-2 rounded-xl bg-surface-2 border border-border text-text-main font-semibold focus:outline-none focus:border-accent text-xs transition cursor-pointer"
          >
            {otherScans.length === 0 ? (
              <option value="">No other scans found</option>
            ) : (
              otherScans.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name || s.id.substring(0, 8)} ({s.finding_count} findings)
                </option>
              ))
            )}
          </select>

          <button
            onClick={runDiff}
            disabled={!againstId || loading}
            className="px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-bg font-bold transition disabled:opacity-50 shadow-sm cursor-pointer"
          >
            {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Compare'}
          </button>
        </div>
      </div>

      {error ? (
        <div className="p-4 rounded-xl bg-danger-subtle border border-danger-border text-danger text-xs font-mono">
          {error}
        </div>
      ) : loading ? (
        <div className="p-12 text-center text-text-muted font-mono">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-accent" />
          Calculating cryptographic delta...
        </div>
      ) : !diff ? (
        <div className="p-12 text-center text-text-muted border border-dashed border-border rounded-card bg-surface">
          Select a baseline scan above to compare differences.
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-5 rounded-card bg-surface border border-border shadow-card">
              <span className="text-text-muted text-xs block font-bold">Added Findings</span>
              <span className="text-2xl font-bold text-danger mt-1 block tracking-tight font-mono">
                +{diff.summary?.added_count ?? (diff.findings?.added?.length || 0)}
              </span>
            </div>

            <div className="p-5 rounded-card bg-surface border border-border shadow-card">
              <span className="text-text-muted text-xs block font-bold">Remediated Findings</span>
              <span className="text-2xl font-bold text-accent mt-1 block tracking-tight font-mono">
                -{diff.summary?.removed_count ?? (diff.findings?.removed?.length || 0)}
              </span>
            </div>

            <div className="p-5 rounded-card bg-surface border border-border shadow-card">
              <span className="text-text-muted text-xs block font-bold">Changed Risk</span>
              <span className="text-2xl font-bold text-warning mt-1 block tracking-tight font-mono">
                {diff.summary?.changed_count ?? (diff.findings?.changed?.length || 0)}
              </span>
            </div>

            <div className="p-5 rounded-card bg-surface border border-border shadow-card">
              <span className="text-text-muted text-xs block font-bold">Net Risk Delta</span>
              <span className="text-2xl font-bold text-accent-2 mt-1 block tracking-tight font-mono">
                {diff.summary?.risk_delta ?? 0}
              </span>
            </div>
          </div>

          {/* Added findings */}
          {diff.findings?.added && diff.findings.added.length > 0 && (
            <div className="p-5 rounded-card bg-surface border border-border space-y-3 shadow-card">
              <h2 className="text-xs font-bold uppercase text-danger flex items-center gap-1.5 font-mono">
                <Plus className="w-4 h-4" />
                Newly Introduced Artefacts ({diff.findings.added.length})
              </h2>
              <div className="space-y-2">
                {diff.findings.added.map((f) => (
                  <div
                    key={f.id}
                    className="p-3.5 rounded-xl bg-surface-2 border border-border text-xs flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      {f.risk && <BandBadge band={f.risk.band} size="sm" />}
                      <span className="font-bold text-text-main">{f.asset?.canonical_name || f.symbol}</span>
                      <span className="text-text-muted font-mono truncate">{f.file_path}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Removed findings */}
          {diff.findings?.removed && diff.findings.removed.length > 0 && (
            <div className="p-5 rounded-card bg-surface border border-border space-y-3 shadow-card">
              <h2 className="text-xs font-bold uppercase text-accent flex items-center gap-1.5 font-mono">
                <Minus className="w-4 h-4" />
                Remediated Artefacts ({diff.findings.removed.length})
              </h2>
              <div className="space-y-2">
                {diff.findings.removed.map((f) => (
                  <div
                    key={f.id}
                    className="p-3.5 rounded-xl bg-surface-2 border border-border text-xs flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      {f.risk && <BandBadge band={f.risk.band} size="sm" />}
                      <span className="font-bold text-text-main">{f.asset?.canonical_name || f.symbol}</span>
                      <span className="text-text-muted font-mono truncate">{f.file_path}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
