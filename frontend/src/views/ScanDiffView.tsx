import React, { useEffect, useState } from 'react';
import { useScan } from '../context/ScanContext';
import { ecdatApi } from '../api/endpoints';
import { ScanDiffResult, FindingOut } from '../types/api';
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

  // A diff answers "did this codebase get worse?". Between two scans of the
  // same project that is the right question. Between Python and Java it is
  // not - there is no drift, only difference. So the view works out whether it
  // is looking at drift or at a cross-language comparison, and says which.
  // The family comparison below is the interesting part either way: RSA-PSS and
  // EdDSA being separated from PKCS#1 v1.5 in *both* languages is the claim the
  // multi-language support rests on.
  const [leftFamilies, setLeftFamilies] = useState<Map<string, number>>(new Map());
  const [rightFamilies, setRightFamilies] = useState<Map<string, number>>(new Map());
  const [leftCount, setLeftCount] = useState(0);
  const [rightCount, setRightCount] = useState(0);

  const tally = (items: FindingOut[]): Map<string, number> => {
    const m = new Map<string, number>();
    for (const f of items) {
      const fam = f.asset?.family;
      if (fam) m.set(fam, (m.get(fam) || 0) + 1);
    }
    return m;
  };

  useEffect(() => {
    if (!activeScanId) { setLeftFamilies(new Map()); return; }
    ecdatApi.listFindings(activeScanId, { limit: 500 })
      .then((r) => { setLeftFamilies(tally(r.data.items)); setLeftCount(r.data.total); })
      .catch(() => setLeftFamilies(new Map()));
  }, [activeScanId]);

  useEffect(() => {
    if (!againstId) { setRightFamilies(new Map()); return; }
    ecdatApi.listFindings(againstId, { limit: 500 })
      .then((r) => { setRightFamilies(tally(r.data.items)); setRightCount(r.data.total); })
      .catch(() => setRightFamilies(new Map()));
  }, [againstId]);

  const leftName = activeScan?.name || 'active scan';
  const againstName = otherScans.find((s) => s.id === againstId)?.name || 'comparison scan';
  // A name that carries a language token is a different-language comparison.
  const LANG = /python|pyjwt|go|golang|java|jwt/i;
  const isCrossLanguage =
    LANG.test(leftName) && LANG.test(againstName) &&
    /python|pyjwt/i.test(leftName) !== /python|pyjwt/i.test(againstName) ? true
      : /go|golang/i.test(leftName) !== /go|golang/i.test(againstName) ||
        /java/i.test(leftName) !== /java/i.test(againstName);

  const allFamilies = Array.from(new Set([...leftFamilies.keys(), ...rightFamilies.keys()])).sort();
  const maxFam = Math.max(
    1,
    ...[...leftFamilies.values()],
    ...[...rightFamilies.values()]
  );

  if (!activeScanId) {
    return (
      <div className="max-w-4xl mx-auto p-12 text-center text-slate-500 font-mono">
        Select a scan to compare.
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6 font-mono">
      {/* Title */}
      <div className="border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2">
          <GitCompare className="w-6 h-6 text-cyan-400" />
          <h1 className="text-2xl font-bold text-slate-100">
            Scan-over-Scan Cryptographic Diff
          </h1>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Detect cryptographic drift, newly introduced vulnerabilities, and remediated debt
        </p>
      </div>

      {/* What kind of comparison this is. Calling a Go-vs-Java difference
          "drift" would be the kind of claim that does not survive a question
          from the panel. */}
      {againstId && (
        <div
          className={`rounded-xl border p-4 font-mono text-xs ${
            isCrossLanguage
              ? 'border-cyan-500/30 bg-cyan-950/15 text-cyan-200'
              : 'border-slate-800 bg-slate-900/60 text-slate-400'
          }`}
        >
          <div className="font-bold mb-1">
            {isCrossLanguage ? 'Cross-language comparison — not drift' : 'Drift comparison — same target'}
          </div>
          <div className="text-[11px] leading-relaxed opacity-90">
            {isCrossLanguage ? (
              <>
                These two scans are of <strong>{leftName}</strong> and <strong>{againstName}</strong> — different
                projects in different languages. Added and removed findings below reflect what each codebase
                contains, not a change over time. What is worth comparing is the family table underneath: the
                same families should be separated the same way in both languages.
              </>
            ) : (
              <>
                Findings added and removed here represent real drift in the target between the two scans.
              </>
            )}
          </div>
        </div>
      )}

      {/* Family-by-family comparison, present in both */}
      {allFamilies.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 bg-slate-950/50">
            <h3 className="text-sm font-bold text-slate-200">Algorithm families, both scans</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Counts come from the server's own finding list — this view tallies them and
              performs no classification of its own.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[10px]">
                  <th className="py-2.5 px-4">Family</th>
                  <th className="py-2.5 px-4">{leftName}</th>
                  <th className="py-2.5 px-4">{againstName}</th>
                  <th className="py-2.5 px-4">Reading</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {allFamilies.map((fam) => {
                  const l = leftFamilies.get(fam) || 0;
                  const r = rightFamilies.get(fam) || 0;
                  const reading = l && r ? 'both' : l ? 'left only' : 'right only';
                  return (
                    <tr key={fam} className="hover:bg-slate-800/40">
                      <td className="py-2.5 px-4 text-slate-200 font-semibold">{fam}</td>
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="w-7 text-slate-300">{l}</span>
                          <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden min-w-[60px]">
                            <div className="h-full bg-cyan-500" style={{ width: `${(l / maxFam) * 100}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="w-7 text-slate-300">{r}</span>
                          <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden min-w-[60px]">
                            <div className="h-full bg-violet-500" style={{ width: `${(r / maxFam) * 100}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-[11px] text-slate-500">
                        {reading === 'both' ? (
                          <span className="text-emerald-400">detected in both</span>
                        ) : (
                          <span className="text-amber-400">{reading}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2.5 border-t border-slate-800 text-[10px] text-slate-600">
            {leftCount.toLocaleString()} findings in the active scan · {rightCount.toLocaleString()} in the
            comparison. Pages above 500 are not tallied here; use the findings explorer for a full count.
          </div>
        </div>
      )}

      {/* Selectors */}
      <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <span className="text-slate-400 font-semibold">Active Scan:</span>
          <span className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-cyan-300 font-bold">
            {activeScan?.name || activeScanId.substring(0, 8)}
          </span>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <ArrowRight className="w-4 h-4 text-slate-500 hidden sm:block" />
          <span className="text-slate-400 font-semibold">Compare Against:</span>
          <select
            value={againstId}
            onChange={(e) => setAgainstId(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-cyan-500"
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
            className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold transition disabled:opacity-50"
          >
            {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Compare'}
          </button>
        </div>
      </div>

      {error ? (
        <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-500/40 text-rose-300 text-xs">
          {error}
        </div>
      ) : loading ? (
        <div className="p-12 text-center text-slate-500">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-cyan-400" />
          Calculating cryptographic delta...
        </div>
      ) : !diff ? (
        <div className="p-12 text-center text-slate-500 border border-dashed border-slate-800 rounded-xl">
          Select a baseline scan above to compare differences.
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-slate-400 text-xs block">Added Findings</span>
              <span className="text-2xl font-bold text-rose-400 mt-1 block">
                +{diff.summary?.added_count ?? (diff.findings?.added?.length || 0)}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
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
