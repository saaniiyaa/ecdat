import React, { useEffect, useState } from 'react';
import { ecdatApi } from '../../api/endpoints';
import { AccuracyCorpus, AccuracyReport, AccuracyTotals } from '../../types/api';
import { FlaskConical, AlertTriangle, ExternalLink, Loader2 } from 'lucide-react';

/**
 * The measured accuracy of the detector, shown next to the coverage meter.
 *
 * This panel exists because the number is the differentiator. Any competing
 * crypto-posture tool will claim complete inventory coverage. Ours can say what
 * that claim is worth, because the figures here were measured against code we
 * did not write, and the misses are printed underneath the hits.
 *
 * Three rules this component obeys:
 *  - It fetches. It never holds a literal precision or recall value, because a
 *    number typed into a component is a number that eventually disagrees with
 *    the backend it describes.
 *  - It computes no risk. The aggregate is a plain sum of the server's own
 *    counts; no band, no threshold, no classification.
 *  - It shows the gaps. A precision figure with the known misses hidden is a
 *    marketing number, not a measurement.
 */

const fmt = (n: number) => (n == null || Number.isNaN(n) ? '–' : n.toFixed(3));

/** Sum the server's counts. This is addition, not analysis. */
function aggregate(corpora: AccuracyCorpus[]): AccuracyTotals | null {
  const tp = corpora.reduce((a, c) => a + (c.totals?.tp || 0), 0);
  const fp = corpora.reduce((a, c) => a + (c.totals?.fp || 0), 0);
  const fn = corpora.reduce((a, c) => a + (c.totals?.fn || 0), 0);
  if (!corpora.length) return null;
  return {
    tp, fp, fn,
    precision: tp + fp ? tp / (tp + fp) : 0,
    recall: tp + fn ? tp / (tp + fn) : 0,
  };
}

const MetricBar: React.FC<{ label: string; value: number; tone: string }> = ({ label, value, tone }) => (
  <div className="space-y-1">
    <div className="flex items-center justify-between text-[11px] font-mono">
      <span className="text-slate-400">{label}</span>
      <span className={`font-bold ${tone}`}>{fmt(value)}</span>
    </div>
    <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
      <div
        className={`h-full rounded-full ${tone.replace('text-', 'bg-')}`}
        style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
      />
    </div>
  </div>
);

export const AccuracyPanel: React.FC = () => {
  const [report, setReport] = useState<AccuracyReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    ecdatApi
      .getAccuracy()
      .then((r) => { if (!cancelled) setReport(r.data); })
      .catch((e) => { if (!cancelled) setError(e.message || 'Could not load accuracy report'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 flex items-center gap-3 font-mono text-xs text-slate-400">
        <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
        Loading measured accuracy…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-5 font-mono text-xs text-amber-300">
        Accuracy report unavailable: {error}
      </div>
    );
  }

  if (!report || !report.available) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 font-mono text-xs text-slate-400 space-y-1">
        <div className="flex items-center gap-2 text-slate-300 font-semibold">
          <AlertTriangle className="w-4 h-4 text-amber-400" /> No measured accuracy on this deployment
        </div>
        <p className="text-slate-500">
          {report?.reason || 'The accuracy benchmark has not been run here.'}{' '}
          Run <span className="text-cyan-400">python scripts/accuracy_real.py</span> to generate it.
        </p>
      </div>
    );
  }

  const corpora: AccuracyCorpus[] = [
    ...(report.independent ? [report.independent] : []),
    ...(report.multilang || []),
  ];
  const agg = aggregate(corpora);
  const labelled = corpora.reduce((a, c) => a + (c.labelled_files || 0), 0);
  const gaps = report.independent?.known_detector_gaps || [];

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
      <header className="px-5 py-3.5 border-b border-slate-800 bg-slate-950/50 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold font-mono text-slate-100 flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-emerald-400" />
            Measured detector accuracy
          </h3>
          <p className="text-[11px] text-slate-500 font-mono mt-0.5">
            Hand-labelled, third-party source. Not our own fixtures.
            {report.generated_at && ` Measured ${new Date(report.generated_at).toISOString().slice(0, 10)}.`}
          </p>
        </div>
        {agg && (
          <div className="text-right shrink-0">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-mono">Aggregate</div>
            <div className="text-sm font-bold font-mono text-emerald-400">
              P {fmt(agg.precision)} · R {fmt(agg.recall)}
            </div>
            <div className="text-[10px] text-slate-500 font-mono">
              {agg.tp} TP · {agg.fp} FP · {agg.fn} FN over {labelled} files
            </div>
          </div>
        )}
      </header>

      <div className="p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {corpora.map((c) => (
            <div key={c.corpus} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3.5 space-y-2.5">
              <div>
                <div className="text-xs font-bold font-mono text-slate-200 truncate" title={c.corpus}>
                  {c.corpus}
                </div>
                <div className="text-[10px] text-slate-500 font-mono">
                  {c.language || 'python'} · {c.labelled_files} labelled file{c.labelled_files === 1 ? '' : 's'}
                </div>
              </div>
              <MetricBar label="Precision" value={c.totals.precision} tone={c.totals.precision >= 0.9 ? 'text-emerald-400' : 'text-amber-400'} />
              <MetricBar label="Recall" value={c.totals.recall} tone={c.totals.recall >= 0.9 ? 'text-emerald-400' : 'text-amber-400'} />
              <div className="text-[10px] text-slate-500 font-mono pt-0.5">
                {c.totals.tp} TP · {c.totals.fp} FP · {c.totals.fn} FN
              </div>
            </div>
          ))}
        </div>

        {/* What these numbers do not cover. A precision figure with its limits
            removed is a marketing number, not a measurement. */}
        <div className="rounded-lg border border-amber-500/30 bg-amber-950/10 p-3.5 space-y-2">
          <div className="text-[11px] font-bold font-mono text-amber-300 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> What these numbers do not cover
          </div>
          <ul className="text-[11px] text-slate-400 font-mono space-y-1 list-disc list-inside">
            <li>One project per language, and only the non-test source of each.</li>
            <li>No binary, container, or certificate corpus is labelled yet, so no figure is claimed for them.</li>
            <li>Precision is measured per finding; recall is measured per labelled family, so the two are not directly comparable.</li>
          </ul>
        </div>

        {gaps.length > 0 && (
          <details className="rounded-lg border border-slate-800 bg-slate-950/50">
            <summary className="px-3.5 py-2.5 cursor-pointer text-[11px] font-mono font-bold text-slate-300 hover:text-white">
              Known detector gaps ({gaps.length}) — families we still miss
            </summary>
            <ul className="px-4 pb-3 space-y-2.5">
              {gaps.map((g, i) => (
                <li key={i} className="text-[11px] font-mono">
                  <div className="text-slate-200">
                    <span className="text-cyan-400">{g.location}</span> — {g.missed}
                  </div>
                  <div className="text-slate-500 mt-0.5">{g.why}</div>
                </li>
              ))}
            </ul>
          </details>
        )}

        {/* The fixture regression is a real check and not independent evidence:
            we wrote both the fixture and the expectations, so it can only
            catch us contradicting ourselves. Saying so costs one line and
            keeps the headline number honest. */}
        {report.fixture_regression?.available && (
          <div className="text-[10px] text-slate-600 font-mono border-l-2 border-slate-800 pl-3">
            Separately, {report.fixture_regression.labelled_files} self-authored fixture files
            {' '}({Math.round((report.fixture_regression.agreement_rate || 0) * 100)}% agreement) act as a
            self-consistency regression check. We wrote both sides, so it is not counted in the
            figures above and is not evidence of detection quality.
          </div>
        )}

        <div className="text-[10px] text-slate-600 font-mono flex items-center gap-1.5">
          <ExternalLink className="w-3 h-3" />
          Reproduce: <span className="text-slate-400">python scripts/accuracy_gate.py</span> ·
          methodology and corpus provenance in <span className="text-slate-400">docs/ACCURACY.md</span> and{' '}
          <span className="text-slate-400">fixtures/README.md</span>
        </div>
      </div>
    </section>
  );
};
