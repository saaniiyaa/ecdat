import React from 'react';
import { FactorOut } from '../../types/api';
import { FileCode, ArrowUpRight, Scale } from 'lucide-react';

interface FactorBreakdownProps {
  factors: FactorOut[];
  explanation?: string | null;
  drivers?: Record<string, any>;
}

export const FactorBreakdown: React.FC<FactorBreakdownProps> = ({
  factors,
  explanation,
  drivers,
}) => {
  return (
    <div className="space-y-4">
      {explanation && (
        <div className="p-4 rounded-xl border border-border bg-surface-2 text-xs text-text-muted leading-relaxed">
          <div className="font-bold text-text-main flex items-center gap-2 mb-1.5 text-xs">
            <Scale className="w-4 h-4 text-accent" />
            <span>Deterministic Scoring Explanation (Rule 6.2)</span>
          </div>
          <p className="font-mono text-text-muted text-xs leading-relaxed bg-surface/80 p-3 rounded-lg border border-border/60">
            {explanation}
          </p>
        </div>
      )}

      {drivers && drivers.context && (
        <div className="p-3.5 rounded-xl bg-surface-2 border border-border text-xs font-mono">
          <div className="text-text-dim text-[11px] uppercase tracking-wider mb-2 font-bold">
            Context Drivers (+{drivers.context_points || 0} pts)
          </div>
          <div className="grid grid-cols-2 gap-3 text-text-muted">
            <div>
              <span className="text-text-dim font-sans font-semibold">Exposure:</span>{' '}
              <span className="text-warning font-bold">{drivers.context.exposure}</span>
            </div>
            <div>
              <span className="text-text-dim font-sans font-semibold">Criticality:</span>{' '}
              <span className="text-danger font-bold">{drivers.context.criticality}</span>
            </div>
            <div>
              <span className="text-text-dim font-sans font-semibold">Classification:</span>{' '}
              <span className="text-accent-2 font-bold">{drivers.context.classification}</span>
            </div>
            <div>
              <span className="text-text-dim font-sans font-semibold">Data Lifetime:</span>{' '}
              <span className="text-accent font-bold">{drivers.context.data_lifetime_years} years</span>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wider font-bold text-text-dim">
            Attributed Factors ({factors.length})
          </div>
          <span className="text-[11px] text-text-dim font-mono">Server-side attribution (Rule 6.2)</span>
        </div>

        {factors.length === 0 ? (
          <div className="p-6 text-center border border-dashed border-border rounded-xl text-xs text-text-dim font-mono bg-surface-2/40">
            No specific risk factors registered for this finding.
          </div>
        ) : (
          <div className="space-y-2">
            {factors.map((f, i) => {
              const isPositive = f.delta > 0;
              const trackColor =
                f.track === 'quantum'
                  ? 'border-accent-2-border bg-accent-2-subtle text-accent-2'
                  : f.track === 'classical'
                  ? 'border-warning-border bg-warning-subtle text-warning'
                  : 'border-border bg-surface-2 text-text-muted';

              return (
                <div
                  key={f.rule_id || i}
                  className="p-3.5 rounded-xl border border-border bg-surface-2/70 hover:border-border transition shadow-sm space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border uppercase ${trackColor}`}>
                          {f.track}
                        </span>
                        <span className="font-mono text-xs font-bold text-text-main">
                          {f.rule_id}
                        </span>
                        <span className="text-xs text-text-muted font-semibold truncate">
                          {f.title}
                        </span>
                      </div>

                      {f.factor_value && (
                        <div className="text-xs text-text-dim font-mono">
                          Value:{' '}
                          <span className="text-text-main bg-surface px-1.5 py-0.5 rounded border border-border">
                            {String(f.factor_value)}
                          </span>
                        </div>
                      )}

                      {f.evidence && (
                        <div className="flex items-center gap-1.5 text-xs text-text-dim font-mono truncate">
                          <FileCode className="w-3.5 h-3.5 text-accent shrink-0" />
                          <span className="truncate">{f.evidence}</span>
                        </div>
                      )}
                    </div>

                    <div className="text-right shrink-0">
                      <span
                        className={`inline-flex items-center text-xs font-mono font-bold px-2.5 py-1 rounded-lg border ${
                          isPositive
                            ? 'text-danger bg-danger-subtle border-danger-border'
                            : 'text-accent bg-accent-subtle border-accent-border'
                        }`}
                      >
                        {isPositive ? `+${f.delta}` : f.delta} pts
                        <ArrowUpRight className="w-3 h-3 ml-0.5" />
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
