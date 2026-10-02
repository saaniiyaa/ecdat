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
        <ShieldAlert className="w-12 h-12 text-slate-400 mx-auto" />
        <h2 className="text-xl font-bold font-mono text-slate-800">No Scan Selected</h2>
        <p className="text-sm text-slate-500 font-mono">
          Select an existing scan from the header selector or launch a new discovery scan.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-12 text-center space-y-4">
        <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
        <p className="text-xs font-mono text-slate-500">Loading executive risk synthesis...</p>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="max-w-4xl mx-auto p-8 rounded-xl bg-rose-50 border border-rose-200/60 text-rose-700 font-mono text-xs">
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Executive Cryptographic Posture
            </h1>
            <span className="px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-600 border border-indigo-200/60 text-[11px] font-semibold uppercase">
              {summary.policy_pack_version || 'pp-2026.09'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Target: <span className="text-slate-800 font-medium">{activeScan?.target_uri || activeScan?.name}</span> ·
            Scan ID: <span className="text-slate-500 font-mono">{summary.scan_id.substring(0, 8)}...</span> ·
            Engine: {activeScan?.engine_version || '1.0.0'}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={onNavigateToMosca}
            className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-800 shadow-sm transition"
          >
            Simulate Mosca Horizons
          </button>
          <button
            onClick={onNavigateToMigration}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs shadow-sm transition cursor-pointer"
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

      {/* Estate Cryptographic Health Score */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-indigo-600" />
              Estate Cryptographic Health
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Composite post-quantum readiness assessment</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-3xl font-bold text-indigo-600 tracking-tight">
                {Math.max(0, 100 - (summary.total_findings > 0 ? Math.round((tracks.quantum_critical / summary.total_findings) * 100) : 0))}
                <span className="text-lg text-slate-400 font-normal">/100</span>
              </div>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                tracks.quantum_critical === 0
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                  : tracks.quantum_critical <= 5
                  ? 'bg-amber-50 text-amber-700 border border-amber-200/60'
                  : 'bg-rose-50 text-rose-700 border border-rose-200/60'
              }`}>
                {tracks.quantum_critical === 0 ? 'Excellent' : tracks.quantum_critical <= 5 ? 'Good – Migration Advised' : 'Action Required'}
              </span>
            </div>
          </div>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
          <div
            className={`h-3 rounded-full transition-all duration-500 ${
              tracks.quantum_critical === 0 ? 'bg-emerald-500' : tracks.quantum_critical <= 5 ? 'bg-amber-500' : 'bg-rose-500'
            }`}
            style={{ width: `${Math.max(0, 100 - (summary.total_findings > 0 ? Math.round((tracks.quantum_critical / summary.total_findings) * 100) : 0))}%` }}
          />
        </div>
        <div className="flex items-center gap-6 mt-3 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Safe: {tracks.post_quantum_adopted} assets
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            Advisory: {tracks.quantum_vulnerable_assets - tracks.quantum_critical} assets
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            Critical: {tracks.quantum_critical} assets
          </span>
        </div>
      </div>

      {/* Top 4 KPI Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Findings */}
        <div
          onClick={() => onNavigateToFindings()}
          className="p-5 rounded-2xl bg-white border border-slate-200/80 hover:border-slate-300 transition cursor-pointer group shadow-sm"
        >
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Cryptographic Findings</span>
            <Layers className="w-4 h-4 text-indigo-600 group-hover:scale-110 transition" />
          </div>
          <div className="text-3xl font-bold text-slate-900 mt-2 tracking-tight">
            {summary.total_findings}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Across {summary.total_assets} unique cryptographic assets
          </p>
        </div>

        {/* Mosca Horizon Status - Refined Executive Status Badge (No scary BREACHED banner) */}
        <div
          onClick={onNavigateToMosca}
          className={`p-5 rounded-2xl border transition cursor-pointer group shadow-sm ${
            isMoscaBreached
              ? 'bg-amber-50 border-amber-200/60 hover:border-amber-300'
              : 'bg-emerald-50 border-emerald-200/60 hover:border-emerald-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-medium">
            <span className={isMoscaBreached ? 'text-amber-700' : 'text-emerald-700'}>
              Mosca Horizon (X + Y &gt; Z)
            </span>
            <Clock
              className={`w-4 h-4 ${
                isMoscaBreached ? 'text-amber-700' : 'text-emerald-700'
              } group-hover:scale-110 transition`}
            />
          </div>
          <div
            className={`text-lg font-bold mt-2 leading-snug ${
              isMoscaBreached ? 'text-amber-700' : 'text-emerald-700'
            }`}
          >
            {isMoscaBreached
              ? 'Post-Quantum Migration Advisory'
              : 'Within Protected Horizon'}
          </div>
          <p className="text-xs text-slate-500 mt-1 line-clamp-2">
            {isMoscaBreached
              ? 'Data shelf-life extends past projected quantum arrival. Remediation roadmap generated.'
              : `Margin: +${mosca?.margin_years}y · Stable security window`}
          </p>
          <div className="mt-2 text-[11px] text-slate-500 font-mono">
            Margin: <span className="font-semibold text-slate-800">{mosca?.margin_years}y</span> · Start by{' '}
            <span className="font-semibold text-slate-800">{mosca?.must_start_by}</span>
          </div>
        </div>

        {/* Quantum Track Critical */}
        <div
          onClick={() => onNavigateToFindings('critical')}
          className="p-5 rounded-2xl bg-white border border-slate-200/80 hover:border-slate-300 transition cursor-pointer group shadow-sm"
        >
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Quantum-Critical</span>
            <Atom className="w-4 h-4 text-indigo-700 group-hover:scale-110 transition" />
          </div>
          <div className="text-3xl font-bold text-indigo-700 mt-2 tracking-tight">
            {tracks.quantum_critical}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {tracks.quantum_vulnerable_assets} Shor-vulnerable assets detected
          </p>
        </div>

        {/* Post-Quantum Adopted */}
        <div
          onClick={() => onNavigateToMigration()}
          className="p-5 rounded-2xl bg-white border border-slate-200/80 hover:border-slate-300 transition cursor-pointer group shadow-sm"
        >
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>PQ Adopted</span>
            <ShieldCheck className="w-4 h-4 text-emerald-700 group-hover:scale-110 transition" />
          </div>
          <div className="text-3xl font-bold text-emerald-700 mt-2 tracking-tight">
            {tracks.post_quantum_adopted}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            FIPS 203/204/205 or hybrid implementation
          </p>
        </div>
      </div>

      {/* Dual Section: Band Ramp Donut/Cards & Dual Track Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Severity Bands Distribution */}
        <div className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-sm space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-800">
                Severity Bands Distribution
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Distribution across standard risk thresholds (Rule 5.4 Ramp)
              </p>
            </div>
            <span className="text-xs text-slate-500 font-mono">Rule 5.4</span>
          </div>

          <div className="space-y-3">
            {summary.by_band.map(({ band, count }) => {
              const theme = BAND_COLORS[band.toLowerCase()] || BAND_COLORS.informational;
              const pct = summary.total_findings > 0 ? (count / summary.total_findings) * 100 : 0;

              return (
                <div
                  key={band}
                  onClick={() => onNavigateToFindings(band)}
                  className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-300 transition cursor-pointer"
                >
                  <div className="flex items-center justify-between text-xs mb-2">
                    <BandBadge band={band} size="sm" />
                    <span className="font-semibold text-slate-800">
                      {count} <span className="text-slate-500 font-normal">({pct.toFixed(1)}%)</span>
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
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
        <div className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-sm space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-800">
                Dual-Track Risk Architecture
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Evaluates classical security for immediate risks alongside post-quantum resistance.
              </p>
            </div>
            <span className="text-xs text-slate-500 font-mono">Rule 6.3</span>
          </div>

          <p className="text-xs text-slate-700 font-sans leading-relaxed">
            Classical vulnerabilities (weak keys, deprecated ciphers) threaten immediate integrity today. Quantum vulnerabilities (RSA, ECC, Diffie-Hellman) threaten harvest-now-decrypt-later data across the Mosca horizon.
          </p>

          <div className="space-y-4 text-xs">
            {/* Classical Bar */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-amber-700 font-medium flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4" />
                  Classical Track Criticalities
                </span>
                <span className="font-semibold text-slate-900">{tracks.classical_critical} findings</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2.5">
                <div
                  className="bg-amber-500 h-2.5 rounded-full"
                  style={{
                    width: `${Math.min(100, (tracks.classical_critical / (summary.total_findings || 1)) * 100 * 2)}%`,
                  }}
                />
              </div>
              <div className="text-[11px] text-slate-500">
                Action horizon: Immediate compliance / patch cycle
              </div>
            </div>

            {/* Quantum Bar */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-indigo-700 font-medium flex items-center gap-1.5">
                  <Atom className="w-4 h-4" />
                  Quantum Track Criticalities (Shor Vulnerable)
                </span>
                <span className="font-semibold text-slate-900">{tracks.quantum_critical} findings</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2.5">
                <div
                  className="bg-indigo-500 h-2.5 rounded-full"
                  style={{
                    width: `${Math.min(100, (tracks.quantum_critical / (summary.total_findings || 1)) * 100 * 2)}%`,
                  }}
                />
              </div>
              <div className="text-[11px] text-slate-500">
                Action horizon: Must migrate before CRQC horizon ({mosca?.must_start_by})
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Top Cryptographic Risks Table */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-800">
              Top Cryptographic Risk Vector Highlights
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Click any finding row to inspect server-side factor attribution (Rule 6.2)
            </p>
          </div>
          <button
            onClick={() => onNavigateToFindings()}
            className="text-xs font-medium text-indigo-600 hover:text-indigo-700 flex items-center gap-1.5 transition"
          >
            <span>View All ({summary.total_findings})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200/80">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-500 uppercase tracking-wider text-[11px] font-medium">
                <th className="py-3 px-4">Band</th>
                <th className="py-3 px-4">Algorithm</th>
                <th className="py-3 px-4">Location & Surface</th>
                <th className="py-3 px-4 text-right">Quantum Risk</th>
                <th className="py-3 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {summary.top_risks.map((item, idx) => (
                <tr
                  key={item.id || idx}
                  onClick={() => setSelectedFinding(item)}
                  className="hover:bg-slate-50/60 cursor-pointer transition"
                >
                  <td className="py-3.5 px-4">
                    {item.risk && <BandBadge band={item.risk.band} size="sm" />}
                  </td>
                  <td className="py-3.5 px-4 font-semibold text-slate-800">
                    {item.asset?.canonical_name || item.symbol || 'Cryptographic Finding'}
                  </td>
                  <td className="py-3.5 px-4 text-slate-500 max-w-md truncate">
                    <span className="text-slate-700 font-mono text-[11px]">
                      {item.file_path}
                      {item.line_start ? `:${item.line_start}` : ''}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right font-semibold text-indigo-600 font-mono">
                    {item.risk?.quantum_risk ?? 0}/100
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 font-medium text-xs transition">
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
