import React, { useEffect, useState } from 'react';
import { useScan } from '../context/ScanContext';
import { ecdatApi } from '../api/endpoints';
import { RiskSummaryOut, CoverageOut, FindingOut } from '../types/api';
import { BandBadge, BAND_COLORS } from '../components/common/BandBadge';
import { QuantumBadge } from '../components/common/QuantumBadge';
import { CoverageHonestyBanner } from '../components/common/CoverageHonestyBanner';
import { FindingDetailDrawer } from '../components/findings/FindingDetailDrawer';
import { HelpTooltip } from '../components/common/HelpTooltip';
import {
  Layers,
  Clock,
  Atom,
  ArrowRight,
  TrendingUp,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Award,
  Key,
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
        <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200 flex items-center justify-center mx-auto text-indigo-600 shadow-sm">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">No Scan Target Selected</h2>
        <p className="text-sm text-slate-600 max-w-md mx-auto">
          Select a registered scan target from the top bar or launch a new discovery scan across your estate.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-12 text-center space-y-4">
        <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
        <p className="text-sm font-semibold text-slate-600">Loading cryptographic command center synthesis...</p>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="max-w-4xl mx-auto p-8 rounded-2xl bg-rose-50 border border-rose-300 text-rose-800 text-xs font-mono">
        <span className="font-bold">Error loading summary:</span> {error || 'Could not load summary'}
      </div>
    );
  }

  const mosca = summary.mosca;
  const tracks = summary.tracks;
  const isMoscaBreached = mosca?.state === 'breached';

  // Calculate Health Score
  const healthScore = Math.max(
    0,
    100 -
      (summary.total_findings > 0
        ? Math.round((tracks.quantum_critical / summary.total_findings) * 100)
        : 0)
  );

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8 animate-in fade-in duration-200">
      {/* Page Title & Scan Metadata */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Executive Cryptographic Posture
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-bold font-mono">
              {summary.policy_pack_version || 'pp-2026.09'}
            </span>
          </div>
          <p className="text-xs text-slate-600 mt-1 font-mono">
            Target: <span className="text-slate-900 font-semibold">{activeScan?.target_uri || activeScan?.name}</span> ·
            Scan ID: <span className="text-slate-500">{summary.scan_id.substring(0, 8)}...</span> ·
            Engine: {activeScan?.engine_version || '1.0.0'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onNavigateToMosca}
            className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-800 shadow-sm transition cursor-pointer"
          >
            Simulate Mosca Horizons
          </button>
          <button
            onClick={onNavigateToMigration}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm transition cursor-pointer"
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

      {/* Estate Cryptographic Health Score Card */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-indigo-600" />
              <h2 className="text-base font-bold text-slate-900">
                Estate Cryptographic Posture Score
              </h2>
              <HelpTooltip
                title="Cryptographic Health Gauge"
                content="Deterministic score evaluating quantum and classical exposure. Accounts for Shor-vulnerable keys, legacy ciphers, and NIST FIPS 203/204/205 adoption."
              />
            </div>
            <p className="text-xs text-slate-600 mt-0.5">
              Automated evaluation of post-quantum readiness across scanned inventory
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-3xl font-bold font-mono text-slate-900 tracking-tight">
                {healthScore}
                <span className="text-lg text-slate-500 font-normal font-sans">/100</span>
              </div>
              <span
                className={`inline-block text-xs font-bold px-2.5 py-0.5 rounded-full border ${
                  healthScore >= 90
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : healthScore >= 70
                    ? 'bg-amber-50 text-amber-900 border-amber-300'
                    : 'bg-rose-50 text-rose-900 border-rose-300'
                }`}
              >
                {healthScore >= 90
                  ? 'Optimal – PQC Standard'
                  : healthScore >= 70
                  ? 'Good – Migration Advised'
                  : 'Action Required – High Exposure'}
              </span>
            </div>
          </div>
        </div>

        {/* Progress Gauge */}
        <div className="w-full bg-slate-100 rounded-full h-3.5 overflow-hidden border border-slate-200">
          <div
            className={`h-3.5 rounded-full transition-all duration-700 ${
              healthScore >= 90
                ? 'bg-emerald-500'
                : healthScore >= 70
                ? 'bg-amber-500'
                : 'bg-rose-500'
            }`}
            style={{ width: `${healthScore}%` }}
          />
        </div>

        {/* Indicators */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 pt-3 border-t border-slate-200 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
            <span>
              Safe / PQ Standard: <strong className="text-slate-900">{tracks.post_quantum_adopted}</strong> assets
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
            <span>
              Horizon Advisory: <strong className="text-slate-900">{Math.max(0, tracks.quantum_vulnerable_assets - tracks.quantum_critical)}</strong> assets
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
            <span>
              Quantum Critical: <strong className="text-rose-700 font-bold">{tracks.quantum_critical}</strong> assets
            </span>
          </div>
        </div>
      </div>

      {/* Top 4 KPI Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Findings */}
        <div
          onClick={() => onNavigateToFindings()}
          className="bg-white border-t-4 border-t-indigo-600 border-x border-b border-slate-200 rounded-2xl shadow-sm p-5 hover:shadow-md transition cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-600 text-xs font-bold">
            <span>Cryptographic Findings</span>
            <Layers className="w-4 h-4 text-indigo-600 group-hover:scale-110 transition" />
          </div>
          <div className="text-3xl font-bold font-mono text-slate-900 mt-2 tracking-tight">
            {summary.total_findings}
          </div>
          <p className="text-xs text-slate-600 mt-1">
            Across <strong className="text-slate-900">{summary.total_assets}</strong> unique cryptographic assets
          </p>
        </div>

        {/* Mosca Horizon KPI */}
        <div
          onClick={onNavigateToMosca}
          className="bg-amber-50/90 border border-amber-300 text-amber-950 rounded-2xl shadow-sm p-5 hover:shadow-md transition cursor-pointer group"
        >
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="text-amber-900 font-bold">
              Mosca Horizon (X + Y &gt; Z)
            </span>
            <Clock className="w-4 h-4 text-amber-700 group-hover:scale-110 transition" />
          </div>
          <div className="text-base font-bold mt-2 leading-snug text-amber-950">
            {isMoscaBreached
              ? 'Post-Quantum Migration Advisory'
              : 'Within Protected Horizon'}
          </div>
          <p className="text-xs text-amber-800 mt-1 line-clamp-2">
            {isMoscaBreached
              ? 'Data shelf-life extends past projected quantum arrival date.'
              : `Margin: +${mosca?.margin_years}y · Secure execution window`}
          </p>
          <div className="mt-2 text-[11px] text-amber-800 font-mono font-medium">
            Margin: <span className="font-bold text-amber-950">{mosca?.margin_years}y</span> · Start by{' '}
            <span className="font-bold text-amber-950">{mosca?.must_start_by}</span>
          </div>
        </div>

        {/* Quantum Track Critical */}
        <div
          onClick={() => onNavigateToFindings('critical')}
          className="bg-rose-50/80 border border-rose-300 text-rose-950 rounded-2xl shadow-sm p-5 hover:shadow-md transition cursor-pointer group"
        >
          <div className="flex items-center justify-between text-rose-900 text-xs font-bold">
            <span>Shor Vulnerable Assets</span>
            <Atom className="w-4 h-4 text-rose-600 group-hover:scale-110 transition" />
          </div>
          <div className="text-3xl font-bold font-mono text-rose-700 mt-2 tracking-tight">
            {tracks.quantum_critical}
          </div>
          <p className="text-xs text-rose-800 mt-1">
            <strong className="text-rose-950">{tracks.quantum_vulnerable_assets}</strong> asymmetric algorithms flagged
          </p>
        </div>

        {/* Post-Quantum Adopted */}
        <div
          onClick={() => onNavigateToMigration()}
          className="bg-emerald-50/80 border border-emerald-300 text-emerald-950 rounded-2xl shadow-sm p-5 hover:shadow-md transition cursor-pointer group"
        >
          <div className="flex items-center justify-between text-emerald-900 text-xs font-bold">
            <span>PQ Adopted (FIPS 203/204)</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600 group-hover:scale-110 transition" />
          </div>
          <div className="text-3xl font-bold font-mono text-emerald-700 mt-2 tracking-tight">
            {tracks.post_quantum_adopted}
          </div>
          <p className="text-xs text-emerald-800 mt-1 font-medium">
            Standard ML-KEM / ML-DSA deployed
          </p>
        </div>
      </div>

      {/* Dual Section: Band Ramp Donut/Cards & Dual Track Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Severity Bands Distribution */}
        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">
                Severity Bands Distribution
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Ramp classification across standard risk ceilings (Rule 5.4)
              </p>
            </div>
            <span className="text-xs text-slate-500 font-mono font-bold">Rule 5.4</span>
          </div>

          <div className="space-y-3">
            {summary.by_band.map(({ band, count }) => {
              const theme = BAND_COLORS[band.toLowerCase()] || BAND_COLORS.informational;
              const pct = summary.total_findings > 0 ? (count / summary.total_findings) * 100 : 0;

              return (
                <div
                  key={band}
                  onClick={() => onNavigateToFindings(band)}
                  className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-300 hover:bg-slate-100 transition cursor-pointer"
                >
                  <div className="flex items-center justify-between text-xs mb-2">
                    <BandBadge band={band} size="sm" />
                    <span className="font-mono font-bold text-slate-900">
                      {count} <span className="text-slate-500 font-normal font-sans">({pct.toFixed(1)}%)</span>
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden border border-slate-300/60">
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
        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">
                Dual-Track Risk Architecture
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Separates immediate classical compliance from post-quantum threat horizon.
              </p>
            </div>
            <span className="text-xs text-slate-500 font-mono font-bold">Rule 6.3</span>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            Classical vulnerabilities (weak keys, deprecated ciphers) threaten immediate operational integrity today. Quantum vulnerabilities (RSA, ECC, Diffie-Hellman) threaten harvest-now-decrypt-later data across the Mosca horizon.
          </p>

          <div className="space-y-4 text-xs">
            {/* Classical Bar */}
            <div className="p-4 rounded-xl bg-amber-50/80 border border-amber-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-amber-900 font-bold flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-amber-700" />
                  Classical Track Criticalities
                </span>
                <span className="font-mono font-bold text-amber-950">{tracks.classical_critical} findings</span>
              </div>
              <div className="w-full bg-amber-200/80 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-amber-600 h-2.5 rounded-full"
                  style={{
                    width: `${Math.min(100, (tracks.classical_critical / (summary.total_findings || 1)) * 100 * 2)}%`,
                  }}
                />
              </div>
              <div className="text-[11px] text-amber-800 font-medium">
                Action horizon: Immediate compliance / patch cycle
              </div>
            </div>

            {/* Quantum Bar */}
            <div className="p-4 rounded-xl bg-rose-50/80 border border-rose-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-rose-900 font-bold flex items-center gap-1.5">
                  <Atom className="w-4 h-4 text-rose-600" />
                  Quantum Track Criticalities (Shor Vulnerable)
                </span>
                <span className="font-mono font-bold text-rose-950">{tracks.quantum_critical} findings</span>
              </div>
              <div className="w-full bg-rose-200/80 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-rose-600 h-2.5 rounded-full"
                  style={{
                    width: `${Math.min(100, (tracks.quantum_critical / (summary.total_findings || 1)) * 100 * 2)}%`,
                  }}
                />
              </div>
              <div className="text-[11px] text-rose-800 font-medium">
                Action horizon: Must migrate before CRQC horizon ({mosca?.must_start_by})
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Top Cryptographic Risks Table */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">
              Top Cryptographic Risk Vector Highlights
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              Click any finding row to inspect server-side factor attribution (Rule 6.2)
            </p>
          </div>
          <button
            onClick={() => onNavigateToFindings()}
            className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1.5 transition cursor-pointer"
          >
            <span>View All ({summary.total_findings})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-300">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-300 bg-slate-100 text-slate-700 uppercase tracking-wider text-xs font-bold sticky top-0">
                <th className="py-3 px-4">Band</th>
                <th className="py-3 px-4">Algorithm</th>
                <th className="py-3 px-4">Location & Surface</th>
                <th className="py-3 px-4 text-right">Quantum Risk</th>
                <th className="py-3 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {summary.top_risks.map((item, idx) => (
                <tr
                  key={item.id || idx}
                  onClick={() => setSelectedFinding(item)}
                  className="hover:bg-slate-50 cursor-pointer transition"
                >
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    {item.risk && <BandBadge band={item.risk.band} size="sm" />}
                  </td>
                  <td className="py-3.5 px-4 font-bold text-slate-900">
                    {item.asset?.canonical_name || item.symbol || 'Cryptographic Finding'}
                  </td>
                  <td className="py-3.5 px-4 text-slate-600 max-w-md truncate">
                    <span className="text-indigo-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 font-mono font-semibold text-xs">
                      {item.file_path}
                      {item.line_start ? `:${item.line_start}` : ''}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right font-bold text-rose-700 font-mono text-xs">
                    {item.risk?.quantum_risk ?? 0}/100
                  </td>
                  <td className="py-3.5 px-4 text-center whitespace-nowrap">
                    <span className="inline-flex items-center px-3 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white border border-indigo-200 font-bold text-xs transition cursor-pointer">
                      Inspect
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Drawer */}
      <FindingDetailDrawer
        scanId={summary.scan_id}
        finding={selectedFinding}
        onClose={() => setSelectedFinding(null)}
      />
    </div>
  );
};
