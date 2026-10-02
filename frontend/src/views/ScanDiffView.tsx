import React, { useEffect, useState } from 'react';
import { useScan } from '../context/ScanContext';
import { ecdatApi } from '../api/endpoints';
import { ScanDiffResult } from '../types/api';
import { BandBadge } from '../components/common/BandBadge';
import {
  GitCompare,
  Plus,
  Minus,
  AlertCircle,
  RefreshCw,
  FileCode,
  ArrowRight,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

export const ScanDiffView: React.FC = () => {
  const { scans, activeScanId, activeScan } = useScan();
  const [againstId, setAgainstId] = useState<string>('');
  const [diff, setDiff] = useState<ScanDiffResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Other scans available to diff against
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
      <div className="max-w-4xl mx-auto p-12 text-center text-slate-500 font-mono">
        Select a scan to compare.
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Title */}
      <div className="border-b border-slate-800/80 pb-5">
        <div className="flex items-center gap-2.5">
          <GitCompare className="w-6 h-6 text-sky-400" />
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
            Scan-over-Scan Cryptographic Diff
          </h1>
        </div>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Detect cryptographic drift, newly introduced vulnerabilities, and remediated debt
        </p>
      </div>

      {/* Selectors */}
      <div className="p-5 rounded-2xl bg-slate-800/40 border border-slate-700/60 shadow-sm backdrop-blur-sm flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <span className="text-slate-400 font-medium">Active Scan:</span>
          <span className="px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-700/60 text-sky-300 font-semibold font-mono">
            {activeScan?.name || activeScanId.substring(0, 8)}
          </span>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <ArrowRight className="w-4 h-4 text-slate-500 hidden sm:block" />
          <span className="text-slate-400 font-medium">Compare Against:</span>
          <select
            value={againstId}
            onChange={(e) => setAgainstId(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-900/80 border border-slate-700/70 text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500 text-xs transition cursor-pointer"
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
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-medium transition disabled:opacity-50 shadow-md shadow-sky-500/20 cursor-pointer"
          >
            {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Compare'}
          </button>
        </div>
      </div>

      {error ? (
        <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-500/30 text-rose-300 text-xs">
          {error}
        </div>
      ) : loading ? (
        <div className="p-12 text-center text-slate-400">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-sky-400" />
          Calculating cryptographic delta...
        </div>
      ) : !diff ? (
        <div className="p-12 text-center text-slate-400 border border-dashed border-slate-700/60 rounded-2xl">
          Select a baseline scan above to compare differences.
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl bg-slate-800/40 border border-slate-700/60 shadow-sm backdrop-blur-sm">
              <span className="text-slate-400 text-xs block font-medium">Added Findings</span>
              <span className="text-2xl font-bold text-rose-400 mt-1 block tracking-tight font-mono">
                +{diff.summary?.added_count ?? (diff.findings?.added?.length || 0)}
              </span>
            </div>

            <div className="p-5 rounded-2xl bg-slate-800/40 border border-slate-700/60 shadow-sm backdrop-blur-sm">
              <span className="text-slate-400 text-xs block">Removed / Remediated</span>
              <span className="text-2xl font-bold text-emerald-400 mt-1 block">
                -{diff.summary?.removed_count ?? (diff.findings?.removed?.length || 0)}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-slate-400 text-xs block">Changed Risk</span>
              <span className="text-2xl font-bold text-amber-400 mt-1 block">
                {diff.summary?.changed_count ?? (diff.findings?.changed?.length || 0)}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-slate-400 text-xs block">Net Delta</span>
              <span className="text-2xl font-bold text-cyan-400 mt-1 block">
                {diff.summary?.risk_delta ?? 0}
              </span>
            </div>
          </div>

          {/* Added findings */}
          {diff.findings?.added && diff.findings.added.length > 0 && (
            <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
              <h3 className="text-xs font-bold uppercase text-rose-400 flex items-center gap-1.5">
                <Plus className="w-4 h-4" />
                Newly Introduced Artefacts ({diff.findings.added.length})
              </h3>
              <div className="space-y-2">
                {diff.findings.added.map((f) => (
                  <div
                    key={f.id}
                    className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      {f.risk && <BandBadge band={f.risk.band} size="sm" />}
                      <span className="font-bold text-slate-200">{f.asset?.canonical_name || f.symbol}</span>
                      <span className="text-slate-400">{f.file_path}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Removed findings */}
          {diff.findings?.removed && diff.findings.removed.length > 0 && (
            <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
              <h3 className="text-xs font-bold uppercase text-emerald-400 flex items-center gap-1.5">
                <Minus className="w-4 h-4" />
                Remediated Artefacts ({diff.findings.removed.length})
              </h3>
              <div className="space-y-2">
                {diff.findings.removed.map((f) => (
                  <div
                    key={f.id}
                    className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      {f.risk && <BandBadge band={f.risk.band} size="sm" />}
                      <span className="font-bold text-slate-200">{f.asset?.canonical_name || f.symbol}</span>
                      <span className="text-slate-400">{f.file_path}</span>
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
