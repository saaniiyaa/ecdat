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
        <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-600 leading-relaxed font-sans">
          <div className="font-semibold text-slate-900 flex items-center gap-1.5 mb-1 text-[13px]">
            <Scale className="w-4 h-4 text-indigo-600" />
            <span>Deterministic Scoring Explanation</span>
          </div>
          <p className="font-mono text-slate-600 text-xs">{explanation}</p>
        </div>
      )}

      {drivers && drivers.context && (
        <div className="p-3 rounded-md bg-slate-50 border border-slate-200 text-xs font-mono">
          <div className="text-slate-500 text-[11px] uppercase tracking-wider mb-2 font-semibold">
            Context Drivers (+{drivers.context_points || 0} pts)
          </div>
          <div className="grid grid-cols-2 gap-2 text-slate-700">
            <div>
              <span className="text-slate-500">Exposure:</span>{' '}
              <span className="text-amber-600">{drivers.context.exposure}</span>
            </div>
            <div>
              <span className="text-slate-500">Criticality:</span>{' '}
              <span className="text-rose-600">{drivers.context.criticality}</span>
            </div>
            <div>
              <span className="text-slate-500">Classification:</span>{' '}
              <span className="text-indigo-600">{drivers.context.classification}</span>
            </div>
            <div>
              <span className="text-slate-500">Data Lifetime:</span>{' '}
              <span className="text-emerald-600">{drivers.context.data_lifetime_years} years</span>
            </div>
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs uppercase tracking-wider font-semibold text-slate-500">
            Attributed Factors ({factors.length})
          </div>
          <span className="text-[11px] text-slate-500 font-mono">Server-side attribution (Rule 6.2)</span>
        </div>

        {factors.length === 0 ? (
          <div className="p-4 text-center border border-dashed border-slate-200 rounded text-xs text-slate-400 font-mono">
            No specific risk factors registered for this finding.
          </div>
        ) : (
          <div className="space-y-2">
            {factors.map((f, i) => {
              const isPositive = f.delta > 0;
              const trackColor =
                f.track === 'quantum'
                  ? 'border-indigo-200/60 bg-indigo-50 text-indigo-700'
                  : f.track === 'classical'
                  ? 'border-amber-200/60 bg-amber-50 text-amber-700'
                  : 'border-slate-200 bg-slate-50 text-slate-700';

              return (
                <div
                  key={f.rule_id || i}
                  className="p-3 rounded-lg border border-slate-200 bg-white hover:border-slate-300 transition"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${trackColor}`}>
                          {f.track}
                        </span>
                        <span className="font-mono text-xs font-semibold text-slate-800">
                          {f.rule_id}
                        </span>
                        <span className="text-xs text-slate-700 font-medium">
                          {f.title}
                        </span>
                      </div>

                      {f.factor_value && (
                        <div className="text-xs text-slate-500 font-mono">
                          Value:{' '}
                          <span className="text-slate-800 bg-slate-100 px-1 py-0.5 rounded">
                            {String(f.factor_value)}
                          </span>
                        </div>
                      )}

                      {f.evidence && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1 font-mono">
                          <FileCode className="w-3.5 h-3.5 text-slate-400" />
                          <span>{f.evidence}</span>
                        </div>
                      )}
                    </div>

                    <div className="text-right shrink-0">
                      <span
                        className={`inline-flex items-center text-xs font-mono font-bold px-2 py-0.5 rounded ${
                          isPositive
                            ? 'text-rose-700 bg-rose-50 border border-rose-200/60'
                            : 'text-emerald-700 bg-emerald-50 border border-emerald-200/60'
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
