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
        <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-700 leading-relaxed">
          <div className="font-bold text-slate-900 flex items-center gap-2 mb-1.5 text-xs">
            <Scale className="w-4 h-4 text-indigo-600" />
            <span>Deterministic Scoring Explanation (Rule 6.2)</span>
          </div>
          <p className="font-mono text-slate-800 text-xs leading-relaxed bg-white p-3 rounded-lg border border-slate-200">
            {explanation}
          </p>
        </div>
      )}

      {drivers && drivers.context && (
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono">
          <div className="text-slate-500 text-[11px] uppercase tracking-wider mb-2 font-bold">
            Context Drivers (+{drivers.context_points || 0} pts)
          </div>
          <div className="grid grid-cols-2 gap-3 text-slate-700">
            <div>
              <span className="text-slate-500 font-sans font-semibold">Exposure:</span>{' '}
              <span className="text-amber-800 font-bold">{drivers.context.exposure}</span>
            </div>
            <div>
              <span className="text-slate-500 font-sans font-semibold">Criticality:</span>{' '}
              <span className="text-rose-800 font-bold">{drivers.context.criticality}</span>
            </div>
            <div>
              <span className="text-slate-500 font-sans font-semibold">Classification:</span>{' '}
              <span className="text-indigo-800 font-bold">{drivers.context.classification}</span>
            </div>
            <div>
              <span className="text-slate-500 font-sans font-semibold">Data Lifetime:</span>{' '}
              <span className="text-emerald-800 font-bold">{drivers.context.data_lifetime_years} years</span>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wider font-bold text-slate-700">
            Attributed Factors ({factors.length})
          </div>
          <span className="text-[11px] text-slate-500 font-mono">Server-side attribution (Rule 6.2)</span>
        </div>

        {factors.length === 0 ? (
          <div className="p-6 text-center border border-dashed border-slate-300 rounded-xl text-xs text-slate-500 font-mono bg-slate-50">
            No specific risk factors registered for this finding.
          </div>
        ) : (
          <div className="space-y-2">
            {factors.map((f, i) => {
              const isPositive = f.delta > 0;
              const trackColor =
                f.track === 'quantum'
                  ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                  : f.track === 'classical'
                  ? 'border-amber-200 bg-amber-50 text-amber-800'
                  : 'border-slate-200 bg-slate-50 text-slate-700';

              return (
                <div
                  key={f.rule_id || i}
                  className="p-3.5 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition shadow-sm space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border uppercase ${trackColor}`}>
                          {f.track}
                        </span>
                        <span className="font-mono text-xs font-bold text-slate-900">
                          {f.rule_id}
                        </span>
                        <span className="text-xs text-slate-700 font-semibold truncate">
                          {f.title}
                        </span>
                      </div>

                      {f.factor_value && (
                        <div className="text-xs text-slate-500 font-mono">
                          Value:{' '}
                          <span className="text-slate-900 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">
                            {String(f.factor_value)}
                          </span>
                        </div>
                      )}

                      {f.evidence && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono truncate">
                          <FileCode className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          <span className="truncate">{f.evidence}</span>
                        </div>
                      )}
                    </div>

                    <div className="text-right shrink-0">
                      <span
                        className={`inline-flex items-center text-xs font-mono font-bold px-2.5 py-1 rounded-lg border ${
                          isPositive
                            ? 'text-rose-800 bg-rose-50 border-rose-300'
                            : 'text-emerald-800 bg-emerald-50 border-emerald-300'
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
