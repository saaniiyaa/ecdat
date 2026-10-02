import React, { useState, useEffect, useCallback } from 'react';
import { useScan } from '../context/ScanContext';
import { ecdatApi } from '../api/endpoints';
import { MoscaSimulateResponse } from '../types/api';
import { BandBadge } from '../components/common/BandBadge';
import {
  Clock,
  Sliders,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
  RefreshCw,
  FileCode,
  ShieldX,
  ShieldAlert,
} from 'lucide-react';

export const MoscaSimulator: React.FC = () => {
  const { activeScanId } = useScan();

  // Inputs: X (secrecy lifetime), Y (migration years), Z (CRQC arrival horizon)
  const [xYears, setXYears] = useState<number>(15);
  const [yYears, setYYears] = useState<number>(4);
  const [zYears, setZYears] = useState<number>(10);
  const [scope, setScope] = useState<string>('all');

  const [result, setResult] = useState<MoscaSimulateResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const runSimulation = useCallback(async () => {
    if (!activeScanId) return;
    setLoading(true);
    setError(null);
    try {
      // RULE 1: Server computes all Mosca mathematics
      const res = await ecdatApi.simulateMosca(activeScanId, {
        x_years: xYears,
        y_years: yYears,
        z_years: zYears,
        scope: scope === 'all' ? undefined : scope,
      });
      setResult(res.data);
    } catch (err: any) {
      setError(err.message || 'Simulation query failed');
    } finally {
      setLoading(false);
    }
  }, [activeScanId, xYears, yYears, zYears, scope]);

  useEffect(() => {
    runSimulation();
  }, [runSimulation]);

  const applyPreset = (preset: 'baseline' | 'conservative' | 'accelerated' | 'banking') => {
    if (preset === 'baseline') {
      setXYears(15);
      setYYears(4);
      setZYears(10);
    } else if (preset === 'conservative') {
      setXYears(10);
      setYYears(3);
      setZYears(15);
    } else if (preset === 'accelerated') {
      setXYears(20);
      setYYears(5);
      setZYears(7);
    } else if (preset === 'banking') {
      setXYears(25);
      setYYears(6);
      setZYears(8);
    }
  };

  if (!activeScanId) {
    return (
      <div className="max-w-4xl mx-auto p-12 text-center space-y-4">
        <ShieldAlert className="w-12 h-12 text-slate-500 mx-auto" />
        <h2 className="text-xl font-bold font-mono text-slate-200">No Scan Selected</h2>
        <p className="text-sm text-slate-400 font-mono">
          Select or launch a scan to simulate Mosca harvest-now-decrypt-later horizons.
        </p>
      </div>
    );
  }

  const isBreached = result?.state === 'breached';

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
      {/* Title */}
      <div className="border-b border-slate-800/80 pb-5">
        <div className="flex items-center gap-2.5">
          <Clock className="w-6 h-6 text-sky-400" />
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
            Mosca's Theorem Simulator (X + Y &gt; Z)
          </h1>
        </div>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Calculates whether your data will remain protected before quantum computers arrive.
        </p>
      </div>

      {/* Preset Pills */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-400 text-[11px] uppercase font-semibold mr-1">Stored Scenarios:</span>
        <button
          onClick={() => applyPreset('baseline')}
          className="px-3.5 py-1.5 rounded-xl border border-slate-700/70 bg-slate-800/60 hover:bg-slate-700/60 text-slate-200 transition font-medium shadow-sm"
        >
          Baseline (X=15y, Y=4y, Z=10y)
        </button>
        <button
          onClick={() => applyPreset('conservative')}
          className="px-3.5 py-1.5 rounded-xl border border-slate-700/70 bg-slate-800/60 hover:bg-slate-700/60 text-slate-200 transition font-medium shadow-sm"
        >
          Conservative (X=10y, Y=3y, Z=15y)
        </button>
        <button
          onClick={() => applyPreset('accelerated')}
          className="px-3.5 py-1.5 rounded-xl border border-slate-700/70 bg-slate-800/60 hover:bg-slate-700/60 text-slate-200 transition font-medium shadow-sm"
        >
          Accelerated CRQC (X=20y, Y=5y, Z=7y)
        </button>
        <button
          onClick={() => applyPreset('banking')}
          className="px-3.5 py-1.5 rounded-xl border border-slate-700/70 bg-slate-800/60 hover:bg-slate-700/60 text-slate-200 transition font-medium shadow-sm"
        >
          Sovereign Banking (X=25y, Y=6y, Z=8y)
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Controls Column */}
        <div className="lg:col-span-5 p-6 rounded-2xl bg-slate-800/40 border border-slate-700/60 shadow-sm backdrop-blur-sm space-y-6">
          <div className="flex items-center justify-between border-b border-slate-700/50 pb-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-200 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-sky-400" />
              What-If Parameter Controls
            </h3>
            {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-400" />}
          </div>

          {/* Slider X */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label className="text-slate-300 font-medium">X: Data Secrecy Shelf-Life</label>
              <span className="text-sky-400 font-semibold bg-slate-900/80 px-2.5 py-0.5 rounded-lg border border-slate-700/60 font-mono">
                {xYears} Years
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="40"
              step="1"
              value={xYears}
              onChange={(e) => setXYears(Number(e.target.value))}
              className="w-full accent-sky-500 cursor-pointer"
            />
            <p className="text-[11px] text-slate-400 font-sans">
              How many years must sensitive transaction, citizen, or proprietary data remain secure?
            </p>
          </div>

          {/* Slider Y */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label className="text-slate-300 font-medium">Y: Migration Timeline Duration</label>
              <span className="text-amber-400 font-semibold bg-slate-900/80 px-2.5 py-0.5 rounded-lg border border-slate-700/60 font-mono">
                {yYears} Years
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="15"
              step="1"
              value={yYears}
              onChange={(e) => setYYears(Number(e.target.value))}
              className="w-full accent-amber-500 cursor-pointer"
            />
            <p className="text-[11px] text-slate-400 font-sans">
              Estimated engineering & governance duration to transition systems to PQC standards.
            </p>
          </div>

          {/* Slider Z */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label className="text-slate-300 font-medium">Z: Cryptanalytically Relevant Quantum Arrival (CRQC)</label>
              <span className="text-indigo-400 font-semibold bg-slate-900/80 px-2.5 py-0.5 rounded-lg border border-slate-700/60 font-mono">
                {zYears} Years
              </span>
            </div>
            <input
              type="range"
              min="3"
              max="25"
              step="1"
              value={zYears}
              onChange={(e) => setZYears(Number(e.target.value))}
              className="w-full accent-indigo-500 cursor-pointer"
            />
            <p className="text-[11px] text-slate-400 font-sans">
              Years until an adversary possesses a CRQC capable of breaking RSA/ECC (Shor's algorithm).
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-700/50 text-xs text-slate-300">
            <span className="font-semibold text-slate-200">Rule 1 Architecture Notice:</span>
            <p className="text-[11px] text-slate-400 mt-1">
              All inequalities, dates, margins, and affected findings are evaluated dynamically by the backend risk engine.
            </p>
          </div>
        </div>

        {/* Results Column */}
        <div className="lg:col-span-7 space-y-6">
          {error ? (
            <div className="p-6 rounded-2xl bg-rose-950/20 border border-rose-500/30 text-rose-300 text-xs">
              Simulation error: {error}
            </div>
          ) : !result ? (
            <div className="p-12 text-center text-slate-400">
              Running simulation against scan inventory...
            </div>
          ) : (
            <div className="space-y-6">
              {/* Verdict Card - Executive Status Presentation */}
              <div
                className={`p-6 rounded-2xl border transition shadow-sm backdrop-blur-sm ${
                  isBreached
                    ? 'bg-amber-500/10 border-amber-500/30'
                    : 'bg-emerald-500/10 border-emerald-500/30'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                  <div className="flex items-start gap-3">
                    {isBreached ? (
                      <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" />
                    ) : (
                      <CheckCircle className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <span className="text-xs uppercase font-medium tracking-wider text-slate-400">
                        Strategic Mosca Verdict
                      </span>
                      <h2
                        className={`text-xl font-bold ${
                          isBreached ? 'text-amber-300' : 'text-emerald-400'
                        }`}
                      >
                        {isBreached
                          ? 'Action Required: Post-Quantum Migration Recommended'
                          : 'Within Safe Horizon: System Protected'}
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {isBreached
                          ? 'Data confidentiality shelf-life extends into the projected quantum threat horizon.'
                          : 'Migration timeline finishes before projected quantum capability arrival.'}
                      </p>
                      <div className="text-[11px] font-mono text-slate-300 mt-1">
                        Equation State: <span className="font-semibold uppercase">{result.state}</span> (X + Y = {result.x_plus_y}y vs Z = {result.z_years}y)
                      </div>
                    </div>
                  </div>

                  <div className="text-left sm:text-right font-mono bg-slate-900/60 p-3 rounded-xl border border-slate-700/50">
                    <span className="text-xs text-slate-400 block font-sans">Margin</span>
                    <span
                      className={`text-2xl font-bold ${
                        isBreached ? 'text-amber-400' : 'text-emerald-400'
                      }`}
                    >
                      {result.margin_years > 0 ? `+${result.margin_years}` : result.margin_years}y
                    </span>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-700/50 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-slate-300 font-mono">
                    <span className="font-sans">Migration Must Start By:</span>
                    <span className="text-base font-bold text-sky-400">{result.must_start_by}</span>
                  </div>
                  <p className="text-slate-300 leading-relaxed font-sans text-xs">
                    {result.narrative}
                  </p>
                </div>
              </div>

              {/* Impact Breakdown Cards */}
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="p-4 rounded-2xl bg-slate-800/40 border border-slate-700/60 shadow-sm backdrop-blur-sm">
                  <span className="text-slate-400 text-xs block font-medium">Affected Findings</span>
                  <span className="text-2xl font-bold text-slate-100 mt-1 block tracking-tight font-mono">
                    {result.affected_findings}
                  </span>
                  <span className="text-slate-400 text-[11px]">Shor-vulnerable artefacts</span>
                </div>

                <div className="p-4 rounded-2xl bg-slate-800/40 border border-slate-700/60 shadow-sm backdrop-blur-sm">
                  <span className="text-slate-400 text-xs block font-medium">Affected Assets</span>
                  <span className="text-2xl font-bold text-slate-100 mt-1 block tracking-tight font-mono">
                    {result.affected_assets}
                  </span>
                  <span className="text-slate-400 text-[11px]">Algorithms & Keys</span>
                </div>
              </div>

              {/* Affected Files List */}
              {result.affected_file_paths && result.affected_file_paths.length > 0 && (
                <div className="p-5 rounded-2xl bg-slate-800/40 border border-slate-700/60 shadow-sm backdrop-blur-sm space-y-3 text-xs">
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="font-semibold uppercase tracking-wider text-[11px]">
                      Files Exposed to Harvest-Now-Decrypt-Later ({result.affected_file_paths.length})
                    </span>
                  </div>

                  <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                    {result.affected_file_paths.map((p, idx) => (
                      <div
                        key={idx}
                        className="px-3.5 py-2 rounded-xl bg-slate-900/70 border border-slate-700/50 text-slate-300 flex items-center gap-2"
                      >
                        <FileCode className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span className="truncate font-mono text-[11px]">{p}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
