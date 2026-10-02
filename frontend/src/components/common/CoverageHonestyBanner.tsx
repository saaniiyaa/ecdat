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
      className={`rounded-2xl border transition-all shadow-sm ${
        isHighCoverage
          ? 'bg-white border-slate-200'
          : 'bg-amber-50 border-amber-200'
      } ${className}`}
    >
      <div className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-200/60 text-indigo-700">
              <Layers className="w-3.5 h-3.5 text-indigo-600" />
              Coverage Index: {coverageIndex.toFixed(3)} ({coveragePct}%)
            </span>
            <span className="text-xs px-2.5 py-1 rounded-lg bg-slate-50 text-slate-500 border border-slate-200">
              Unobserved: {unobservedPct.toFixed(1)}%
            </span>
          </div>

          <div className="flex items-start gap-2.5 pt-1">
            <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              {/* MANDATORY RULE 6.1: Never say 'quantum-safe' */}
              <p className="text-sm font-semibold text-slate-900">
                Coverage Honesty Banner: No vulnerable artefacts detected within the scanned scope.
              </p>
              <p className="text-xs text-slate-500 font-sans mt-0.5">
                Transparent accounting of fully inspected code vs unobserved binaries.
              </p>
            </div>
          </div>

        </div>

        {unobservedSamples.length > 0 && !condensed && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="self-start md:self-center inline-flex items-center gap-2 px-3 py-1.5 text-xs font-mono font-medium rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition"
          >
            <EyeOff className="w-3.5 h-3.5 text-amber-600" />
            <span>Unobserved Surfaces ({unobservedSamples.length})</span>
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {expanded && unobservedSamples.length > 0 && (
        <div className="border-t border-slate-200 bg-slate-50 p-4 rounded-b-xl space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2 font-mono">
            <span className="font-semibold uppercase tracking-wider text-[11px] text-amber-600 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />
              Unobserved Surface Ledger (Rule 6.4)
            </span>
            <span>{unobservedSamples.length} item(s) logged</span>
          </div>

          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {unobservedSamples.map((sample, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded bg-white border border-slate-200 text-xs font-mono"
              >
                <div className="flex items-center gap-2 min-w-0 truncate">
                  <span className="text-slate-800 font-medium truncate">{sample.path}</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 border border-slate-200">
                    {sample.kind}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded font-semibold uppercase ${
                      sample.state === 'partial'
                        ? 'bg-amber-50 text-amber-700 border border-amber-200/60'
                        : 'bg-slate-100 text-slate-500 border border-slate-200'
                    }`}
                  >
                    {sample.state}
                  </span>
                  <span className="text-slate-500 text-xs truncate max-w-xs">{sample.reason}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
