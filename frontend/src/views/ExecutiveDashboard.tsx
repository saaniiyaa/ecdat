import React, { useEffect, useState } from 'react';
import { useScan } from '../context/ScanContext';
import { ecdatApi } from '../api/endpoints';
import { RiskSummaryOut, CoverageOut, FindingOut } from '../types/api';
import { BandBadge, BAND_COLORS } from '../components/common/BandBadge';
import { QuantumBadge } from '../components/common/QuantumBadge';
import { CoverageHonestyBanner } from '../components/common/CoverageHonestyBanner';
import { FindingDetailDrawer } from '../components/findings/FindingDetailDrawer';
import {
  ShieldAlert,
  Layers,
  Clock,
  Atom,
  ArrowRight,
  TrendingDown,
  AlertTriangle,
  RefreshCw,
  FileCode,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';

interface ExecutiveDashboardProps {
  onNavigateToFindings: (band?: string) => void;
  onNavigateToMosca: () => void;
  onNavigateToMigration: () => void;
}

export const ExecutiveDashboard: React.FC<ExecutiveDashboardProps> = ({
  onNavigateToFindings,
  onNavigateToMosca,
  onNavigateToMigration,
}) => {
  const { activeScanId, activeScan } = useScan();
  const [summary, setSummary] = useState<RiskSummaryOut | null>(null);
  const [coverage, setCoverage] = useState<CoverageOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFinding, setSelectedFinding] = useState<FindingOut | null>(null);

  useEffect(() => {
    if (!activeScanId) {
      setSummary(null);
      setCoverage(null);
      setLoading(false);
      return;
    }

    let mounted = true;
    setLoading(true);
    setError(null);

    Promise.all([
      ecdatApi.getRiskSummary(activeScanId),
      ecdatApi.getScanCoverage(activeScanId).catch(() => ({ data: null })),
    ])
      .then(([summaryRes, coverageRes]) => {
        if (mounted) {
          setSummary(summaryRes.data);
          setCoverage(coverageRes.data);
          setLoading(false);
        }
      })
      .catch((err: any) => {
        if (mounted) {
          setError(err.message || 'Failed to load executive summary');
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [activeScanId]);

  if (!activeScanId) {
    return (
      <div className="max-w-4xl mx-auto p-12 text-center space-y-4">
        <ShieldAlert className="w-12 h-12 text-slate-500 mx-auto" />
        <h2 className="text-xl font-bold font-mono text-slate-200">No Scan Selected</h2>
        <p className="text-sm text-slate-400 font-mono">
          Select an existing scan from the header selector or launch a new discovery scan.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-12 text-center space-y-4">
        <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin mx-auto" />
        <p className="text-xs font-mono text-slate-400">Loading executive risk synthesis...</p>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="max-w-4xl mx-auto p-8 rounded-xl bg-rose-950/30 border border-rose-500/40 text-rose-300 font-mono text-xs">
        <span className="font-bold">Error:</span> {error || 'Could not load summary'}
      </div>
    );
  }

  const mosca = summary.mosca;
  const tracks = summary.tracks;
  const isMoscaBreached = mosca?.state === 'breached';

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
      {/* Page Title & Scan Metadata */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
              Executive Cryptographic Posture
            </h1>
            <span className="px-2.5 py-0.5 rounded-md bg-sky-500/10 text-sky-400 border border-sky-500/30 text-[11px] font-semibold uppercase">
              {summary.policy_pack_version || 'pp-2026.09'}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Target: <span className="text-slate-200 font-medium">{activeScan?.target_uri || activeScan?.name}</span> ·
            Scan ID: <span className="text-slate-400 font-mono">{summary.scan_id.substring(0, 8)}...</span> ·
            Engine: {activeScan?.engine_version || '1.0.0'}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={onNavigateToMosca}
            className="px-4 py-2 rounded-xl border border-slate-700/70 bg-slate-800/60 hover:bg-slate-700/60 text-xs font-medium text-slate-200 shadow-sm transition"
          >
            Simulate Mosca Horizons
          </button>
          <button
            onClick={onNavigateToMigration}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-medium text-xs shadow-md shadow-emerald-600/20 transition cursor-pointer"
          >
            PQC Migration Plan
          </button>
        </div>
      </div>

      {/* MANDATORY RULES 6.1 & 6.4: Coverage Honesty Banner */}
      <CoverageHonestyBanner
        coverage={coverage}
        coverageIndex={summary.coverage_index}
        unobservedPct={summary.unobserved_pct}
      />

      {/* Top 4 KPI Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Findings */}
        <div
          onClick={() => onNavigateToFindings()}
          className="p-5 rounded-2xl bg-slate-800/40 border border-slate-700/60 hover:border-slate-600/80 transition cursor-pointer group shadow-sm backdrop-blur-sm"
        >
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Cryptographic Findings</span>
            <Layers className="w-4 h-4 text-sky-400 group-hover:scale-110 transition" />
          </div>
          <div className="text-3xl font-bold text-slate-100 mt-2 tracking-tight">
            {summary.total_findings}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Across {summary.total_assets} unique cryptographic assets
          </p>
        </div>

        {/* Mosca Horizon Status - Refined Executive Status Badge (No scary BREACHED banner) */}
        <div
          onClick={onNavigateToMosca}
          className={`p-5 rounded-2xl border transition cursor-pointer group shadow-sm backdrop-blur-sm ${
            isMoscaBreached
              ? 'bg-amber-500/10 border-amber-500/30 hover:border-amber-500/50'
              : 'bg-emerald-500/10 border-emerald-500/30 hover:border-emerald-500/50'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-medium">
            <span className={isMoscaBreached ? 'text-amber-300' : 'text-emerald-300'}>
              Mosca Horizon (X + Y &gt; Z)
            </span>
            <Clock
              className={`w-4 h-4 ${
                isMoscaBreached ? 'text-amber-400' : 'text-emerald-400'
              } group-hover:scale-110 transition`}
            />
          </div>
          <div
            className={`text-lg font-bold mt-2 leading-snug ${
              isMoscaBreached ? 'text-amber-300' : 'text-emerald-400'
            }`}
          >
            {isMoscaBreached
              ? 'Action Required: Migration Recommended'
              : 'Within Protected Horizon'}
          </div>
          <p className="text-xs text-slate-400 mt-1 line-clamp-2">
            {isMoscaBreached
              ? 'Data confidentiality shelf-life extends into the projected quantum threat horizon.'
              : `Margin: +${mosca?.margin_years}y · Stable security window`}
          </p>
          <div className="mt-2 text-[11px] text-slate-400 font-mono">
            Margin: <span className="font-semibold text-slate-200">{mosca?.margin_years}y</span> · Start by{' '}
            <span className="font-semibold text-slate-200">{mosca?.must_start_by}</span>
          </div>
        </div>

        {/* Quantum Track Critical */}
        <div
          onClick={() => onNavigateToFindings('critical')}
          className="p-5 rounded-2xl bg-slate-800/40 border border-slate-700/60 hover:border-slate-600/80 transition cursor-pointer group shadow-sm backdrop-blur-sm"
        >
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Quantum-Critical</span>
            <Atom className="w-4 h-4 text-indigo-400 group-hover:scale-110 transition" />
          </div>
          <div className="text-3xl font-bold text-indigo-400 mt-2 tracking-tight">
            {tracks.quantum_critical}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {tracks.quantum_vulnerable_assets} Shor-vulnerable assets detected
          </p>
        </div>

        {/* Post-Quantum Adopted */}
        <div
          onClick={() => onNavigateToMigration()}
          className="p-5 rounded-2xl bg-slate-800/40 border border-slate-700/60 hover:border-slate-600/80 transition cursor-pointer group shadow-sm backdrop-blur-sm"
        >
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>PQ Adopted</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition" />
          </div>
          <div className="text-3xl font-bold text-emerald-400 mt-2 tracking-tight">
            {tracks.post_quantum_adopted}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            FIPS 203/204/205 or hybrid implementation
          </p>
        </div>
      </div>

      {/* Dual Section: Band Ramp Donut/Cards & Dual Track Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Severity Bands Distribution */}
        <div className="p-6 rounded-2xl bg-slate-800/40 border border-slate-700/60 shadow-sm backdrop-blur-sm space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-200">
                Severity Bands Distribution
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Distribution across standard risk thresholds (Rule 5.4 Ramp)
              </p>
            </div>
            <span className="text-xs text-slate-400 font-mono">Rule 5.4</span>
          </div>

          <div className="space-y-3">
            {summary.by_band.map(({ band, count }) => {
              const theme = BAND_COLORS[band.toLowerCase()] || BAND_COLORS.informational;
              const pct = summary.total_findings > 0 ? (count / summary.total_findings) * 100 : 0;

              return (
                <div
                  key={band}
                  onClick={() => onNavigateToFindings(band)}
                  className="p-3.5 rounded-xl bg-slate-900/50 border border-slate-700/50 hover:border-slate-600 transition cursor-pointer"
                >
                  <div className="flex items-center justify-between text-xs mb-2">
                    <BandBadge band={band} size="sm" />
                    <span className="font-semibold text-slate-200">
                      {count} <span className="text-slate-400 font-normal">({pct.toFixed(1)}%)</span>
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-2 rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, backgroundColor: theme.hex }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Rule 6.3: Dual Track Comparison */}
        <div className="p-6 rounded-2xl bg-slate-800/40 border border-slate-700/60 shadow-sm backdrop-blur-sm space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-200">
                Dual-Track Risk Architecture
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Evaluates classical security for immediate risks alongside post-quantum resistance.
              </p>
            </div>
            <span className="text-xs text-slate-400 font-mono">Rule 6.3</span>
          </div>

          <p className="text-xs text-slate-300 font-sans leading-relaxed">
            Classical vulnerabilities (weak keys, deprecated ciphers) threaten immediate integrity today. Quantum vulnerabilities (RSA, ECC, Diffie-Hellman) threaten harvest-now-decrypt-later data across the Mosca horizon.
          </p>

          <div className="space-y-4 text-xs">
            {/* Classical Bar */}
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-700/50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-amber-400 font-medium flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4" />
                  Classical Track Criticalities
                </span>
                <span className="font-semibold text-slate-100">{tracks.classical_critical} findings</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2.5">
                <div
                  className="bg-amber-500 h-2.5 rounded-full"
                  style={{
                    width: `${Math.min(100, (tracks.classical_critical / (summary.total_findings || 1)) * 100 * 2)}%`,
                  }}
                />
              </div>
              <div className="text-[11px] text-slate-400">
                Action horizon: Immediate compliance / patch cycle
              </div>
            </div>

            {/* Quantum Bar */}
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-700/50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-indigo-400 font-medium flex items-center gap-1.5">
                  <Atom className="w-4 h-4" />
                  Quantum Track Criticalities (Shor Vulnerable)
                </span>
                <span className="font-semibold text-slate-100">{tracks.quantum_critical} findings</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2.5">
                <div
                  className="bg-indigo-500 h-2.5 rounded-full"
                  style={{
                    width: `${Math.min(100, (tracks.quantum_critical / (summary.total_findings || 1)) * 100 * 2)}%`,
                  }}
                />
              </div>
              <div className="text-[11px] text-slate-400">
                Action horizon: Must migrate before CRQC horizon ({mosca?.must_start_by})
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Top Cryptographic Risks Table */}
      <div className="p-6 rounded-2xl bg-slate-800/40 border border-slate-700/60 shadow-sm backdrop-blur-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-200">
              Top Cryptographic Risk Vector Highlights
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Click any finding row to inspect server-side factor attribution (Rule 6.2)
            </p>
          </div>
          <button
            onClick={() => onNavigateToFindings()}
            className="text-xs font-medium text-sky-400 hover:text-sky-300 flex items-center gap-1.5 transition"
          >
            <span>View All ({summary.total_findings})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-700/50">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-700/50 bg-slate-800/60 text-slate-400 uppercase tracking-wider text-[11px] font-medium">
                <th className="py-3 px-4">Band</th>
                <th className="py-3 px-4">Algorithm</th>
                <th className="py-3 px-4">Location & Surface</th>
                <th className="py-3 px-4 text-right">Quantum Risk</th>
                <th className="py-3 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {summary.top_risks.map((item, idx) => (
                <tr
                  key={item.id || idx}
                  onClick={() => setSelectedFinding(item)}
                  className="hover:bg-slate-700/20 cursor-pointer transition"
                >
                  <td className="py-3.5 px-4">
                    {item.risk && <BandBadge band={item.risk.band} size="sm" />}
                  </td>
                  <td className="py-3.5 px-4 font-semibold text-slate-200">
                    {item.asset?.canonical_name || item.symbol || 'Cryptographic Finding'}
                  </td>
                  <td className="py-3.5 px-4 text-slate-400 max-w-md truncate">
                    <span className="text-slate-300 font-mono text-[11px]">
                      {item.file_path}
                      {item.line_start ? `:${item.line_start}` : ''}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right font-semibold text-indigo-400 font-mono">
                    {item.risk?.quantum_risk ?? 0}/100
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 font-medium text-xs transition">
                      Inspect
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Drawer */}
      <FindingDetailDrawer
        scanId={summary.scan_id}
        finding={selectedFinding}
        onClose={() => setSelectedFinding(null)}
      />
    </div>
  );
};
