import React, { useState } from 'react';
import { CoverageOut } from '../../types/api';
import { ShieldCheck, AlertCircle, ChevronDown, ChevronUp, EyeOff, Layers } from 'lucide-react';
import { HelpTooltip } from './HelpTooltip';

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
      className={`rounded-card border transition-all shadow-card ${
        isHighCoverage
          ? 'bg-surface border-border'
          : 'bg-warning-subtle/40 border-warning-border'
      } ${className}`}
    >
      <div className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg bg-surface-2 border border-border text-accent-2">
              <Layers className="w-3.5 h-3.5 text-accent-2" />
              Coverage Index: {coverageIndex.toFixed(3)} ({coveragePct}%)
            </span>
            <span className="text-xs px-2.5 py-1 rounded-lg bg-surface-2 text-text-muted border border-border font-mono font-semibold">
              Unobserved: {unobservedPct.toFixed(1)}%
            </span>
            <HelpTooltip
              title="Coverage Honesty (Rule 6.1 & 6.4)"
              content="Explicitly accounts for fully inspected code versus unobserved binaries or uninspected paths. Prevents false confidence."
            />
          </div>

          <div className="flex items-start gap-2.5 pt-1">
            <ShieldCheck className="w-5 h-5 text-accent shrink-0 mt-0.5" />
            <div>
              {/* MANDATORY RULE 6.1: Never say 'quantum-safe' */}
              <p className="text-sm font-bold text-text-main">
                Coverage Honesty Ledger: No vulnerable artefacts detected within the scanned scope.
              </p>
              <p className="text-xs text-text-muted mt-0.5">
                Transparent accounting of fully inspected code vs unobserved binaries and stripped symbols.
              </p>
            </div>
          </div>
        </div>

        {unobservedSamples.length > 0 && !condensed && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="self-start md:self-center inline-flex items-center gap-2 px-3.5 py-2 text-xs font-mono font-semibold rounded-xl border border-border bg-surface-2 hover:bg-surface-3 text-text-main transition shadow-sm cursor-pointer"
          >
            <EyeOff className="w-3.5 h-3.5 text-warning" />
            <span>Unobserved Surfaces ({unobservedSamples.length})</span>
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {expanded && unobservedSamples.length > 0 && (
        <div className="border-t border-border bg-surface-2/60 p-4 rounded-b-card space-y-2.5">
          <div className="flex items-center justify-between text-xs text-text-muted mb-2 font-mono">
            <span className="font-bold uppercase tracking-wider text-[11px] text-warning flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />
              Unobserved Surface Ledger (Rule 6.4)
            </span>
            <span>{unobservedSamples.length} item(s) logged</span>
          </div>

          <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
            {unobservedSamples.map((sample, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-surface border border-border text-xs font-mono"
              >
                <div className="flex items-center gap-2 min-w-0 truncate">
                  <span className="text-text-main font-semibold truncate">{sample.path}</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-surface-2 text-text-dim border border-border">
                    {sample.kind}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase border ${
                      sample.state === 'partial'
                        ? 'bg-warning-subtle text-warning border-warning-border'
                        : 'bg-surface-2 text-text-muted border-border'
                    }`}
                  >
                    {sample.state}
                  </span>
                  <span className="text-text-dim text-xs truncate max-w-xs">{sample.reason}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
