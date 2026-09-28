import React from 'react';
import { Globe2, Play, Loader2, CheckCircle2, XCircle, ArrowRight } from 'lucide-react';

/**
 * Scan the real corpora, side by side.
 *
 * The synthetic demo estate exists to make the UI look populated. It cannot
 * demonstrate that the detector works, because we wrote both the fixture and
 * the expectations. These three trees were cloned from upstream projects and
 * hand-labelled by a reviewer who had not seen the detector's output.
 *
 * The panel runs them in sequence and reports the finding count each produced.
 * Every one of those findings is clickable, so a claim on the dashboard about
 * measured precision can be audited in the same sitting it is read.
 */

const CORPORA = [
  { path: 'fixtures/pyjwt_repo', corpus: 'PyJWT 2.8.0', lang: 'Python', note: 'JOSE, HMAC, RSA, EC' },
  { path: 'fixtures/golang_jwt_repo', corpus: 'golang-jwt/jwt v5', lang: 'Go', note: 'Signing method registry' },
  { path: 'fixtures/java_jwt_repo', corpus: 'auth0/java-jwt', lang: 'Java', note: 'JCA providers, JWKSet' },
];

interface Props {
  corpusRun: Record<string, string>;
  corpusBusy: boolean;
  corpusTotals: Record<string, number>;
  onRun: () => void;
  onPick: (path: string, corpus: string) => void;
}

export const RealCorpusPanel: React.FC<Props> = ({ corpusRun, corpusBusy, corpusTotals, onRun, onPick }) => {
  const done = Object.keys(corpusTotals).length;

  return (
    <section className="rounded-xl border border-emerald-500/30 bg-slate-900/70 overflow-hidden">
      <header className="px-4 py-3 border-b border-slate-800 bg-slate-950/50 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold font-mono text-slate-100 flex items-center gap-2">
            <Globe2 className="w-4 h-4 text-emerald-400" />
            Real-world corpora
          </h3>
          <p className="text-[11px] text-slate-500 font-mono mt-0.5">
            Third-party source, cloned unmodified. These are the same trees the
            accuracy panel is measured against — the counts below are the run,
            not a stored number.
          </p>
        </div>
        <button
          onClick={onRun}
          disabled={corpusBusy}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-950/30 text-emerald-300 hover:bg-emerald-900/40 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-mono font-medium transition"
        >
          {corpusBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
          <span>{corpusBusy ? `Scanning ${done + 1} of ${CORPORA.length}…` : 'Scan all three'}</span>
        </button>
      </header>

      <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        {CORPORA.map((c) => {
          const status = corpusRun[c.path];
          const total = corpusTotals[c.path];
          return (
            <div
              key={c.path}
              className="rounded-lg border border-slate-800 bg-slate-950/60 p-3.5 space-y-2 hover:border-slate-700 transition"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-bold font-mono text-slate-200 truncate" title={c.corpus}>
                    {c.corpus}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    {c.lang} · {c.note}
                  </div>
                </div>
                {status === 'running' && <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin shrink-0" />}
                {status === 'done' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                {status && status !== 'running' && status !== 'done' && (
                  <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                )}
              </div>

              {total !== undefined ? (
                <div className="text-lg font-bold font-mono text-emerald-400">{total}</div>
              ) : status && status !== 'running' && status !== 'done' ? (
                <div className="text-[11px] font-mono text-rose-400 break-words">{status}</div>
              ) : (
                <div className="text-[11px] font-mono text-slate-600">—</div>
              )}
              <div className="text-[10px] text-slate-500 font-mono">
                {total !== undefined ? 'findings' : status === 'running' ? 'scanning…' : 'not scanned yet'}
              </div>

              <button
                onClick={() => onPick(c.path, c.corpus)}
                className="w-full mt-1 inline-flex items-center justify-center gap-1 px-2 py-1 rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-[11px] font-mono transition"
              >
                <span>Open in launcher</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
};
