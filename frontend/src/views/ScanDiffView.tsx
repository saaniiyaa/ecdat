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
        <div className="w-16 h-16 rounded-2xl bg-white border border-slate-300 flex items-center justify-center mx-auto text-indigo-600 shadow-sm">
          <GitCompare className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">No Scan Selected</h2>
        <p className="text-sm text-slate-600">
          Select an active scan from the header to compare against earlier discovery snapshots.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6 animate-in fade-in duration-200">
      {/* Title */}
      <div className="border-b border-slate-200 pb-5">
        <div className="flex items-center gap-2.5">
          <GitCompare className="w-6 h-6 text-indigo-600" />
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Scan-over-Scan Cryptographic Diff
          </h1>
          <HelpTooltip
            title="Cryptographic Drift & Delta"
            content="Compares two discovery scans to identify newly introduced vulnerable algorithms, remediated debt, or changes in risk band."
          />
        </div>
        <p className="text-xs sm:text-sm text-slate-600 mt-1">
          Detect cryptographic drift, newly introduced vulnerabilities, and remediated debt between scans.
        </p>
      </div>

      {/* Selectors */}
      <div className="p-5 rounded-2xl bg-white border border-slate-300 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <span className="text-slate-700 font-bold">Active Scan:</span>
          <span className="px-3 py-1.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-800 font-bold font-mono">
            {activeScan?.name || activeScanId.substring(0, 8)}
          </span>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <ArrowRight className="w-4 h-4 text-slate-400 hidden sm:block" />
          <span className="text-slate-700 font-bold">Compare Against:</span>
          <select
            value={againstId}
            onChange={(e) => setAgainstId(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 font-semibold focus:outline-none focus:border-indigo-600 text-xs transition cursor-pointer"
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
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition disabled:opacity-50 shadow-sm cursor-pointer"
          >
            {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Compare'}
          </button>
        </div>
      </div>

      {error ? (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-xs font-mono">
          {error}
        </div>
      ) : loading ? (
        <div className="p-12 text-center text-slate-500 font-mono">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-600" />
          Calculating cryptographic delta...
        </div>
      ) : !diff ? (
        <div className="p-12 text-center text-slate-500 border border-dashed border-slate-300 rounded-2xl bg-white shadow-sm">
          Select a baseline scan above to compare differences.
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl bg-white border border-slate-300 shadow-sm">
              <span className="text-slate-600 text-xs block font-bold">Added Findings</span>
              <span className="text-2xl font-bold text-rose-700 mt-1 block tracking-tight font-mono">
                +{diff.summary?.added_count ?? (diff.findings?.added?.length || 0)}
              </span>
            </div>

            <div className="p-5 rounded-2xl bg-white border border-slate-300 shadow-sm">
              <span className="text-slate-600 text-xs block font-bold">Remediated Findings</span>
              <span className="text-2xl font-bold text-emerald-700 mt-1 block tracking-tight font-mono">
                -{diff.summary?.removed_count ?? (diff.findings?.removed?.length || 0)}
              </span>
            </div>

            <div className="p-5 rounded-2xl bg-white border border-slate-300 shadow-sm">
              <span className="text-slate-600 text-xs block font-bold">Changed Risk</span>
              <span className="text-2xl font-bold text-amber-700 mt-1 block tracking-tight font-mono">
                {diff.summary?.changed_count ?? (diff.findings?.changed?.length || 0)}
              </span>
            </div>

            <div className="p-5 rounded-2xl bg-white border border-slate-300 shadow-sm">
              <span className="text-slate-600 text-xs block font-bold">Net Risk Delta</span>
              <span className="text-2xl font-bold text-indigo-700 mt-1 block tracking-tight font-mono">
                {diff.summary?.risk_delta ?? 0}
              </span>
            </div>
          </div>

          {/* Added findings */}
          {diff.findings?.added && diff.findings.added.length > 0 && (
            <div className="p-5 rounded-2xl bg-white border border-slate-300 space-y-3 shadow-sm">
              <h2 className="text-xs font-bold uppercase text-rose-800 flex items-center gap-1.5 font-mono">
                <Plus className="w-4 h-4" />
                Newly Introduced Artefacts ({diff.findings.added.length})
              </h2>
              <div className="space-y-2">
                {diff.findings.added.map((f) => (
                  <div
                    key={f.id}
                    className="p-3.5 rounded-xl bg-rose-50/60 border border-rose-200 text-xs flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      {f.risk && <BandBadge band={f.risk.band} size="sm" />}
                      <span className="font-bold text-slate-900">{f.asset?.canonical_name || f.symbol}</span>
                      <span className="text-slate-700 font-mono truncate">{f.file_path}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Removed findings */}
          {diff.findings?.removed && diff.findings.removed.length > 0 && (
            <div className="p-5 rounded-2xl bg-white border border-slate-300 space-y-3 shadow-sm">
              <h2 className="text-xs font-bold uppercase text-emerald-800 flex items-center gap-1.5 font-mono">
                <Minus className="w-4 h-4" />
                Remediated Artefacts ({diff.findings.removed.length})
              </h2>
              <div className="space-y-2">
                {diff.findings.removed.map((f) => (
                  <div
                    key={f.id}
                    className="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-200 text-xs flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      {f.risk && <BandBadge band={f.risk.band} size="sm" />}
                      <span className="font-bold text-slate-900">{f.asset?.canonical_name || f.symbol}</span>
                      <span className="text-slate-700 font-mono truncate">{f.file_path}</span>
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
