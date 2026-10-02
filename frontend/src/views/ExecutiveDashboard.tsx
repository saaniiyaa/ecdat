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
        <div className="w-16 h-16 rounded-2xl bg-surface-2 border border-border flex items-center justify-center mx-auto text-accent shadow-card">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-text-main">No Scan Target Selected</h2>
        <p className="text-sm text-text-muted max-w-md mx-auto">
          Select a registered scan target from the top bar or launch a new discovery scan across your estate.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-12 text-center space-y-4">
        <RefreshCw className="w-8 h-8 text-accent animate-spin mx-auto" />
        <p className="text-sm font-semibold text-text-muted">Loading cryptographic command center synthesis...</p>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="max-w-4xl mx-auto p-8 rounded-card bg-danger-subtle border border-danger-border text-danger text-xs font-mono">
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-text-main tracking-tight">
              Executive Cryptographic Posture
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-accent-subtle text-accent border border-accent-border text-xs font-bold font-mono">
              {summary.policy_pack_version || 'pp-2026.09'}
            </span>
          </div>
          <p className="text-xs text-text-muted mt-1 font-mono">
            Target: <span className="text-text-main font-semibold">{activeScan?.target_uri || activeScan?.name}</span> ·
            Scan ID: <span className="text-text-dim">{summary.scan_id.substring(0, 8)}...</span> ·
            Engine: {activeScan?.engine_version || '1.0.0'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onNavigateToMosca}
            className="px-4 py-2 rounded-xl border border-border bg-surface-2 hover:bg-surface-3 text-xs font-bold text-text-main shadow-sm transition cursor-pointer"
          >
            Simulate Mosca Horizons
          </button>
          <button
            onClick={onNavigateToMigration}
            className="px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-bg font-bold text-xs shadow-sm transition cursor-pointer"
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
      <div className="p-6 rounded-card bg-surface border border-border shadow-card cipher-hex-pattern">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-accent" />
              <h2 className="text-base font-bold text-text-main">
                Estate Cryptographic Posture Score
              </h2>
              <HelpTooltip
                title="Cryptographic Health Gauge"
                content="Deterministic score evaluating quantum and classical exposure. Accounts for Shor-vulnerable keys, legacy ciphers, and NIST FIPS 203/204/205 adoption."
              />
            </div>
            <p className="text-xs text-text-muted mt-0.5">
              Automated evaluation of post-quantum readiness across scanned inventory
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-3xl font-bold font-mono text-text-main tracking-tight">
                {healthScore}
                <span className="text-lg text-text-dim font-normal font-sans">/100</span>
              </div>
              <span
                className={`inline-block text-xs font-bold px-2.5 py-0.5 rounded-full border ${
                  healthScore >= 90
                    ? 'bg-accent-subtle text-accent border-accent-border'
                    : healthScore >= 70
                    ? 'bg-warning-subtle text-warning border-warning-border'
                    : 'bg-danger-subtle text-danger border-danger-border'
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
        <div className="w-full bg-surface-2 rounded-full h-3.5 overflow-hidden border border-border/60">
          <div
            className={`h-3.5 rounded-full transition-all duration-700 ${
              healthScore >= 90
                ? 'bg-accent'
                : healthScore >= 70
                ? 'bg-warning'
                : 'bg-danger'
            }`}
            style={{ width: `${healthScore}%` }}
          />
        </div>

        {/* Indicators */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 pt-3 border-t border-border/60 text-xs text-text-muted">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-accent shrink-0" />
            <span>
              Safe / PQ Standard: <strong className="text-text-main">{tracks.post_quantum_adopted}</strong> assets
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-warning shrink-0" />
            <span>
              Horizon Advisory: <strong className="text-text-main">{Math.max(0, tracks.quantum_vulnerable_assets - tracks.quantum_critical)}</strong> assets
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-danger shrink-0" />
            <span>
              Quantum Critical: <strong className="text-danger">{tracks.quantum_critical}</strong> assets
            </span>
          </div>
        </div>
      </div>

      {/* Top 4 KPI Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Findings */}
        <div
          onClick={() => onNavigateToFindings()}
          className="p-5 rounded-card bg-surface border border-border hover:border-accent/40 transition cursor-pointer group shadow-card"
        >
          <div className="flex items-center justify-between text-text-muted text-xs font-semibold">
            <span>Cryptographic Findings</span>
            <Layers className="w-4 h-4 text-accent group-hover:scale-110 transition" />
          </div>
          <div className="text-3xl font-bold font-mono text-text-main mt-2 tracking-tight">
            {summary.total_findings}
          </div>
          <p className="text-xs text-text-muted mt-1">
            Across <strong className="text-text-main">{summary.total_assets}</strong> unique cryptographic assets
          </p>
        </div>

        {/* Mosca Horizon KPI */}
        <div
          onClick={onNavigateToMosca}
          className={`p-5 rounded-card border transition cursor-pointer group shadow-card ${
            isMoscaBreached
              ? 'bg-warning-subtle/40 border-warning-border'
              : 'bg-accent-subtle/40 border-accent-border'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className={isMoscaBreached ? 'text-warning font-bold' : 'text-accent font-bold'}>
              Mosca Horizon (X + Y &gt; Z)
            </span>
            <Clock
              className={`w-4 h-4 ${
                isMoscaBreached ? 'text-warning' : 'text-accent'
              } group-hover:scale-110 transition`}
            />
          </div>
          <div
            className={`text-base font-bold mt-2 leading-snug ${
              isMoscaBreached ? 'text-warning' : 'text-accent'
            }`}
          >
            {isMoscaBreached
              ? 'Post-Quantum Migration Advisory'
              : 'Within Protected Horizon'}
          </div>
          <p className="text-xs text-text-muted mt-1 line-clamp-2">
            {isMoscaBreached
              ? 'Data shelf-life extends past projected quantum arrival date.'
              : `Margin: +${mosca?.margin_years}y · Secure execution window`}
          </p>
          <div className="mt-2 text-[11px] text-text-dim font-mono">
            Margin: <span className="font-bold text-text-main">{mosca?.margin_years}y</span> · Start by{' '}
            <span className="font-bold text-text-main">{mosca?.must_start_by}</span>
          </div>
        </div>

        {/* Quantum Track Critical */}
        <div
          onClick={() => onNavigateToFindings('critical')}
          className="p-5 rounded-card bg-surface border border-border hover:border-danger/40 transition cursor-pointer group shadow-card"
        >
          <div className="flex items-center justify-between text-text-muted text-xs font-semibold">
            <span>Shor Vulnerable Assets</span>
            <Atom className="w-4 h-4 text-danger group-hover:scale-110 transition" />
          </div>
          <div className="text-3xl font-bold font-mono text-danger mt-2 tracking-tight">
            {tracks.quantum_critical}
          </div>
          <p className="text-xs text-text-muted mt-1">
            <strong className="text-text-main">{tracks.quantum_vulnerable_assets}</strong> asymmetric algorithms flagged
          </p>
        </div>

        {/* Post-Quantum Adopted */}
        <div
          onClick={() => onNavigateToMigration()}
          className="p-5 rounded-card bg-surface border border-border hover:border-accent/40 transition cursor-pointer group shadow-card"
        >
          <div className="flex items-center justify-between text-text-muted text-xs font-semibold">
            <span>PQ Adopted (FIPS 203/204)</span>
            <ShieldCheck className="w-4 h-4 text-accent group-hover:scale-110 transition" />
          </div>
          <div className="text-3xl font-bold font-mono text-accent mt-2 tracking-tight">
            {tracks.post_quantum_adopted}
          </div>
          <p className="text-xs text-text-muted mt-1">
            Standard ML-KEM / ML-DSA deployed
          </p>
        </div>
      </div>

      {/* Dual Section: Band Ramp Donut/Cards & Dual Track Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Severity Bands Distribution */}
        <div className="p-6 rounded-card bg-surface border border-border shadow-card space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-text-main">
                Severity Bands Distribution
              </h3>
              <p className="text-xs text-text-muted mt-0.5">
                Ramp classification across standard risk ceilings (Rule 5.4)
              </p>
            </div>
            <span className="text-xs text-text-dim font-mono">Rule 5.4</span>
          </div>

          <div className="space-y-3">
            {summary.by_band.map(({ band, count }) => {
              const theme = BAND_COLORS[band.toLowerCase()] || BAND_COLORS.informational;
              const pct = summary.total_findings > 0 ? (count / summary.total_findings) * 100 : 0;

              return (
                <div
                  key={band}
                  onClick={() => onNavigateToFindings(band)}
                  className="p-3.5 rounded-xl bg-surface-2 border border-border hover:border-border transition cursor-pointer"
                >
                  <div className="flex items-center justify-between text-xs mb-2">
                    <BandBadge band={band} size="sm" />
                    <span className="font-mono font-bold text-text-main">
                      {count} <span className="text-text-dim font-normal font-sans">({pct.toFixed(1)}%)</span>
                    </span>
                  </div>
                  <div className="w-full bg-surface rounded-full h-2 overflow-hidden border border-border/40">
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
        <div className="p-6 rounded-card bg-surface border border-border shadow-card space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-text-main">
                Dual-Track Risk Architecture
              </h3>
              <p className="text-xs text-text-muted mt-0.5">
                Separates immediate classical compliance from post-quantum threat horizon.
              </p>
            </div>
            <span className="text-xs text-text-dim font-mono">Rule 6.3</span>
          </div>

          <p className="text-xs text-text-muted leading-relaxed">
            Classical vulnerabilities (weak keys, deprecated ciphers) threaten immediate operational integrity today. Quantum vulnerabilities (RSA, ECC, Diffie-Hellman) threaten harvest-now-decrypt-later data across the Mosca horizon.
          </p>

          <div className="space-y-4 text-xs">
            {/* Classical Bar */}
            <div className="p-4 rounded-xl bg-surface-2 border border-border space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-warning font-bold flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4" />
                  Classical Track Criticalities
                </span>
                <span className="font-mono font-bold text-text-main">{tracks.classical_critical} findings</span>
              </div>
              <div className="w-full bg-surface rounded-full h-2.5 overflow-hidden border border-border/40">
                <div
                  className="bg-warning h-2.5 rounded-full"
                  style={{
                    width: `${Math.min(100, (tracks.classical_critical / (summary.total_findings || 1)) * 100 * 2)}%`,
                  }}
                />
              </div>
              <div className="text-[11px] text-text-dim">
                Action horizon: Immediate compliance / patch cycle
              </div>
            </div>

            {/* Quantum Bar */}
            <div className="p-4 rounded-xl bg-surface-2 border border-border space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-accent-2 font-bold flex items-center gap-1.5">
                  <Atom className="w-4 h-4" />
                  Quantum Track Criticalities (Shor Vulnerable)
                </span>
                <span className="font-mono font-bold text-text-main">{tracks.quantum_critical} findings</span>
              </div>
              <div className="w-full bg-surface rounded-full h-2.5 overflow-hidden border border-border/40">
                <div
                  className="bg-accent-2 h-2.5 rounded-full"
                  style={{
                    width: `${Math.min(100, (tracks.quantum_critical / (summary.total_findings || 1)) * 100 * 2)}%`,
                  }}
                />
              </div>
              <div className="text-[11px] text-text-dim">
                Action horizon: Must migrate before CRQC horizon ({mosca?.must_start_by})
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Top Cryptographic Risks Table */}
      <div className="p-6 rounded-card bg-surface border border-border shadow-card space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-text-main">
              Top Cryptographic Risk Vector Highlights
            </h3>
            <p className="text-xs text-text-muted mt-0.5">
              Click any finding row to inspect server-side factor attribution (Rule 6.2)
            </p>
          </div>
          <button
            onClick={() => onNavigateToFindings()}
            className="text-xs font-bold text-accent hover:text-accent-hover flex items-center gap-1.5 transition cursor-pointer"
          >
            <span>View All ({summary.total_findings})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-text-muted uppercase tracking-wider text-[11px] font-bold sticky top-0">
                <th className="py-3 px-4">Band</th>
                <th className="py-3 px-4">Algorithm</th>
                <th className="py-3 px-4">Location & Surface</th>
                <th className="py-3 px-4 text-right">Quantum Risk</th>
                <th className="py-3 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {summary.top_risks.map((item, idx) => (
                <tr
                  key={item.id || idx}
                  onClick={() => setSelectedFinding(item)}
                  className="hover:bg-surface-2/60 cursor-pointer transition"
                >
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    {item.risk && <BandBadge band={item.risk.band} size="sm" />}
                  </td>
                  <td className="py-3.5 px-4 font-bold text-text-main">
                    {item.asset?.canonical_name || item.symbol || 'Cryptographic Finding'}
                  </td>
                  <td className="py-3.5 px-4 text-text-muted max-w-md truncate">
                    <span className="font-mono text-[11px]">
                      {item.file_path}
                      {item.line_start ? `:${item.line_start}` : ''}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right font-bold text-accent-2 font-mono">
                    {item.risk?.quantum_risk ?? 0}/100
                  </td>
                  <td className="py-3.5 px-4 text-center whitespace-nowrap">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-surface-2 text-accent hover:bg-surface-3 font-bold text-xs border border-border transition">
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
