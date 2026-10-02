import React, { useState } from 'react';
import { CoverageOut } from '../../types/api';
import { ShieldCheck, AlertCircle, ChevronDown, ChevronUp, EyeOff, Layers } from 'lucide-react';

interface CoverageHonestyBannerProps {
  coverage?: CoverageOut | null;
  coverageIndex?: number;
  unobservedPct?: number;
  className?: string;
  condensed?: boolean;
}

export const CoverageHonestyBanner: React.FC<CoverageHonestyBannerProps> = ({
  coverage,
  coverageIndex: propCoverageIndex,
  unobservedPct: propUnobservedPct,
  className = '',
  condensed = false,
}) => {
  const [expanded, setExpanded] = useState(false);

  const coverageIndex = coverage?.coverage_index ?? propCoverageIndex ?? 0;
  const unobservedPct = coverage?.unobserved_pct ?? propUnobservedPct ?? 0;
  const unobservedSamples = coverage?.unobserved_samples || [];

  const coveragePct = Math.round(coverageIndex * 1000) / 10;
  const isHighCoverage = coverageIndex >= 0.95;

  return (
    <div
      className={`rounded-2xl border backdrop-blur-sm transition-all shadow-sm ${
        isHighCoverage
          ? 'bg-slate-900/70 border-slate-700/60'
          : 'bg-amber-950/20 border-amber-500/30'
      } ${className}`}
    >
      <div className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700/60 text-sky-300">
              <Layers className="w-3.5 h-3.5 text-sky-400" />
              Coverage Index: {coverageIndex.toFixed(3)} ({coveragePct}%)
            </span>
            <span className="text-xs px-2.5 py-1 rounded-lg bg-slate-800/60 text-slate-400 border border-slate-700/40">
              Unobserved: {unobservedPct.toFixed(1)}%
            </span>
          </div>

          <div className="flex items-start gap-2.5 pt-1">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              {/* MANDATORY RULE 6.1: Never say 'quantum-safe' */}
              <p className="text-sm font-semibold text-slate-100">
                Coverage Honesty Banner: No vulnerable artefacts detected within the scanned scope.
              </p>
              <p className="text-xs text-slate-400 font-sans mt-0.5">
                Transparent accounting of fully inspected code vs unobserved binaries.
              </p>
            </div>
          </div>

        </div>

        {unobservedSamples.length > 0 && !condensed && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="self-start md:self-center inline-flex items-center gap-2 px-3 py-1.5 text-xs font-mono font-medium rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-800 text-slate-200 transition"
          >
            <EyeOff className="w-3.5 h-3.5 text-amber-400" />
            <span>Unobserved Surfaces ({unobservedSamples.length})</span>
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {expanded && unobservedSamples.length > 0 && (
        <div className="border-t border-slate-800 bg-slate-950/70 p-4 rounded-b-xl space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2 font-mono">
            <span className="font-semibold uppercase tracking-wider text-[11px] text-amber-400 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />
              Unobserved Surface Ledger (Rule 6.4)
            </span>
            <span>{unobservedSamples.length} item(s) logged</span>
          </div>

          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {unobservedSamples.map((sample, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded bg-slate-900/80 border border-slate-800 text-xs font-mono"
              >
                <div className="flex items-center gap-2 min-w-0 truncate">
                  <span className="text-slate-200 font-medium truncate">{sample.path}</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">
                    {sample.kind}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded font-semibold uppercase ${
                      sample.state === 'partial'
                        ? 'bg-amber-950/60 text-amber-400 border border-amber-500/40'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                  >
                    {sample.state}
                  </span>
                  <span className="text-slate-400 text-xs truncate max-w-xs">{sample.reason}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
